/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import { GoogleGenAI, Modality } from "@google/genai";

const dataUrlToBase64 = (dataUrl: string): string => {
    const parts = dataUrl.split(',');
    if (parts.length > 1) {
        return parts[1];
    }
    return '';
}

export const serviceEnhance = async (croppedImageDataUrl: string, prompt: string, hasFoundBanana:boolean): Promise<{ imageSrc: string, foundTheBanana: boolean }> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const base64Data = dataUrlToBase64(croppedImageDataUrl);
    const imagePart = {
        inlineData: {
            mimeType: 'image/png',
            data: base64Data,
        },
    };

    if (!prompt) {
        console.error("Enhancement prompt is empty.");
        // Fallback to just returning the cropped image.
        return { imageSrc: croppedImageDataUrl, foundTheBanana: false };
    }
  
    const generationPrompt = `${prompt}
**CRITICAL INSTRUCTIONS:**
1.  **Strict Consistency:** The enhanced image MUST be a plausible, higher-resolution version of the original. It must perfectly match the shapes, colors, textures, and lighting.
2.  **No New Objects:** DO NOT invent or add new objects that are not clearly suggested by the low-resolution pixels. The goal is enhancement, not hallucination.
` + (hasFoundBanana ? '' : `
**Easter Egg:** There's a small chance you can hide a "nano banana" 🍌 in the image. Be subtle. If you add a banana, respond with the text part as a JSON object: \`{"foundTheBanana": true}\`. Otherwise, do not include a text part or set it to \`{"foundTheBanana": false}\`.`)

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image-preview',
            contents: {parts:[imagePart, {text:generationPrompt}]},
            config:{
                responseModalities: [Modality.IMAGE, Modality.TEXT],
            }
        });

        const candidates = response.candidates;
        if (!candidates || candidates.length === 0)
          throw new Error("No candidates returned from the API.");
        const contents = candidates[0].content;
        if (!contents) throw new Error("No contents returned from the API.");
        const parts = contents.parts;
        if (!parts) throw new Error("No parts returned from the API.");


        let foundTheBanana = false;
        let imageSrc = croppedImageDataUrl;

        for (const part of parts) {
          if (part.text) {
            try {
                const json = JSON.parse(part.text);
                if(json.foundTheBanana) {
                    foundTheBanana = true;
                }
            } catch(e) {
                // Ignore if parsing fails, it's probably not the JSON we want.
                console.log('Non-JSON text part from enhancement:', part.text);
            }
          } else if (part.inlineData) {
            const imageData = part.inlineData.data;
            imageSrc = `data:${part.inlineData.mimeType};base64,${imageData}`;
          }
        }
        
        return { imageSrc, foundTheBanana };

    } catch (error) {
        console.error("Error generating image with Gemini:", error);
        return { imageSrc: croppedImageDataUrl, foundTheBanana: false }; // Return original if generation fails
    }
};