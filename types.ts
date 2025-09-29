/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


export enum AppState {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  LOADED = 'LOADED',
  SELECTING = 'SELECTING',
  ANALYZING = 'ANALYZING',
  ENHANCING = 'ENHANCING',
  ENHANCED = 'ENHANCED',
  CAMERA_ACTIVE = 'CAMERA_ACTIVE',
}

export enum GpsStatus {
  IDLE = 'IDLE',
  REQUESTING = 'REQUESTING',
  ACQUIRED = 'ACQUIRED',
  UNAVAILABLE = 'UNAVAILABLE',
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ImageDescription {
    selectionDescription:string;
    prompt?:string;
}

export interface TileData {
  image: HTMLImageElement;
  isEnhanced: boolean;
}

export interface GPSCoordinates {
  latitude: number;
  longitude: number;
}

export interface PathPoint {
  coordinates: GPSCoordinates | null;
  timestamp: number;
  status: GpsStatus;
}

export interface Camera {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number }; // Euler angles
  fov: number; // vertical field of view
}

export enum CaptureType {
  EQUIRECTANGULAR = 'EQUIRECTANGULAR',
  PERSPECTIVE = 'PERSPECTIVE',
}

export interface Capture {
  id: string;
  type: CaptureType;
  image: HTMLImageElement;
  camera: Camera;
  gps?: GPSCoordinates;
  gpsStatus?: GpsStatus;
}
