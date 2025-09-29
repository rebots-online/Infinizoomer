/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { LocationStatus } from '../types';

interface CameraViewProps {
  onCapture: (image: HTMLImageElement) => void;
  onClose: () => void;
  locationStatus: LocationStatus;
}

const usePrevious = <T,>(value: T) => {
  const ref = useRef<T>();
  useEffect(() => {
    ref.current = value;
  });
  return ref.current;
};

export const CameraView: React.FC<CameraViewProps> = ({ onCapture, onClose, locationStatus }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoIntervalRef = useRef<number | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCapturingVideo, setIsCapturingVideo] = useState(false);
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error' | 'info'} | null>(null);
  const notificationTimerRef = useRef<number | null>(null);

  const prevLocationStatus = usePrevious(locationStatus);

  useEffect(() => {
    if (notificationTimerRef.current) {
      clearTimeout(notificationTimerRef.current);
    }
    if (prevLocationStatus === LocationStatus.REQUESTING && locationStatus === LocationStatus.ACQUIRED) {
      setNotification({ message: 'GPS Signal Acquired', type: 'success' });
    } else if (prevLocationStatus === LocationStatus.ACQUIRED && (locationStatus === LocationStatus.UNAVAILABLE || locationStatus === LocationStatus.VGPS_ACTIVE)) {
      setNotification({ message: 'GPS Signal Lost', type: 'error' });
    } else if (locationStatus === LocationStatus.VGPS_ACTIVE) {
        setNotification({ message: 'vGPS Driver Active', type: 'info'});
    } else if ((prevLocationStatus === LocationStatus.UNAVAILABLE || prevLocationStatus === LocationStatus.VGPS_ACTIVE) && locationStatus === LocationStatus.ACQUIRED) {
      setNotification({ message: 'GPS Signal Re-Acquired', type: 'success' });
    }

    notificationTimerRef.current = window.setTimeout(() => setNotification(null), 3000);

  }, [locationStatus, prevLocationStatus]);

  useEffect(() => {
    const enableStream = async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }, // Prefer rear camera
        });
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (err) {
        console.error("Error accessing camera:", err);
        setError("Could not access the camera. Please check permissions.");
      }
    };

    enableStream();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      if (videoIntervalRef.current) {
        clearInterval(videoIntervalRef.current);
      }
      if (notificationTimerRef.current) {
        clearTimeout(notificationTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only on mount

  const captureFrame = useCallback(() => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const img = new Image();
    img.onload = () => {
      onCapture(img);
    };
    img.src = canvas.toDataURL('image/png');
  }, [onCapture]);

  const handleCaptureStill = () => {
    captureFrame();
  };

  const handleToggleVideoCapture = () => {
    if (isCapturingVideo) {
      // Stop capturing
      if (videoIntervalRef.current) {
        clearInterval(videoIntervalRef.current);
        videoIntervalRef.current = null;
      }
    } else {
      // Start capturing (e.g., 1 frame per second)
      videoIntervalRef.current = window.setInterval(captureFrame, 1000);
    }
    setIsCapturingVideo(!isCapturingVideo);
  };

  const LocationIndicator = () => {
    if (locationStatus === LocationStatus.NOT_SUPPORTED) return null;

    switch(locationStatus) {
      case LocationStatus.ACQUIRED:
        return <div className="absolute top-4 left-4 text-green-400 bg-black/50 p-2 rounded-full text-xs font-mono" title="GPS Signal Acquired">🛰️ LIVE</div>;
      case LocationStatus.UNAVAILABLE:
        return <div className="absolute top-4 left-4 text-red-400 bg-black/50 p-2 rounded-full text-xs font-mono" title="GPS Signal Unavailable">🛰️ LOST</div>;
      case LocationStatus.REQUESTING:
        return <div className="absolute top-4 left-4 text-yellow-400 bg-black/50 p-2 rounded-full text-xs font-mono animate-pulse" title="Acquiring GPS Signal...">🛰️ ...</div>;
      case LocationStatus.VGPS_ACTIVE:
        return <div className="absolute top-4 left-4 text-cyan-400 bg-black/50 p-2 rounded-full text-xs font-mono" title="vGPS Driver Active">👁️ LIVE</div>;
      case LocationStatus.VGPS_CALIBRATING:
        return <div className="absolute top-4 left-4 text-cyan-400 bg-black/50 p-2 rounded-full text-xs font-mono animate-pulse" title="vGPS Calibrating...">👁️ ...</div>;
      default:
        return null;
    }
  }
  
  const getNotificationColor = () => {
      if (!notification) return '';
      switch(notification.type) {
          case 'success': return 'bg-green-400';
          case 'error': return 'bg-red-500';
          case 'info': return 'bg-cyan-400';
      }
  }

  return (
    <div className="absolute inset-0 bg-black z-30 flex flex-col items-center justify-center">
      {error ? (
        <div className="text-red-500 p-4 bg-red-900/50 rounded">{error}</div>
      ) : (
        <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
      )}
      <LocationIndicator />
      {notification && (
        <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 p-4 rounded-lg font-bold text-2xl text-black shadow-lg animate-ping ${getNotificationColor()}`}>
          {notification.message}
        </div>
      )}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 bg-black/70 p-3 rounded-lg border border-green-500/60">
        <button
          onClick={handleCaptureStill}
          disabled={!!error || isCapturingVideo}
          className="px-4 py-2 text-green-400 hover:enabled:bg-green-500/20 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Capture a single photo"
        >
          Capture Still
        </button>
        <button
          onClick={handleToggleVideoCapture}
          disabled={!!error}
          className={`px-4 py-2 text-green-400 rounded transition-colors ${isCapturingVideo ? 'bg-red-500/40 hover:bg-red-500/60' : 'hover:bg-green-500/20'}`}
          title="Capture a photo every second"
        >
          {isCapturingVideo ? 'Stop Video Capture' : 'Start Video Capture'}
        </button>
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 bg-black/80 text-white rounded-full w-8 h-8 flex items-center justify-center border-2 border-green-500/60 hover:bg-green-500/50"
          aria-label="Close camera view"
        >
          &times;
        </button>
      </div>
    </div>
  );
};