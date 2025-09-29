/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { useState, useEffect, useRef } from 'react';
import { GpsStatus, GPSCoordinates, PathPoint } from '../types';

export const useGps = () => {
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>(GpsStatus.IDLE);
  const [currentCoordinates, setCurrentCoordinates] = useState<GPSCoordinates | null>(null);
  const [path, setPath] = useState<PathPoint[]>([]);
  const pathRef = useRef(path);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    pathRef.current = path;
  }, [path]);

  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsStatus(GpsStatus.UNAVAILABLE);
      return;
    }

    const addPathPoint = (status: GpsStatus, coordinates: GPSCoordinates | null) => {
      setPath(prevPath => [...prevPath, { status, coordinates, timestamp: Date.now() }]);
    };

    const handleSuccess = (position: GeolocationPosition) => {
      const newCoordinates = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };

      const lastPoint = pathRef.current[pathRef.current.length - 1];
      if (lastPoint?.status === GpsStatus.UNAVAILABLE) {
          console.log("GPS signal re-acquired. Recalibrating last path segment...");
          // In a real application, this is where you would trigger a process
          // to analyze the captures taken during the GPS-denied period.
          // Using the last known good location (lastPoint before the UNAVAILABLE one)
          // and this new location, you could interpolate positions for the captures in between.
      }
      
      setGpsStatus(GpsStatus.ACQUIRED);
      setCurrentCoordinates(newCoordinates);
      addPathPoint(GpsStatus.ACQUIRED, newCoordinates);
    };

    const handleError = (error: GeolocationPositionError) => {
      console.warn(`GPS Error: ${error.message}`);
      setGpsStatus(GpsStatus.UNAVAILABLE);
      setCurrentCoordinates(null);
      addPathPoint(GpsStatus.UNAVAILABLE, null);
    };
    
    setGpsStatus(GpsStatus.REQUESTING);
    addPathPoint(GpsStatus.REQUESTING, null);

    watchIdRef.current = navigator.geolocation.watchPosition(
      handleSuccess,
      handleError,
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  return { gpsStatus, currentCoordinates, path };
};
