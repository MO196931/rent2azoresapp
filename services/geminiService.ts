
import { GoogleGenAI, Type, Schema, FunctionDeclaration } from "@google/genai";
import { googlePlatformService } from "./googleCalendar";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- Tool Definitions ---

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
    description: "Append a row of data to the connected Google Sheet. Use this to log tasks, notes, or reservations.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        spreadsheetId: { type: Type.STRING, description: "The ID of the Google Sheet (available in system settings)" },
        data: { 
          type: Type.ARRAY, 
          description: "An array of strings representing the columns",
          items: { type: Type.STRING }
        }
      },
      required: ["data"]
    }
  }
];

// --- Existing Analysis Functions ---

export async function checkSystemHealth(): Promise<{ status: boolean; latency: number; error?: string }> {
  const start = Date.now();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: [{ text: "ping" }] }
    });
    if (response.text) {
        return { status: true, latency: Date.now() - start };
    }
    return { status: false, latency: Date.now() - start, error: "Empty response" };
  } catch (e: any) {
      return { status: false, latency: Date.now() - start, error: e.message || "Unknown error" };
  }
}

export async function analyzeImage(base64Image: string, prompt: string): Promise<string> {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64Image
            }
          },
          { text: prompt }
        ]
      }
    });
    return response.text || "Não foi possível analisar a imagem.";
  } catch (error) {
    console.error("Analysis error:", error);
    return "Erro ao processar imagem.";
  }
}

export interface DashboardAnalysisResult {
  odometer?: number;
  fuelLevel?: string;
  licensePlate?: string;
}

export async function analyzeDashboard(base64Image: string): Promise<DashboardAnalysisResult> {
  try {
    const prompt = `
      Analise esta imagem do painel de instrumentos do veículo.
      Identifique com precisão:
      
      1. "odometer": O valor total de quilómetros (apenas números inteiros).
      2. "fuelLevel": O nível do ponteiro ou barra de combustível. Normalize para um destes valores: "Reserva", "1/4", "1/2", "3/4", "Cheio" (ou "Full"). Se estiver entre marcas, arredonde para a mais próxima.
      3. "licensePlate": A matrícula se visível.

      Se algum valor não for claramente visível, retorne null nesse campo.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
          { text: prompt }
        ]
      },
      config: { 
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            odometer: { type: Type.NUMBER, description: "Total kilometers driven" },
            fuelLevel: { type: Type.STRING, description: "Fuel level e.g., 1/2, Full, etc." },
            licensePlate: { type: Type.STRING }
          }
        }
      }
    });

    const text = response.text || "{}";
    return JSON.parse(text) as DashboardAnalysisResult;
  } catch (error) {
    console.error("Dashboard analysis error:", error);
    return {};
  }
}

export interface DocumentAnalysisResult {
  fullName?: string;
  birthDate?: string; // YYYY-MM-DD
  issueDate?: string; // YYYY-MM-DD (Data de Emissão)
  expiryDate?: string; // YYYY-MM-DD
  docNumber?: string;
  nif?: string;
  type?: 'CC' | 'Carta Conducao' | 'Outro';
}

export async function analyzeDocument(base64Image: string, docContext: string): Promise<DocumentAnalysisResult> {
    try {
        const prompt = `
        Analise esta imagem de um documento (${docContext}).
        Extraia os seguintes dados estruturados se visíveis:
        1. "fullName": Nome completo.
        2. "birthDate": Data de nascimento (Formato YYYY-MM-DD).
        3. "expiryDate": Data de validade do documento (Formato YYYY-MM-DD). Se tiver "Válido até", use essa data.
        4. "docNumber": Número do documento (CC ou Carta).
        5. "nif": Número fiscal se visível.
        6. "issueDate": Data de emissão ou data da carta de condução (Formato YYYY-MM-DD). Importante para calcular tempo de carta.
        
        Certifique-se que as datas estão estritamente no formato YYYY-MM-DD.
        `;
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
                    { text: prompt }
                ]
            },
            config: {
                temperature: 0.1,
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        fullName: { type: Type.STRING },
                        birthDate: { type: Type.STRING, description: "YYYY-MM-DD" },
                        issueDate: { type: Type.STRING, description: "YYYY-MM-DD (Data Emissão)" },
                        expiryDate: { type: Type.STRING, description: "YYYY-MM-DD" },
                        docNumber: { type: Type.STRING },
                        nif: { type: Type.STRING },
                        type: { type: Type.STRING, enum: ['CC', 'Carta Conducao', 'Outro'] }
                    }
                }
            }
        });

        const text = response.text || "{}";
        return JSON.parse(text) as DocumentAnalysisResult;
    } catch (e) {
        console.error("Doc analysis error", e);
        return {};
    }
}

export interface VehicleDocumentAnalysis {
  expiryDate?: string;
  policyNumber?: string;
  licensePlate?: string;
}

export async function analyzeVehicleDocument(base64Image: string, docType: 'Seguro' | 'IUC' | 'Inspecao'): Promise<VehicleDocumentAnalysis> {
    try {
        const prompt = `
        Analise esta imagem de um documento automóvel: ${docType}.
        Extraia:
        1. "expiryDate": Data de validade ou data limite (Formato YYYY-MM-DD).
        2. "policyNumber": Número da apólice (apenas para Seguro/Carta Verde).
        3. "licensePlate": Matrícula do veículo se visível.
        
        Se for IUC, procure "Data Limite Pagamento".
        Se for Inspeção (IPO), procure "Válido até".
        Se for Seguro, procure "Válido até" e "Apólice".
        `;
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
                    { text: prompt }
                ]
            },
            config: {
                temperature: 0.1,
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        expiryDate: { type: Type.STRING, description: "YYYY-MM-DD" },
                        policyNumber: { type: Type.STRING },
                        licensePlate: { type: Type.STRING }
                    }
                }
            }
        });

        const text = response.text || "{}";
        return JSON.parse(text) as VehicleDocumentAnalysis;
    } catch (e) {
        console.error("Vehicle Doc analysis error", e);
        return {};
    }
}

export interface DamageAnalysisResult {
  part: string;
  type: string;
  severity: 'Baixa' | 'Média' | 'Alta' | 'Crítica';
  description: string;
  confidence?: number;
}

export async function analyzeVehicleDamage(base64Data: string, mimeType: string = 'image/jpeg'): Promise<DamageAnalysisResult[]> {
  try {
    const isVideo = mimeType.startsWith('video');
    const mediaTypeLabel = isVideo ? 'deste vídeo' : 'desta imagem';

    const prompt = `
      CONTEXTO: Você é um Perito Sénior em Vistoria Automóvel (AI Inspector).
      TAREFA: Analise o conteúdo ${mediaTypeLabel} para identificar danos físicos no veículo para um relatório legal.

      OBJETIVOS:
      1. Identificar Peça: Seja específico (ex: "Guarda-lamas Frontal Esquerdo", "Porta do Condutor").
      2. Classificar Tipo: "Risco", "Amolgadela", "Pintura Descascada", "Vidro Estalado".
      3. Quantificar Severidade: Baseado no tamanho e profundidade visual.
      
      IMPORTANTE:
      - Ignore reflexos, gotas de água ou sujidade leve.
      - Se não houver danos claros, retorne uma lista vazia.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          { inlineData: { mimeType: mimeType, data: base64Data } },
          { text: prompt }
        ]
      },
      config: {
        temperature: 0.2,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              part: { type: Type.STRING, description: "A parte específica do veículo (ex: Porta Dianteira Esq)." },
              type: { type: Type.STRING, description: "O tipo de dano (ex: Risco, Amolgadela)." },
              severity: { type: Type.STRING, enum: ["Baixa", "Média", "Alta", "Crítica"] },
              description: { type: Type.STRING, description: "Breve descrição técnica do dano." },
              confidence: { type: Type.NUMBER, description: "Grau de confiança de 0 a 100." }
            },
            required: ["part", "type", "severity", "description"]
          }
        }
      }
    });

    const text = response.text || "[]";
    const results = JSON.parse(text) as DamageAnalysisResult[];
    
    // Filter out low confidence hallucinations
    return results.filter(r => (r.confidence === undefined || r.confidence > 65));

  } catch (error) {
    console.error("Damage analysis error:", error);
    return [];
  }
}

