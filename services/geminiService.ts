
import { GoogleGenAI, Type } from "@google/genai";

const getAi = () => new GoogleGenAI({ apiKey: process.env.API_KEY || "" });

export async function analyzeDashboard(base64: string) {
    try {
        const ai = getAi();
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: [{
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: base64 } },
                    { text: "Analyze car dashboard. Extract total mileage (number only) and fuel level (text like 'Full', '1/2', '75%'). Return JSON." }
                ]
            }],
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        odometerValue: { type: Type.NUMBER },
                        fuelLevel: { type: Type.STRING }
                    },
                    required: ["odometerValue", "fuelLevel"]
                }
            }
        });
        return JSON.parse(response.text || "{}");
    } catch (error) { 
        console.error("Dashboard OCR Error:", error);
        return null; 
    }
}

export async function analyzeRegistrationCertificate(frontBase64: string, backBase64?: string) {
    try {
        const ai = getAi();
        const parts: any[] = [
            { inlineData: { mimeType: 'image/jpeg', data: frontBase64 } }
        ];
        
        if (backBase64) {
            parts.push({ inlineData: { mimeType: 'image/jpeg', data: backBase64 } });
        }

        parts.push({ text: "Extract car details from this registration certificate: brand, model, licensePlate, vin, category, specs. Return JSON format." });

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: [{ parts }],
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        brand: { type: Type.STRING },
                        model: { type: Type.STRING },
                        licensePlate: { type: Type.STRING },
                        vin: { type: Type.STRING },
                        category: { type: Type.STRING },
                        specs: { type: Type.STRING }
                    }
                }
            }
        });
        return JSON.parse(response.text || "{}");
    } catch (error) {
        console.error("Certificate OCR Error:", error);
        return null;
    }
}

export async function checkSystemHealth(): Promise<{ status: boolean; error?: string }> {
    try {
        const ai = getAi();
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: 'Diagnostic: Return "OK" if alive.',
        });
        return { status: response.text?.includes("OK") || false };
    } catch (error: any) { 
        return { status: false, error: error.message }; 
    }
}
