
import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
import { googlePlatformService } from "./googleCalendar";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- Tool Definitions for Admin ---
const googleTools: FunctionDeclaration[] = [
  {
    name: "send_email",
    description: "Send an email using the user's Gmail account.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        to: { type: Type.STRING, description: "Recipient email address" },
        subject: { type: Type.STRING, description: "Email subject line" },
        body: { type: Type.STRING, description: "The plain text content of the email" }
      },
      required: ["to", "subject", "body"]
    }
  },
  {
    name: "create_calendar_event",
    description: "Create a new event in the user's primary Google Calendar.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        summary: { type: Type.STRING, description: "Title of the event" },
        description: { type: Type.STRING, description: "Description or notes for the event" },
        startTime: { type: Type.STRING, description: "Start time in ISO format (YYYY-MM-DDTHH:mm:ss)" },
        endTime: { type: Type.STRING, description: "End time in ISO format (YYYY-MM-DDTHH:mm:ss)" },
        attendeeEmail: { type: Type.STRING, description: "Optional email of a guest to invite" }
      },
      required: ["summary", "startTime", "endTime"]
    }
  },
  {
    name: "add_sheet_row",
    description: "Append a row of data to the connected Google Sheet.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        spreadsheetId: { type: Type.STRING, description: "The ID of the Google Sheet" },
        data: { 
          type: Type.ARRAY, 
          items: { type: Type.STRING }
        }
      },
      required: ["data"]
    }
  }
];

export async function checkSystemHealth(): Promise<{ status: boolean; latency: number; error?: string }> {
  const start = Date.now();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: 'ping'
    });
    return { status: !!response.text, latency: Date.now() - start };
  } catch (e: any) {
      return { status: false, latency: Date.now() - start, error: e.message };
  }
}

export async function analyzeImage(base64Image: string, prompt: string): Promise<string> {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [{ inlineData: { mimeType: 'image/jpeg', data: base64Image } }, { text: prompt }]
      }
    });
    return response.text || "Sem resposta.";
  } catch (error) {
    return "Erro ao processar imagem.";
  }
}

export async function analyzeDashboard(base64Image: string) {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
          { text: "Extract odometer (number only), fuelLevel (Reserva, 1/4, 1/2, 3/4, Full), and licensePlate from this dashboard." }
        ]
      },
      config: { 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            odometer: { type: Type.NUMBER },
            fuelLevel: { type: Type.STRING },
            licensePlate: { type: Type.STRING }
          }
        }
      }
    });
    return JSON.parse(response.text || "{}");
  } catch (error) {
    return {};
  }
}

export async function analyzeDocument(base64Image: string, docContext: string) {
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
                    { text: `Extract from this ${docContext}: fullName, birthDate (YYYY-MM-DD), expiryDate (YYYY-MM-DD), docNumber, nif, issueDate (YYYY-MM-DD).` }
                ]
            },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        fullName: { type: Type.STRING },
                        birthDate: { type: Type.STRING },
                        issueDate: { type: Type.STRING },
                        expiryDate: { type: Type.STRING },
                        docNumber: { type: Type.STRING },
                        nif: { type: Type.STRING }
                    }
                }
            }
        });
        return JSON.parse(response.text || "{}");
    } catch (e) {
        return {};
    }
}

export async function analyzeVehicleDamage(base64Data: string, mimeType: string = 'image/jpeg') {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [{ inlineData: { mimeType, data: base64Data } }, { text: "Identify car damages: part, type, severity (Baixa, Média, Alta, Crítica), description." }]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              part: { type: Type.STRING },
              type: { type: Type.STRING },
              severity: { type: Type.STRING, enum: ["Baixa", "Média", "Alta", "Crítica"] },
              description: { type: Type.STRING }
            },
            required: ["part", "type", "severity", "description"]
          }
        }
      }
    });
    return JSON.parse(response.text || "[]");
  } catch (error) {
    return [];
  }
}

export async function askAdminAssistant(chatHistory: any[], newMessage: string): Promise<string> {
    const chat = ai.chats.create({
        model: 'gemini-3-pro-preview',
        config: {
            systemInstruction: "You are the AutoRent Executive Assistant. Use tools to send emails, manage calendar, and update sheets.",
            tools: [{ googleSearch: {} }, { functionDeclarations: googleTools }]
        },
        history: chatHistory.map((m: any) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] }))
    });

    const result = await chat.sendMessage({ message: newMessage });
    // Note: Tool execution logic would follow same pattern as App.tsx's live session but for REST chat.
    return result.text || "Processando...";
}