export async function extractTextFromDocument(base64Data: string, mimeType: string, fileName: string): Promise<string> {
  try {
    const isVideo = mimeType.startsWith('video');
    const isAudio = mimeType.startsWith('audio');
    
    let promptText = `Extraia todo o texto relevante e informação estruturada deste documento (${fileName}) para ser usado numa base de conhecimento (RAG).`;
    
    if (isVideo) {
        promptText = `Analise este vídeo (${fileName}). Descreva detalhadamente o que acontece, transcreva qualquer fala, leia textos visíveis (placas, documentos) e identifique o estado visual dos objetos mostrados. Isto é para um registo de evidências.`;
    } else if (isAudio) {
        promptText = `Transcreva este áudio (${fileName}) detalhadamente. Identifique os interlocutores se possível.`;
    } else if (mimeType.startsWith('image')) {
        promptText = `Descreva esta imagem (${fileName}) detalhadamente. Se for um documento, transcreva-o. Se for uma foto de veículo, descreva o estado.`;
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data
            }
          },
          { text: promptText }
        ]
      }
    });
    return response.text || `Sem conteúdo extraído de ${fileName}`;
  } catch (error) {
    console.error("Document extraction error:", error);
    return `Erro ao ler o ficheiro ${fileName}. Verifique o formato.`;
  }
}

