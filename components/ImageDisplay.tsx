/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useRef, useEffect, useState, useCallback, MouseEvent } from 'react';
import type { Rect, TileData } from '../types';

interface ImageDisplayProps {
  tiles: Map<string, TileData>;
  worldSize: {width: number, height: number};
  tileSize: number;
  onInpaint: (worldRect: Rect, screenRect: Rect) => void;
  isBusy: boolean;
  pan: { x: number, y: number };
  zoom: number;
  onPanChange: (pan: { x: number, y: number }) => void;
  onZoomChange: (zoom: number) => void;
}

export const ImageDisplay: React.FC<ImageDisplayProps> = ({ 
  tiles,
  worldSize,
  tileSize,
  onInpaint,
  isBusy,
  pan,
  zoom,
  onPanChange,
  onZoomChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inferenceTimerRef = useRef<number | null>(null);
  
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  const getTransform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return { finalScale: 1, viewRectWorld: {x:0, y:0, w:0, h:0}, cssWidth: 0, cssHeight: 0 };
    
    const { width: cssWidth, height: cssHeight } = canvas.getBoundingClientRect();
    const finalScale = zoom;

    const viewRectWorld = {
      x: -pan.x / finalScale,
      y: -pan.y / finalScale,
      w: cssWidth / finalScale,
      h: cssHeight / finalScale,
    };

    return { finalScale, viewRectWorld, cssWidth, cssHeight };
  }, [zoom, pan]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas || worldSize.width === 0) return;
    
    const { finalScale, cssWidth, cssHeight } = getTransform();

    ctx.clearRect(0, 0, cssWidth, cssHeight);
    
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(finalScale, finalScale);
    
    const viewRectWorld = {
      x: -pan.x / finalScale,
      y: -pan.y / finalScale,
      w: cssWidth / finalScale,
      h: cssHeight / finalScale
    };
    
    const startTileX = Math.floor(viewRectWorld.x / tileSize);
    const endTileX = Math.ceil((viewRectWorld.x + viewRectWorld.w) / tileSize);
    const startTileY = Math.floor(viewRectWorld.y / tileSize);
    const endTileY = Math.ceil((viewRectWorld.y + viewRectWorld.h) / tileSize);
    
    const numWorldTilesX = Math.ceil(worldSize.width / tileSize);

    // Draw tiles
    for (let y = startTileY; y < endTileY; y++) {
      for (let x = startTileX; x < endTileX; x++) {
        const wrappedX = ((x % numWorldTilesX) + numWorldTilesX) % numWorldTilesX;
        const tile = tiles.get(`${wrappedX}:${y}`);
        if (tile) {
          ctx.drawImage(tile.image, x * tileSize, y * tileSize, tileSize, tileSize);
        }
      }
    }
    
    // Draw glow effect on enhanced tiles
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let y = startTileY; y < endTileY; y++) {
        for (let x = startTileX; x < endTileX; x++) {
            const wrappedX = ((x % numWorldTilesX) + numWorldTilesX) % numWorldTilesX;
            const tile = tiles.get(`${wrappedX}:${y}`);
            if (tile?.isEnhanced) {
                const gradient = ctx.createRadialGradient(
                    x * tileSize + tileSize / 2, y * tileSize + tileSize / 2, 0,
                    x * tileSize + tileSize / 2, y * tileSize + tileSize / 2, tileSize * 0.75
                );
                gradient.addColorStop(0, 'rgba(110, 231, 183, 0.2)');
                gradient.addColorStop(1, 'rgba(110, 231, 183, 0)');
                ctx.fillStyle = gradient;
                ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
            }
        }
    }
    ctx.restore();

    ctx.restore();
  }, [tiles, zoom, pan, getTransform, tileSize, worldSize]);

  const triggerInference = useCallback(() => {
    if (isBusy || !canvasRef.current) return;
    
    const { viewRectWorld } = getTransform();
    
    // Inpaint Logic: Triggered only when zoomed in.
    if (zoom > 1.01) {
        const screenRect: Rect = { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
        onInpaint(viewRectWorld, screenRect);
    }
  }, [isBusy, getTransform, onInpaint, zoom]);

  const clearInferenceTimer = useCallback(() => {
    if (inferenceTimerRef.current) {
      clearTimeout(inferenceTimerRef.current);
      inferenceTimerRef.current = null;
    }
  }, []);

  const resetInferenceTimer = useCallback(() => {
    clearInferenceTimer();
    inferenceTimerRef.current = window.setTimeout(triggerInference, 1500);
  }, [triggerInference, clearInferenceTimer]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const resizeObserver = new ResizeObserver(() => {
        const parent = canvas.parentElement;
        if (parent) {
            const { width, height } = parent.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            canvas.width = width * dpr;
            canvas.height = height * dpr;
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.scale(dpr, dpr);
            }
            draw();
        }
    });
    
    if (canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement);
    }
    
    return () => {
        resizeObserver.disconnect();
    };
  }, [draw]);

  useEffect(() => {
    draw();
  }, [pan, zoom, draw, tiles]);

  const getMousePos = (e: React.MouseEvent<HTMLCanvasElement> | WheelEvent): { x: number; y: number } => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (isBusy) return;
    clearInferenceTimer();
  
    const isZoomingIn = e.deltaY < 0;
    const zoomIntensity = 0.1;
    const zoomFactor = isZoomingIn ? Math.exp(zoomIntensity) : Math.exp(-zoomIntensity);
    let newZoom = Math.max(0.1, Math.min(zoom * zoomFactor, 50));
  
    // Recalculate pan to keep zoom centered on the mouse cursor
    const pos = getMousePos(e);
    const newPanX = pan.x - (pos.x - pan.x) * (zoomFactor - 1);
    let newPanY = pan.y - (pos.y - pan.y) * (zoomFactor - 1);
    
    // Clamp vertical pan
    const canvas = canvasRef.current;
    if (canvas) {
      const { height: cssHeight } = canvas.getBoundingClientRect();
      const worldPixelHeight = worldSize.height * newZoom;
      if (worldPixelHeight > cssHeight) {
        newPanY = Math.max(Math.min(newPanY, 0), cssHeight - worldPixelHeight);
      } else {
        newPanY = (cssHeight - worldPixelHeight) / 2; // Center if smaller than viewport
      }
    }
    
    onZoomChange(newZoom);
    onPanChange({ x: newPanX, y: newPanY });
  
    if (isZoomingIn) {
      resetInferenceTimer();
    }
  };
  
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isBusy || e.button !== 0) return;
    e.preventDefault();
    clearInferenceTimer();
    setIsPanning(true);
    const pos = getMousePos(e);
    setPanStart({
        x: pos.x - pan.x,
        y: pos.y - pan.y
    });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning) {
        clearInferenceTimer();
        const pos = getMousePos(e);
        let newPanY = pos.y - panStart.y;
        
        // Clamp vertical pan
        const canvas = canvasRef.current;
        if (canvas) {
          const { height: cssHeight } = canvas.getBoundingClientRect();
          const worldPixelHeight = worldSize.height * zoom;
          if (worldPixelHeight > cssHeight) {
            newPanY = Math.max(Math.min(newPanY, 0), cssHeight - worldPixelHeight);
          } else {
            newPanY = (cssHeight - worldPixelHeight) / 2; // Center if smaller than viewport
          }
        }
        
        onPanChange({
            x: pos.x - panStart.x,
            y: newPanY,
        });
    }
  };

  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
      if (!isBusy) {
          resetInferenceTimer();
      }
    }
  };
  
  const handleMouseLeave = () => {
    if (isPanning) {
      setIsPanning(false);
    }
  };
  
  const stopPropagation = (e: MouseEvent) => e.stopPropagation();

  const handleZoomIn = (e: React.MouseEvent) => {
    stopPropagation(e);
    clearInferenceTimer();
    onZoomChange(Math.min(zoom * 1.25, 50));
    resetInferenceTimer();
  };

  const handleZoomOut = (e: React.MouseEvent) => {
    stopPropagation(e);
    clearInferenceTimer();
    onZoomChange(Math.max(0.1, zoom / 1.25));
  };

  const handleResetZoom = (e: React.MouseEvent) => {
    stopPropagation(e);
    clearInferenceTimer();
    
    const canvas = canvasRef.current;
    if (canvas) {
      const { height: cssHeight } = canvas.getBoundingClientRect();
      const worldPixelHeight = worldSize.height * 1.0;
      const newPanY = worldPixelHeight > cssHeight ? 0 : (cssHeight - worldPixelHeight) / 2;
      onPanChange({ x: 0, y: newPanY });
    } else {
      onPanChange({ x: 0, y: 0 });
    }
    
    onZoomChange(1.0);
    resetInferenceTimer();
  };
  
  const handleSnapshot = useCallback(() => {
    if (canvasRef.current) {
      const dataUrl = canvasRef.current.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = 'infinizoom-snapshot.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) return;
      if (document.activeElement && ['INPUT', 'TEXTAREA', 'BUTTON'].includes(document.activeElement.tagName)) {
        return;
      }
      if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSnapshot();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleSnapshot]);
  
  const getCursor = () => {
    if (isBusy) return 'cursor-wait';
    if (isPanning) return 'cursor-grabbing';
    return 'cursor-grab';
  }

  return (
    <div className="w-full h-full relative group">
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
        className={`max-w-full max-h-full w-full h-full transition-[filter] duration-700 ${isBusy ? 'filter brightness-50' : 'filter brightness-100'} ${getCursor()}`}
      />
       <div 
        className="absolute top-4 right-4 z-10 flex flex-col gap-1 bg-black/50 p-1 rounded-md border border-green-500/60 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
        onMouseDown={stopPropagation}
        onClick={stopPropagation}
       >
        <button 
          onClick={handleZoomIn} 
          disabled={isBusy || zoom >= 50} 
          className="px-2 py-0.5 text-lg text-green-400 disabled:text-gray-500 disabled:cursor-not-allowed hover:enabled:bg-green-500/20 rounded"
          aria-label="Zoom In" title="Zoom In"
        >
          +
        </button>
        <button 
          onClick={handleZoomOut} 
          disabled={isBusy}
          className="px-2 py-0.5 text-lg text-green-400 disabled:text-gray-500 disabled:cursor-not-allowed hover:enabled:bg-green-500/20 rounded"
          aria-label="Zoom Out" title="Zoom Out"
        >
          -
        </button>
        <button 
          onClick={handleResetZoom} 
          disabled={isBusy || (zoom === 1 && pan.x === 0 && pan.y === 0)} 
          className="px-2 py-0.5 text-xs text-green-400 disabled:text-gray-500 disabled:cursor-not-allowed hover:enabled:bg-green-500/20 rounded"
          aria-label="Reset View" title="Reset View"
        >
          Reset
        </button>
        <button
          onClick={handleSnapshot}
          disabled={isBusy}
          className="px-2 py-0.5 text-sm text-green-400 disabled:text-gray-500 disabled:cursor-not-allowed hover:enabled:bg-green-500/20 rounded"
          aria-label="Snapshot Viewport" title="Snapshot (S)"
        >
         📸
        </button>
      </div>
    </div>
  );
};