
import { GoogleGenAI, Type } from "@google/genai";

export async function askAdminAssistant(chatHistory: any[], newMessage: string): Promise<string> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const chat = ai.chats.create({
        model: 'gemini-3-pro-preview',
        config: {
            systemInstruction: `Você é o Elite Admin Assistant da AutoRent Azores. Ajude na gestão da frota e manutenção.`,
        },
        history: chatHistory.map((m: any) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] }))
    });
    const result = await chat.sendMessage({ message: newMessage });
    return result.text || "...";
}

export async function analyzeRegistrationCertificate(base64Front: string, base64Back?: string) {
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const parts = [
            { inlineData: { mimeType: 'image/jpeg', data: base64Front } },
            { text: "Analise este Certificado de Matrícula (Documento Único Automóvel) e extraia: brand, model, licensePlate, vin (chassi), category." }
        ];
        if (base64Back) parts.push({ inlineData: { mimeType: 'image/jpeg', data: base64Back } });

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: { parts },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        brand: { type: Type.STRING },
                        model: { type: Type.STRING },
                        licensePlate: { type: Type.STRING },
                        vin: { type: Type.STRING },
                        category: { type: Type.STRING }
                    }
                }
            }
        });
        return JSON.parse(response.text || "{}");
    } catch (error) { return {}; }
}

export async function analyzeDashboard(base64Image: string) {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [{ inlineData: { mimeType: 'image/jpeg', data: base64Image } }, { text: "Extract odometer and fuelLevel." }]
      },
      config: { 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: { odometer: { type: Type.NUMBER }, fuelLevel: { type: Type.STRING } }
        }
      }
    });
    return JSON.parse(response.text || "{}");
  } catch (error) { return {}; }
}

/**
 * Performs a health check on the AI_CORE module by sending a simple prompt.
 */
export async function checkSystemHealth(): Promise<{ status: boolean; error?: string }> {
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: 'Verify system connectivity. Respond with "ok".',
        });
        return { status: !!response.text };
    } catch (error: any) {
        return { status: false, error: error.message };
    }
}