export async function researchTopicForRag(topic: string): Promise<string> {
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `Pesquisa detalhada na web sobre: "${topic}". 
            
            Objetivo: Criar um artigo técnico e útil para a Base de Conhecimento interna de uma Rent-a-Car nos Açores.
            
            Inclui:
            - Factos concretos (preços, horários, leis).
            - Dicas práticas.
            - Links relevantes se encontrados.
            
            Retorna o texto formatado para leitura fácil.`,
            config: {
                tools: [{ googleSearch: {} }],
            },
        });
        
        let content = response.text || "";
        
        if (response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
            const links = response.candidates[0].groundingMetadata.groundingChunks
                .map((c: any) => c.web?.uri ? `- [${c.web.title}](${c.web.uri})` : null)
                .filter(Boolean)
                .join('\n');
            
            if (links) content += `\n\n### Fontes:\n${links}`;
        }
        
        return content || "Não foi possível encontrar informações sobre este tópico.";
    } catch (e: any) {
        console.error("Research error:", e);
        return `Erro na pesquisa: ${e.message}`;
    }
}

// --- UPGRADED ADMIN ASSISTANT ---

export async function askAdminAssistant(chatHistory: {role: string, text: string}[], newMessage: string): Promise<string> {
    try {
        const storedSheetId = localStorage.getItem('google_sheet_id') || "";

        const adminSystemPrompt = `
        You are the "AutoRent Executive Agent", an advanced AI capable of managing the rental business by executing real actions.
        
        **YOUR TOOLBOX:**
        1. **googleSearch**: Research laws, flights, competitors, weather.
        2. **send_email**: Send real emails to clients or staff via the Admin's Gmail.
        3. **create_calendar_event**: Schedule meetings, maintenance, or reminders.
        4. **add_sheet_row**: Log data to the company Google Sheet.
        
        **CONTEXT:**
        - Current Sheet ID: "${storedSheetId}" (Use this if the user says "add to sheet" without specifying ID).
        - Company: AutoRent Azores.
        
        **BEHAVIOUR:**
        - If the user asks to DO something (e.g. "Email John"), USE THE TOOL immediately.
        - You can chain tools. E.g., "Create a meeting AND email the client".
        - If a tool fails (e.g., user not logged in), apologize and explain they need to connect Google in the dashboard.
        - Always confirm what you did after the tool runs.
        `;

        const historyContents = chatHistory.map(msg => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.text }]
        }));

        const chat = ai.chats.create({
            model: 'gemini-2.5-flash',
            config: {
                systemInstruction: adminSystemPrompt,
                temperature: 0.3,
                tools: [
                    { googleSearch: {} },
                    { functionDeclarations: googleTools }
                ]
            },
            history: historyContents
        });

        // 1. Send user message to model
        const result = await chat.sendMessage({ message: newMessage });
        let finalResponseText = result.text || "";
        
        // 2. Check for Function Calls
        const calls = result.functionCalls;
        
        if (calls && calls.length > 0) {
            const functionResponses = [];

            for (const call of calls) {
                const args = call.args as any;
                let responseContent: any = { status: "ok" };

                try {
                    // --- EXECUTE TOOLS ---
                    if (call.name === 'send_email') {
                        await googlePlatformService.sendEmail(args.to, args.subject, args.body);
                        responseContent = { result: `Email sent to ${args.to}` };
                    } 
                    else if (call.name === 'create_calendar_event') {
                        // Assuming 'primary' calendar for ad-hoc tasks
                        await googlePlatformService.createEvent('primary', {
                            summary: args.summary,
                            description: args.description || "Created by AI Agent",
                            start: args.startTime,
                            end: args.endTime,
                            email: args.attendeeEmail
                        });
                        responseContent = { result: `Event '${args.summary}' created.` };
                    }
                    else if (call.name === 'add_sheet_row') {
                        const sheetId = args.spreadsheetId || storedSheetId;
                        if (!sheetId) throw new Error("No Spreadsheet ID configured.");
                        
                        // Using the new generic appendRow method
                        await googlePlatformService.appendRow(sheetId, args.data);
                        responseContent = { result: "Log added to Sheet." }; 
                    }
                } catch (e: any) {
                    console.error(`Tool Execution Error (${call.name}):`, e);
                    responseContent = { error: e.message || "Tool execution failed. User might not be signed in." };
                }

                functionResponses.push({
                    functionResponse: {
                        id: call.id,
                        name: call.name,
                        response: responseContent
                    }
                });
            }

            // 3. Send Tool Outputs back to Model
            const finalResult = await chat.sendMessage({ message: functionResponses });
            finalResponseText = finalResult.text;
        }

        // Handle Grounding (Links from Search)
        if (result.candidates?.[0]?.groundingMetadata?.groundingChunks) {
             const links = result.candidates[0].groundingMetadata.groundingChunks
                .map((c: any) => c.web?.uri ? `- [${c.web.title}](${c.web.uri})` : null)
                .filter(Boolean)
                .join('\n');
             if (links) finalResponseText += `\n\n**Fontes:**\n${links}`;
        }

        return finalResponseText;

    } catch (e: any) {
        console.error("Admin Assistant Error:", e);
        return "Erro ao processar o pedido. Verifique se a integração Google está ligada no Dashboard.";
    }
}
