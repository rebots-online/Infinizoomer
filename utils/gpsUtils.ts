/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import type { GPSCoordinates } from '../types';

/**
 * Calculates the distance between two GPS coordinates in meters using the Haversine formula.
 * @param coords1 - The first set of GPS coordinates.
 * @param coords2 - The second set of GPS coordinates.
 * @returns The distance between the two points in meters.
 */
export const calculateDistance = (coords1: GPSCoordinates, coords2: GPSCoordinates): number => {
    const R = 6371e3; // Earth's radius in metres
    const φ1 = coords1.latitude * Math.PI / 180; // φ, λ in radians
    const φ2 = coords2.latitude * Math.PI / 180;
    const Δφ = (coords2.latitude - coords1.latitude) * Math.PI / 180;
    const Δλ = (coords2.longitude - coords1.longitude) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const d = R * c; // in metres
    return d;
}