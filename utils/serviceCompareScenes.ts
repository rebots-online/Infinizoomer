/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { GoogleGenAI, Type } from "@google/genai";
import { imageToDataUrl } from './imageUtils';

const dataUrlToBase64 = (dataUrl: string): string => {
    return dataUrl.split(',')[1] ?? '';
}

export const serviceCompareScenes = async (image1: HTMLImageElement, image2: HTMLImageElement): Promise<boolean> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const [img1DataUrl, img2DataUrl] = await Promise.all([
        imageToDataUrl(image1),
        imageToDataUrl(image2)
    ]);

    const imagePart1 = {
        inlineData: {
            mimeType: 'image/png',
            data: dataUrlToBase64(img1DataUrl),
        },
    };
    const imagePart2 = {
        inlineData: {
            mimeType: 'image/png',
            data: dataUrlToBase64(img2DataUrl),
        },
    };

    const prompt = `Analyze these two images. Does the second image appear to be from the same real-world location or scene as the first image? The first image is a digital render of a living room. Respond ONLY with a JSON object: {"isSameScene": boolean}`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [imagePart1, imagePart2, { text: prompt }] },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        isSameScene: {
                            type: Type.BOOLEAN,
                            description: 'Whether the two images depict the same scene.'
                        }
                    },
                    required: ['isSameScene']
                }
            }
        });
        
        const jsonText = response.text.trim();
        const result = JSON.parse(jsonText);
        
        return result.isSameScene ?? false;

    } catch (error) {
        console.error("Error comparing scenes with Gemini:", error);
        // Fallback to assuming it's the same scene to avoid accidentally deleting user progress.
        return true;
    }
};