/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React from 'react';
import { AppState, LocationStatus } from '../types';

interface StatusBarProps {
  state: AppState;
  isInitialState: boolean;
  onAddCaptureClick: () => void;
  locationStatus: LocationStatus;
}

const getStatusMessage = (state: AppState): string => {
  switch (state) {
    case AppState.IDLE:
      return 'SYSTEM IDLE. AWAITING INITIAL CAPTURE.';
    case AppState.LOADING:
      return 'LOADING INITIAL ASSETS... GENERATING WORLD TILES...';
    case AppState.LOADED:
      return 'WORLD MODEL READY. PAN TO EXPLORE. ZOOM AND PAUSE TO ENHANCE. ADD MORE CAPTURES TO BUILD 3D MODEL.';
    case AppState.SELECTING:
        return 'DEFINING SELECTION AREA...';
    case AppState.ANALYZING:
      return 'ANALYZING SCENE... DETERMINING WORLD CONTEXT...';
    case AppState.ENHANCING:
      return 'STITCHING TILES... ENHANCING REGION... RETILING...';
    case AppState.ENHANCED:
      return 'APPLYING ENHANCEMENT...';
    case AppState.CAMERA_ACTIVE:
      return 'CAMERA ACTIVE. CAPTURE STILLS TO ADD TO THE WORLD MODEL.';
    default:
      return '...';
  }
};

const LocationIndicator: React.FC<{ status: LocationStatus }> = ({ status }) => {
  if (status === LocationStatus.NOT_SUPPORTED) {
    return null;
  }
  switch (status) {
    case LocationStatus.ACQUIRED:
      return <span className="text-green-400" title="GPS Acquired">🛰️</span>;
    case LocationStatus.UNAVAILABLE:
      return <span className="text-red-500" title="GPS Unavailable">🛰️🚫</span>;
    case LocationStatus.REQUESTING:
      return <span className="animate-pulse text-yellow-400" title="Requesting GPS...">🛰️?</span>;
    case LocationStatus.VGPS_ACTIVE:
      return <span className="text-cyan-400" title="vGPS Driver Active">👁️</span>;
    case LocationStatus.VGPS_CALIBRATING:
      return <span className="animate-pulse text-cyan-400" title="vGPS Calibrating...">👁️?</span>;
    default:
      return null;
  }
};

export const StatusBar: React.FC<StatusBarProps> = ({ state, isInitialState, onAddCaptureClick, locationStatus }) => {
  // Special UI for the initial loaded state, combining the prompt and status
  if (state === AppState.LOADED && isInitialState) {
    return (
      <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-2 text-center text-green-400 font-mono tracking-widest text-sm border-t border-green-500/30 z-10 flex items-center justify-center h-12">
        <p className="hidden sm:block animate-pulse">Drag & drop an image, or pan/zoom the current one to begin.</p>
        <button
          onClick={onAddCaptureClick}
          className="block sm:hidden px-4 py-2 bg-green-500/20 border border-green-500/50 rounded text-green-300 hover:bg-green-500/30 transition-colors"
        >
          Select Image
        </button>
      </div>
    );
  }

  // Fallback to original status bar for all other states
  const message = getStatusMessage(state);
  return (
    <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-2 text-center text-green-400 font-mono tracking-widest text-sm border-t border-green-500/30 z-10 flex items-center justify-center gap-4 h-12">
        <LocationIndicator status={locationStatus} />
        <p className="animate-pulse">{message}</p>
    </div>
  );
};