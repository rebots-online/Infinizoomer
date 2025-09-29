/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React, { useState, useCallback, useEffect, useRef, MouseEvent } from 'react';
import exifr from 'exifr';
import { DropZone } from './components/DropZone';
import { ImageDisplay } from './components/ImageDisplay';
import { PixelDissolve } from './components/PixelDissolve';
import { StatusBar } from './components/StatusBar';
import { SelectionAnimator } from './components/SelectionAnimator';
import { CameraView } from './components/CameraView';
import type { Rect, TileData, Capture, Camera, GPSCoordinates } from './types';
import { AppState, CaptureType, LocationStatus } from './types';
import { cropImage } from './utils/imageUtils';
import { serviceEnhance } from './utils/serviceEnhance';
import { serviceCompareScenes } from './utils/serviceCompareScenes';
import { calculateDistance } from './utils/gpsUtils';
import { useLocation } from './hooks/useLocation';

const TILE_SIZE = 512;
const GPS_DISTANCE_THRESHOLD_METERS = 100;

const defaultCamera: Camera = {
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  fov: 90,
};

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [tiles, setTiles] = useState<Map<string, TileData>>(new Map());
  const [worldSize, setWorldSize] = useState<{width: number, height: number}>({width: 0, height: 0});
  
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1.0);

  const [enhancementJob, setEnhancementJob] = useState<{worldRect: Rect, screenRect: Rect} | null>(null);
  const [stitchedEnhanceImage, setStitchedEnhanceImage] = useState<{src:string, worldRect:Rect} | null>(null);
  const [enhancedResult, setEnhancedResult] = useState<{src:string, worldRect:Rect} | null>(null);
  
  const [showBananaBanner, setShowBananaBanner] = useState<boolean>(false);
  const [hasFoundBanana, setHasFoundBanana] = useState<boolean>(false);
  
  const [isDefaultWorld, setIsDefaultWorld] = useState(false);
  
  const imageObjectURLRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { locationStatus, currentCoordinates } = useLocation();

  const tileizeImage = useCallback(async (capture: Capture) => {
    const img = capture.image;
    const newTiles = new Map<string, TileData>();
    const numCols = Math.ceil(img.naturalWidth / TILE_SIZE);
    const numRows = Math.ceil(img.naturalHeight / TILE_SIZE);

    for (let y = 0; y < numRows; y++) {
        for (let x = 0; x < numCols; x++) {
            const cropRect: Rect = {
                x: x * TILE_SIZE,
                y: y * TILE_SIZE,
                w: Math.min(TILE_SIZE, img.naturalWidth - x * TILE_SIZE),
                h: Math.min(TILE_SIZE, img.naturalHeight - y * TILE_SIZE),
            };

            if (cropRect.w > 0 && cropRect.h > 0) {
              const tileSrc = await cropImage(img, cropRect, cropRect.w, cropRect.h, false);
              const tileImage = new Image();
              
              const loadPromise = new Promise(resolve => {
                tileImage.onload = resolve;
              });
              tileImage.src = tileSrc;
              await loadPromise;

              newTiles.set(`${x}:${y}`, { image: tileImage, isEnhanced: false });
            }
        }
    }
    setWorldSize({width: img.naturalWidth, height: img.naturalHeight});
    setTiles(newTiles);
  }, []);

  const startNewWorld = useCallback((img: HTMLImageElement, gps?: GPSCoordinates, locationStatus?: LocationStatus) => {
    const newCapture: Capture = {
      id: `capture-${Date.now()}`,
      type: CaptureType.EQUIRECTANGULAR,
      image: img,
      camera: defaultCamera,
      gps,
      locationStatus,
    };

    setCaptures([newCapture]);
    tileizeImage(newCapture);
    setPan({x: 0, y: 0});
    setZoom(1);
    setIsDefaultWorld(false); // This is now a user-defined world
    setHasFoundBanana(false); // Reset easter egg for the new world
    setShowBananaBanner(false);
    setAppState(AppState.LOADED);
  }, [tileizeImage]);

  const handleNewCapture = useCallback(async (img: HTMLImageElement, gps?: GPSCoordinates, locationStatus?: LocationStatus) => {
    if (captures.length === 0) {
        startNewWorld(img, gps, locationStatus);
        return;
    }

    const baseCapture = captures[0];
    let isNewWorldGps = false;
    if (gps) {
        if (baseCapture.gps) {
            const distance = calculateDistance(gps, baseCapture.gps);
            if (distance > GPS_DISTANCE_THRESHOLD_METERS) {
                isNewWorldGps = true;
            }
        } else if (isDefaultWorld) {
            isNewWorldGps = true;
        }
    }

    if (isNewWorldGps) {
        console.log("New world detected based on GPS data. Resetting world model.");
        startNewWorld(img, gps, locationStatus);
        return;
    }
    
    if (isDefaultWorld) {
        setAppState(AppState.ANALYZING);
        try {
            const isSameScene = await serviceCompareScenes(baseCapture.image, img);
            if (!isSameScene) {
                console.log("New world detected by visual analysis. Resetting world model.");
                startNewWorld(img, gps, locationStatus);
            } else {
                console.log("New capture is part of the current world. Adding.");
                const newCapture: Capture = {
                  id: `capture-${Date.now()}`,
                  type: CaptureType.PERSPECTIVE,
                  image: img,
                  camera: defaultCamera,
                  gps,
                  locationStatus,
                };
                setCaptures(prev => [...prev, newCapture]);
                setAppState(AppState.LOADED);
            }
        } catch (error) {
            console.error("Scene comparison failed:", error);
            const newCapture: Capture = {
              id: `capture-${Date.now()}`,
              type: CaptureType.PERSPECTIVE,
              image: img,
              camera: defaultCamera,
              gps,
              locationStatus,
            };
            setCaptures(prev => [...prev, newCapture]);
            setAppState(AppState.LOADED);
        }
    } else {
        const newCapture: Capture = {
            id: `capture-${Date.now()}`,
            type: CaptureType.PERSPECTIVE,
            image: img,
            camera: defaultCamera,
            gps,
            locationStatus,
        };
        setCaptures(prev => [...prev, newCapture]);
    }
  }, [captures, isDefaultWorld, startNewWorld]);

  const loadInitialImage = useCallback(async () => {
    if (imageObjectURLRef.current) {
      URL.revokeObjectURL(imageObjectURLRef.current);
      imageObjectURLRef.current = null;
    }

    setAppState(AppState.LOADING);
    try {
      const response = await fetch('https://www.gstatic.com/aistudio/starter-apps/enhance/living_room.png');
      if (!response.ok) {
        throw new Error(`Failed to fetch initial image: ${response.statusText}`);
      }
      const blob = await response.blob();
      const objectURL = URL.createObjectURL(blob);
      imageObjectURLRef.current = objectURL;

      const img = new Image();
      img.onload = () => {
        if (captures.length > 0) {
          if (imageObjectURLRef.current) {
            URL.revokeObjectURL(imageObjectURLRef.current);
            imageObjectURLRef.current = null;
          }
          return;
        }

        const newCapture: Capture = {
          id: `capture-default`,
          type: CaptureType.EQUIRECTANGULAR,
          image: img,
          camera: defaultCamera,
          // No GPS data for the default image
        };

        setCaptures([newCapture]);
        tileizeImage(newCapture);
        setPan({x: 0, y: 0});
        setZoom(1);
        setIsDefaultWorld(true);
        setAppState(AppState.LOADED);
      };
      img.onerror = () => {
        console.error("Image failed to load from object URL.");
        setAppState(AppState.IDLE);
        if (imageObjectURLRef.current) {
          URL.revokeObjectURL(imageObjectURLRef.current);
        }
      };
      img.src = objectURL;
    } catch (error) {
      console.error("Failed to load initial image:", error);
      setAppState(AppState.IDLE);
    }
  }, [captures.length, tileizeImage]);
  
  const resetState = useCallback(() => {
    setCaptures([]);
    setTiles(new Map());
    setShowBananaBanner(false);
    setEnhancementJob(null);
    setStitchedEnhanceImage(null);
    setEnhancedResult(null);
    setIsDefaultWorld(false);
    loadInitialImage();
  }, [loadInitialImage]);

  useEffect(() => {
    loadInitialImage();
    
    return () => {
      if (imageObjectURLRef.current) {
        URL.revokeObjectURL(imageObjectURLRef.current);
      }
    };
  }, [loadInitialImage]);

  const handleFileLoad = useCallback(async (file: File) => {
    if (!file || !file.type.startsWith('image/')) return;
    try {
        const exif = await exifr.parse(file);
        let gps: GPSCoordinates | undefined = undefined;
        if (exif && typeof exif.latitude === 'number' && typeof exif.longitude === 'number') {
            gps = { latitude: exif.latitude, longitude: exif.longitude };
            console.log('Found GPS data in image:', gps);
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                handleNewCapture(img, gps, gps ? LocationStatus.ACQUIRED : undefined);
            };
            img.src = e.target?.result as string;
        };
        reader.readAsDataURL(file);
    } catch (error) {
        console.warn("Could not parse EXIF data. Proceeding without GPS.", error);
        // Fallback for files without EXIF or parsing errors (e.g. PNGs)
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                handleNewCapture(img); // No GPS data
            };
            img.src = e.target?.result as string;
        };
        reader.readAsDataURL(file);
    }
  }, [handleNewCapture]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileLoad(e.target.files[0]);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };
  
  const handleUseDeviceCamClick = () => {
    setAppState(AppState.CAMERA_ACTIVE);
  };
  
  const handleCameraCapture = useCallback((img: HTMLImageElement) => {
    handleNewCapture(img, currentCoordinates ?? undefined, locationStatus);
  }, [handleNewCapture, currentCoordinates, locationStatus]);

  const handleCameraClose = () => {
      setAppState(AppState.LOADED);
  };

  const performEnhancement = useCallback(async () => {
    if (!stitchedEnhanceImage) return;

    try {
        const prompt = "Enhance this image, increasing its resolution and adding fine details. The enhancement must be consistent with the original image's content, style, and lighting. Do not add new objects.";
        const { imageSrc: enhancedStitchedSrc, foundTheBanana } = await serviceEnhance(stitchedEnhanceImage.src, prompt, hasFoundBanana);
        
        if (foundTheBanana) {
            setShowBananaBanner(true);
            setHasFoundBanana(true);
        }
        setEnhancedResult({src: enhancedStitchedSrc, worldRect: stitchedEnhanceImage.worldRect});

    } catch (error) {
        console.error("Enhancement failed:", error);
        setEnhancedResult({src: stitchedEnhanceImage.src, worldRect: stitchedEnhanceImage.worldRect}); // fallback to original
    } finally {
        setAppState(AppState.ENHANCED);
        setEnhancementJob(null);
    }
  }, [stitchedEnhanceImage, hasFoundBanana]);
  

  const handleInpaint = useCallback(async (worldRect: Rect, screenRect: Rect) => {
    if (appState !== AppState.LOADED) return;
    
    // 1. Find all tiles intersecting the worldRect
    const startTileX = Math.floor(worldRect.x / TILE_SIZE);
    const startTileY = Math.floor(worldRect.y / TILE_SIZE);
    const endTileX = Math.floor((worldRect.x + worldRect.w) / TILE_SIZE);
    const endTileY = Math.floor((worldRect.y + worldRect.h) / TILE_SIZE);

    const stitchedCanvas = document.createElement('canvas');
    const stitchedCtx = stitchedCanvas.getContext('2d');
    if (!stitchedCtx) return;

    const stitchedWorldRect: Rect = {
      x: startTileX * TILE_SIZE,
      y: startTileY * TILE_SIZE,
      w: (endTileX - startTileX + 1) * TILE_SIZE,
      h: (endTileY - startTileY + 1) * TILE_SIZE
    };
    
    stitchedCanvas.width = stitchedWorldRect.w;
    stitchedCanvas.height = stitchedWorldRect.h;

    for (let y = startTileY; y <= endTileY; y++) {
        for (let x = startTileX; x <= endTileX; x++) {
            const tile = tiles.get(`${x}:${y}`);
            if (tile) {
                const canvasX = (x * TILE_SIZE) - stitchedWorldRect.x;
                const canvasY = (y * TILE_SIZE) - stitchedWorldRect.y;
                stitchedCtx.drawImage(tile.image, canvasX, canvasY);
            }
        }
    }
    
    // The initial stitched image is ready for the animation
    const stitchedSrc = stitchedCanvas.toDataURL('image/png');

    // 2. Set all state needed for animation at once
    setStitchedEnhanceImage({src: stitchedSrc, worldRect: stitchedWorldRect});
    setEnhancementJob({worldRect, screenRect});
    setAppState(AppState.ENHANCING);

  }, [appState, tiles]);

  
  const handleEnhancementComplete = useCallback(async () => {
    if (!enhancedResult) return;

    const { src, worldRect } = enhancedResult;
    
    const enhancedImage = new Image();
    enhancedImage.onload = async () => {
        const startTileX = Math.floor(worldRect.x / TILE_SIZE);
        const startTileY = Math.floor(worldRect.y / TILE_SIZE);
        const endTileX = Math.floor((worldRect.x + worldRect.w) / TILE_SIZE);
        const endTileY = Math.floor((worldRect.y + worldRect.h) / TILE_SIZE);
        
        const updatedTiles = new Map<string, TileData>();

        for (let y = startTileY; y <= endTileY; y++) {
            for (let x = startTileX; x <= endTileX; x++) {
                const cropRect: Rect = {
                    x: (x * TILE_SIZE) - worldRect.x,
                    y: (y * TILE_SIZE) - worldRect.y,
                    w: TILE_SIZE,
                    h: TILE_SIZE
                };
                
                const tileSrc = await cropImage(enhancedImage, cropRect, TILE_SIZE, TILE_SIZE, false);
                const tileImage = new Image();
                
                const loadPromise = new Promise(resolve => { tileImage.onload = resolve; });
                tileImage.src = tileSrc;
                await loadPromise;

                updatedTiles.set(`${x}:${y}`, { image: tileImage, isEnhanced: true });
            }
        }
        
        setTiles(prevTiles => new Map([...prevTiles, ...updatedTiles]));
        
        // Reset state
        setStitchedEnhanceImage(null);
        setEnhancedResult(null);
        setAppState(AppState.LOADED);
    };
    enhancedImage.src = src;

  }, [enhancedResult]);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileLoad(e.dataTransfer.files[0]);
      e.dataTransfer.clearData();
    }
  };

  const stopPropagation = (ev:MouseEvent<HTMLButtonElement>)=>{
    ev.stopPropagation();
  }

  const isActionable = appState === AppState.LOADED;

  return (
    <div 
      className="fixed inset-0 bg-black flex flex-col items-center justify-center p-4"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {showBananaBanner && (
        <div className="absolute top-0 left-0 right-0 bg-yellow-400 text-black text-center p-2 z-20 font-bold text-lg animate-pulse flex items-center justify-center">
          <span>🍌 YOU FOUND THE NANO BANANA! 🍌</span>
          <button 
            onClick={() => setShowBananaBanner(false)} 
            className="absolute right-4 text-black hover:text-gray-700 text-2xl font-bold leading-none"
            aria-label="Dismiss"
          >
            &times;
          </button>
        </div>
      )}
      {appState === AppState.IDLE && <DropZone />}
      
      <div className="w-full h-full flex items-center justify-center relative">
        {tiles.size > 0 && ![AppState.ENHANCED, AppState.ENHANCING, AppState.CAMERA_ACTIVE].includes(appState) && (
          <ImageDisplay
            tiles={tiles}
            worldSize={worldSize}
            tileSize={TILE_SIZE}
            onInpaint={handleInpaint}
            isBusy={appState !== AppState.LOADED}
            pan={pan}
            zoom={zoom}
            onPanChange={setPan}
            onZoomChange={setZoom}
          />
        )}
      </div>

      {appState === AppState.CAMERA_ACTIVE && (
          <CameraView 
            onCapture={handleCameraCapture} 
            onClose={handleCameraClose} 
            locationStatus={locationStatus}
          />
      )}

      {appState === AppState.ENHANCING && enhancementJob && stitchedEnhanceImage && (
          <SelectionAnimator
              rect={enhancementJob.screenRect}
              finalRect={{ x:0, y:0, w: window.innerWidth, h: window.innerHeight}}
              src={stitchedEnhanceImage.src}
              onComplete={performEnhancement}
          />
      )}

      {appState === AppState.ENHANCED && stitchedEnhanceImage && enhancedResult && (
        <div className="absolute top-0 left-0 w-full h-full">
          <PixelDissolve
            lowResSrc={stitchedEnhanceImage.src}
            highResSrc={enhancedResult.src}
            onComplete={handleEnhancementComplete}
          />
        </div>
      )}

      {isActionable && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-black/50 p-2 rounded-md border border-green-500/60">
          <button 
            onClick={resetState}
            onMouseDownCapture={stopPropagation}
            className="px-3 py-1 text-green-400 hover:enabled:bg-green-500/20 rounded transition-colors"
          >
            Reset
          </button>
          <button 
            onClick={handleUploadClick}
            onMouseDownCapture={stopPropagation}
            className="px-3 py-1 text-green-400 hover:enabled:bg-green-500/20 rounded transition-colors"
          >
            Add Capture
          </button>
          <button 
            onClick={handleUseDeviceCamClick}
            onMouseDownCapture={stopPropagation}
            className="px-3 py-1 text-green-400 hover:enabled:bg-green-500/20 rounded transition-colors"
          >
            Use Device Cam
          </button>
        </div>
      )}

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        style={{ display: 'none' }}
        accept="image/*"
      />
      <StatusBar 
        state={appState} 
        isInitialState={isDefaultWorld}
        onAddCaptureClick={handleUploadClick}
        locationStatus={locationStatus}
      />
    </div>
  );
};

export default App;