/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import {GIFEncoder, quantize, applyPalette} from 'https://unpkg.com/gifenc'

// This file is no longer used due to the architectural shift away from a linear history model.
// It is kept here for reference but is not part of the active application code.

export const generateZoomGif = async (): Promise<Blob> => {
    throw new Error("GIF generation is disabled in the new tile-based architecture.");
};
