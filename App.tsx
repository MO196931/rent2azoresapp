
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AppPhase, ReservationData, CarDetails, INSURANCE_POLICY_TEXT, ChatMessage, KnowledgeDocument, DiagnosticResult, UserProfile, CompanyProfile, GoogleCalendar, SecondaryDriver, ServiceItem, HealthReport } from './types';
import { base64ToArrayBuffer, decodeAudioData, createPcmBlob } from './services/audioUtils';
import { analyzeImage, extractTextFromDocument, checkSystemHealth, analyzeVehicleDamage, analyzeDashboard, researchTopicForRag, askAdminAssistant, DashboardAnalysisResult, DamageAnalysisResult, analyzeDocument, analyzeVehicleDocument } from './services/geminiService';
import { systemMonitor } from './services/systemMonitor'; 
import { notificationManager, AppNotification } from './services/notificationManager';
import { db } from './services/mockDatabase'; 
import { googlePlatformService } from './services/googleCalendar'; 
import CameraCapture from './components/CameraCapture';
import SignaturePad from './components/SignaturePad';
import ErrorNotification from './components/ErrorNotification';
import ToastSystem from './components/ToastSystem';
import Tooltip from './components/Tooltip';
import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type } from '@google/genai';

// --- Configuration Constants ---
const ALLOWED_ADMINS = ['admin', 'staff']; 
const DEFAULT_COMPANY_DETAILS: CompanyProfile = {
  name: "AutoRent Azores Lda.",
  nif: "500123456",
  address: "Aeroporto João Paulo II, Ponta Delgada",
  license: "RA-2024-001",
  email: "reservas@autorent.pt",
  phone: "+351 910 000 000"
};

const FLOW_STEPS = [
  { id: AppPhase.DETAILS, label: 'Dados', icon: '📅' },
  { id: AppPhase.DOCUMENTS, label: 'Docs', icon: '🪪' },
  { id: AppPhase.VEHICLE_SELECTION, label: 'Viatura', icon: '🚗' },
  { id: AppPhase.PICKUP_INSPECTION, label: 'Vistoria', icon: '🔍' },
  { id: AppPhase.CONTRACT_SIGNATURE, label: 'Assinar', icon: '✍️' },
  { id: AppPhase.CONTRACT_PREVIEW, label: 'Contrato', icon: '📄' },
];

const SYSTEM_INSTRUCTION = `
You are "AutoRent Agent", the advanced AI interface for AutoRent Azores.
Your voice is warm, professional, and efficient. Speak Portuguese (PT-PT) by default.

YOUR ROLE AS "UI CONDUCTOR":
You control the user's screen. Do not just talk about a step; TAKE the user there.
- If you ask about dates or names -> Call \`navigateApp({screen: 'DETAILS'})\`.
- If you ask for ID cards -> Call \`navigateApp({screen: 'DOCUMENTS'})\`.

**STRICT DATA COLLECTION LOOP (MANDATORY):**
You must follow this loop. DO NOT move to the next field until the current one is confirmed.

1. **DATES & TIMES (CRITICAL):**
   - Ask: "Para que dias precisa do carro?"
   - **THEN ASK:** "A que horas conta levantar e devolver a viatura?" (Crucial for blocking the calendar).
   - Tool Call: \`updateReservationDetails({startDate: '...', startTime: '...', endDate: '...', endTime: '...'})\`
   - Verify: "Confirmo: Levantamento dia X às Y horas, Devolução dia Z às W horas. Correto?"

2. **NAME:** Ask Full Name -> Tool -> Verify.
3. **CONTACTS:** Ask Email & Phone -> Tool -> Verify.
4. **DRIVERS:** Ask "Haverá algum segundo condutor?". If yes, add name -> Verify.

PROCESS FLOW (DOCUMENTS):
1. Move to DOCUMENTS.
2. Say "Vou abrir a câmara para o seu Cartão de Cidadão". Call \`openDocumentCamera\`.
3. Guide through Front/Back for Main Driver, then Secondary Drivers.

TOOLS:
- \`updateReservationDetails\`: Call this immediately when the user gives info.
- \`navigateApp\`: Keep the screen synced with the conversation.
- \`openDocumentCamera\`: Use to help capture IDs.
- \`googleSearch\`: Use this to answer general questions (weather, location, laws).
`;

// --- Tools Definitions ---
const checkAvailabilityTool: FunctionDeclaration = {
  name: "checkAvailability",
  description: "Checks vehicle availability for specific dates.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      startDate: { type: Type.STRING, description: "YYYY-MM-DD" },
      endDate: { type: Type.STRING, description: "YYYY-MM-DD" },
      category: { type: Type.STRING, description: "Economy, Compact, SUV, etc." }
    },
    required: ["startDate", "endDate"]
  }
};

const updateReservationTool: FunctionDeclaration = {
  name: "updateReservationDetails",
  description: "Updates ANY field in the reservation form based on user voice input.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      startDate: { type: Type.STRING },
      startTime: { type: Type.STRING, description: "HH:mm (24h format)" },
      endDate: { type: Type.STRING },
      endTime: { type: Type.STRING, description: "HH:mm (24h format)" },
      driverName: { type: Type.STRING },
      email: { type: Type.STRING },
      phone: { type: Type.STRING },
      birthDate: { type: Type.STRING },
      drivingLicenseIssueDate: { type: Type.STRING },
      nif: { type: Type.STRING },
      fuelLevel: { type: Type.STRING },
      odometer: { type: Type.NUMBER },
      selectedInsurance: { type: Type.STRING },
      babySeat: { type: Type.BOOLEAN },
      addSecondaryDriverName: { type: Type.STRING, description: "Name of a new secondary driver to add" }
    }
  }
};

const openCameraTool: FunctionDeclaration = {
  name: "openDocumentCamera",
  description: "Opens the camera UI for a specific document type. Use this when asking the user to show a document.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      driverType: { type: Type.STRING, enum: ["main", "secondary"], description: "Who does this document belong to?" },
      secondaryDriverIndex: { type: Type.NUMBER, description: "0 for the first secondary driver, 1 for the second, etc. Required if driverType is secondary." },
      docType: { type: Type.STRING, enum: ["cc", "dl"], description: "cc = Citizen Card/ID, dl = Driving License" },
      side: { type: Type.STRING, enum: ["front", "back"] }
    },
    required: ["driverType", "docType", "side"]
  }
};

const logDamageTool: FunctionDeclaration = {
  name: "logDamage",
  description: "Logs a new damage found on the vehicle during inspection.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      part: { type: Type.STRING },
      description: { type: Type.STRING },
      severity: { type: Type.STRING, enum: ["low", "medium", "high"] }
    },
    required: ["part", "description"]
  }
};

const navigateTool: FunctionDeclaration = {
  name: "navigateApp",
  description: "Navigates the user to a specific screen/phase.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      screen: { 
        type: Type.STRING, 
        enum: ["DETAILS", "DOCUMENTS", "VEHICLE_SELECTION", "PICKUP_INSPECTION", "CONTRACT_SIGNATURE", "CONTRACT_PREVIEW"],
      }
    },
    required: ["screen"]
  }
};

// --- Helper Functions ---
const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const isValidPhone = (phone: string) => /^(\+|00)?[\d\s-]{9,20}$/.test(phone);

// --- Main App Component ---
export default function App() {
  // Global State
  const [phase, setPhase] = useState<AppPhase>(AppPhase.WELCOME);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [adminTab, setAdminTab] = useState<'fleet' | 'reservations' | 'users' | 'services' | 'knowledge' | 'system'>('fleet');
  const [loginPassword, setLoginPassword] = useState('');
  
  // Theme State
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
      if (typeof window !== 'undefined') {
          return localStorage.getItem('theme') === 'dark' ||
              (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)
              ? 'dark'
              : 'light';
      }
      return 'light';
  });

  // Data State
  const [fleet, setFleet] = useState<CarDetails[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [reservationsList, setReservationsList] = useState<ReservationData[]>([]);

  // Modals & Forms
  const [isFleetModalOpen, setIsFleetModalOpen] = useState(false);
  const [editingCar, setEditingCar] = useState<Partial<CarDetails>>({});
  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Partial<ServiceItem>>({});
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<Partial<UserProfile>>({});

  // Active Reservation
  const [activeDocType, setActiveDocType] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false); // New state for loading feedback
  const [reservation, setReservation] = useState<ReservationData>({
    documentsUploaded: false,
    transcript: [],
    driverName: '',
    email: '',
    phone: '',
    startDate: '',
    startTime: '10:00',
    endDate: '',
    endTime: '10:00',
    uploadedFiles: [],
    secondaryDrivers: []
  });
  
  const [companyDetails, setCompanyDetails] = useState<CompanyProfile>(DEFAULT_COMPANY_DETAILS);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  
  // Integrations
  const [userCalendars, setUserCalendars] = useState<GoogleCalendar[]>([]);
  const [isGoogleSignedIn, setIsGoogleSignedIn] = useState(false);
  const [googleSheetId, setGoogleSheetId] = useState(() => localStorage.getItem('google_sheet_id') || '');
  const [googleClientId, setGoogleClientId] = useState(() => localStorage.getItem('google_client_id') || '');
  const [googleApiKey, setGoogleApiKey] = useState(() => localStorage.getItem('google_api_key') || '');

  // Admin Chat
  const [adminChatHistory, setAdminChatHistory] = useState<ChatMessage[]>([]);
  const [adminInput, setAdminInput] = useState('');
  const [isAdminThinking, setIsAdminThinking] = useState(false);
  const adminChatEndRef = useRef<HTMLDivElement>(null);

  // System Health
  const [systemHealth, setSystemHealth] = useState<HealthReport | null>(null);
  
  // AI/Media
  const [isMicActive, setIsMicActive] = useState(false);
  const [audioVolume, setAudioVolume] = useState(0);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const contractRef = useRef<HTMLDivElement>(null);
  const fleetFileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingDocType, setUploadingDocType] = useState<'Seguro' | 'IUC' | 'Inspecao' | null>(null);
  
  const activeSessionRef = useRef<any>(null);
  const isDisconnectingRef = useRef<boolean>(false);
  const retryCountRef = useRef(0);
  const reconnectTimeoutRef = useRef<any>(null);

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // --- Effects ---
  useEffect(() => {
      if (theme === 'dark') document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    setFleet(db.getFleet());
    setUsers(db.getUsers());
    setServices(db.getServices());
    setReservationsList(db.getReservations());

    systemMonitor.runDailyHealthCheck().then(report => {
        if (report && report.status === 'critical') setError("Erro crítico de sistema: " + report.issues.join(", "));
        setSystemHealth(report);
    });

    notificationManager.requestPermission();
    
    if (googleClientId && googleApiKey) {
        googlePlatformService.loadScripts(googleClientId, googleApiKey).catch(e => console.error("Google Init Error", e));
    }

    setAdminChatHistory([{ role: 'model', text: 'Olá! Sou o seu assistente técnico com acesso ao Google Search. Posso ajudar a pesquisar regulamentos, ver voos ou gerir a frota. Em que posso ajudar?' }]);

    return () => disconnect();
  }, []);

  useEffect(() => {
      adminChatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [adminChatHistory]);

  const triggerNotification = (type: 'email' | 'sms' | 'push' | 'system', title: string, message: string) => {
    const note = notificationManager.createAlert(type, title, message);
    setNotifications(prev => [...prev, note]);
  };

  const removeNotification = (id: string) => setNotifications(prev => prev.filter(n => n.id !== id));

  // --- AI Connection ---
  const connectToGemini = async (isRetry = false) => {
    if (connected && !isRetry) return;
    if (!isRetry) { setError(null); retryCountRef.current = 0; }
    isDisconnectingRef.current = false;
    let isSessionActive = false;

    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      if (audioContext.state === 'suspended') await audioContext.resume();
      audioContextRef.current = audioContext;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;

      const inputContext = new AudioContext({ sampleRate: 16000 });
      const source = inputContext.createMediaStreamSource(stream);
      const processor = inputContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      let nextStartTime = 0;
      let resolveSession: (value: any) => void;
      const sessionReady = new Promise<any>((resolve) => { resolveSession = resolve; });

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          systemInstruction: systemMonitor.getAdaptiveInstruction(SYSTEM_INSTRUCTION),
          // Added googleSearch to allow the voice agent to answer general questions
          tools: [{ functionDeclarations: [checkAvailabilityTool, logDamageTool, navigateTool, updateReservationTool, openCameraTool] }, { googleSearch: {} }],
        },
        callbacks: {
          onopen: () => {
            if (isDisconnectingRef.current) return;
            isSessionActive = true;
            setConnected(true);
            setIsMicActive(true);
            setError(null);
            retryCountRef.current = 0;
            if (phase === AppPhase.WELCOME) setPhase(AppPhase.DETAILS);
          },
          onmessage: async (msg: LiveServerMessage) => {
             if (isDisconnectingRef.current) return;
            const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData) {
               const buffer = await decodeAudioData(base64ToArrayBuffer(audioData), audioContext);
               const src = audioContext.createBufferSource();
               src.buffer = buffer;
               src.connect(audioContext.destination);
               src.start(Math.max(audioContext.currentTime, nextStartTime));
               nextStartTime = Math.max(audioContext.currentTime, nextStartTime) + buffer.duration;
            }
            if (msg.toolCall) {
                const responses = await Promise.all(msg.toolCall.functionCalls.map(async fc => {
                    let result: any = { result: "Success" };
                    const args = fc.args as any;

                    if (fc.name === 'checkAvailability') {
                         const availableCars = [];
                         for (const car of fleet) {
                             let isAvailable = true;
                             if (args.category && !car.category.toLowerCase().includes(args.category.toLowerCase())) continue;
                             if (car.googleCalendarId && googlePlatformService.isAuthenticated) {
                                 const isFree = await googlePlatformService.isAvailable(car.googleCalendarId, args.startDate, args.endDate);
                                 if (!isFree) isAvailable = false;
                             }
                             if (isAvailable) availableCars.push(car);
                         }
                         if (availableCars.length > 0) result = { result: `Disponíveis: ${availableCars.map(c => c.model).join(", ")}` };
                         else result = { result: "Nenhuma viatura disponível." };
                    } 
                    else if (fc.name === 'navigateApp') {
                        if (args.screen && Object.values(AppPhase).includes(args.screen)) {
                            setPhase(args.screen as AppPhase);
                            result = { result: `Navigated to ${args.screen}` };
                        } else result = { result: "Invalid screen" };
                    }
                    else if (fc.name === 'openDocumentCamera') {
                        let docId = '';
                        if (args.driverType === 'main') {
                            docId = args.docType === 'cc' ? (args.side === 'front' ? 'cc_front' : 'cc_back') : (args.side === 'front' ? 'dl_front' : 'dl_back');
                        } else if (args.driverType === 'secondary') {
                            const idx = args.secondaryDriverIndex || 0;
                            docId = `sec_${idx}_${args.docType}_${args.side}`;
                        }
                        if (docId) {
                            setActiveDocType(docId);
                            result = { result: `Camera opened for ${docId}` };
                        } else {
                            result = { result: "Invalid document params" };
                        }
                    }
                    else if (fc.name === 'updateReservationDetails') {
                        setReservation(prev => {
                           const newState = { ...prev, ...args };
                           if (args.addSecondaryDriverName) {
                               const existing = prev.secondaryDrivers || [];
                               if (!existing.some(d => d.name.toLowerCase() === args.addSecondaryDriverName.toLowerCase())) {
                                   newState.secondaryDrivers = [...existing, { id: Date.now().toString(), name: args.addSecondaryDriverName }];
                               }
                           }
                           const today = new Date();
                           if (args.birthDate) {
                               const birth = new Date(args.birthDate);
                               let age = today.getFullYear() - birth.getFullYear();
                               const m = today.getMonth() - birth.getMonth();
                               if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
                               newState.driverAge = age;
                           }
                           if (args.drivingLicenseIssueDate) {
                               const issue = new Date(args.drivingLicenseIssueDate);
                               let years = today.getFullYear() - issue.getFullYear();
                               const m = today.getMonth() - issue.getMonth();
                               if (m < 0 || (m === 0 && today.getDate() < issue.getDate())) years--;
                               newState.drivingLicenseYears = Math.max(0, years);
                           }
                           return newState;
                        });
                        result = { result: "Updated" };
                    }
                    return { id: fc.id, name: fc.name, response: result };
                }));
                const session = await sessionReady;
                if (isSessionActive && !isDisconnectingRef.current) session.sendToolResponse({ functionResponses: responses });
            }
          },
          onerror: (err) => {
             if (isDisconnectingRef.current) return;
             isSessionActive = false;
             systemMonitor.logEvent('error', 'NETWORK', err.message);
             const { retry, delay } = systemMonitor.shouldRetry(err, retryCountRef.current);
             if (retry && retryCountRef.current < 3) {
                 retryCountRef.current++;
                 setError(`Reconnecting (${retryCountRef.current})...`);
                 disconnect(true); 
                 reconnectTimeoutRef.current = setTimeout(() => connectToGemini(true), delay);
                 return;
             }
             setError("Connection lost.");
             disconnect();
          },
          onclose: () => { isSessionActive = false; setConnected(false); }
        }
      });
      
      sessionPromise.then(session => { if (!isDisconnectingRef.current) { activeSessionRef.current = session; resolveSession(session); }})
      .catch(err => { if (!isDisconnectingRef.current) { setError("Server error."); disconnect(); }});

      processor.onaudioprocess = (e) => {
        if (isDisconnectingRef.current || !isSessionActive) return;
        const inputData = e.inputBuffer.getChannelData(0);
        let sum = 0;
        for(let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
        setAudioVolume(Math.sqrt(sum / inputData.length) * 100);
        const pcmBlob = createPcmBlob(inputData);
        sessionPromise.then(session => { if (isSessionActive && !isDisconnectingRef.current) session.sendRealtimeInput({ media: pcmBlob }); });
      };
      source.connect(processor);
      processor.connect(inputContext.destination);
    } catch (err: any) {
      systemMonitor.logEvent('fatal', 'AUDIO_SUBSYSTEM', err.message);
      setError("Audio error.");
      disconnect();
    }
  };

  const disconnect = (isRetrying = false) => {
    isDisconnectingRef.current = true;
    activeSessionRef.current = null;
    if (!isRetrying && reconnectTimeoutRef.current) { clearTimeout(reconnectTimeoutRef.current); reconnectTimeoutRef.current = null; }
    if (audioStreamRef.current) audioStreamRef.current.getTracks().forEach(t => t.stop());
    if (processorRef.current) { processorRef.current.disconnect(); processorRef.current.onaudioprocess = null; }
    if (audioContextRef.current) try { audioContextRef.current.close(); } catch(e) {}
    setConnected(false);
    setIsMicActive(false);
    if (!isRetrying) setError(null);
  };

  // --- Capture Handlers ---
  const handleCapture = async (dataUrl: string, type: 'image' | 'video', fileName: string = 'Captura') => {
      const matches = dataUrl.match(/^data:(.+);base64,(.+)$/);
      if (!matches) return;
      const base64Data = matches[2];
      
      setIsAnalyzing(true);
      
      try {
          setReservation(prev => ({ ...prev, documentsUploaded: true, uploadedFiles: [...(prev.uploadedFiles || []), { name: fileName, timestamp: Date.now() }] }));
          
          if (phase === AppPhase.DOCUMENTS) {
              if (fileName.startsWith('sec_')) {
                  const parts = fileName.split('_');
                  const idx = parseInt(parts[1]);
                  const docType = parts[2]; 
                  const side = parts[3]; 
                  
                  if (reservation.secondaryDrivers?.[idx]) {
                      const analysis = await analyzeDocument(base64Data, fileName);
                      setReservation(prev => {
                          const newDrivers = [...(prev.secondaryDrivers || [])];
                          const driver = { ...newDrivers[idx] };
                          if (docType === 'cc') {
                              if (side === 'front') driver.ccFrontUploaded = true; else driver.ccBackUploaded = true;
                              if (analysis.docNumber) driver.ccNumber = analysis.docNumber;
                          } else {
                              if (side === 'front') driver.dlFrontUploaded = true; else driver.dlBackUploaded = true;
                              if (analysis.docNumber) driver.licenseNumber = analysis.docNumber;
                          }
                          if (analysis.fullName) driver.name = analysis.fullName;
                          if (analysis.nif) driver.nif = analysis.nif;
                          if (analysis.birthDate) driver.birthDate = analysis.birthDate;
                          newDrivers[idx] = driver;
                          return { ...prev, secondaryDrivers: newDrivers };
                      });
                      triggerNotification('system', 'Sucesso', 'Dados do 2º condutor extraídos.');
                  }
              } else {
                  const analysis = await analyzeDocument(base64Data, fileName);
                  setReservation(prev => {
                      const updates: Partial<ReservationData> = {};
                      if (analysis.fullName) updates.driverName = analysis.fullName;
                      if (analysis.docNumber) {
                          if (fileName.includes('cc')) updates.ccNumber = analysis.docNumber;
                          if (fileName.includes('carta')) updates.drivingLicenseNumber = analysis.docNumber;
                      }
                      if (analysis.nif) updates.nif = analysis.nif;
                      if (analysis.birthDate) {
                          updates.birthDate = analysis.birthDate;
                          const today = new Date();
                          const birth = new Date(analysis.birthDate);
                          let age = today.getFullYear() - birth.getFullYear();
                          if (today < new Date(today.getFullYear(), birth.getMonth(), birth.getDate())) age--;
                          updates.driverAge = age;
                      }
                      if (analysis.expiryDate) {
                          if (fileName.includes('cc')) updates.ccExpiry = analysis.expiryDate; else updates.dlExpiry = analysis.expiryDate;
                      }
                      return { ...prev, ...updates };
                  });
                  triggerNotification('system', 'Sucesso', 'Dados do condutor principal validados.');
              }
          } else if (phase === AppPhase.PICKUP_INSPECTION) {
              const damages = await analyzeVehicleDamage(base64Data, matches[1]);
              if (damages.length > 0) {
                  const formatted = damages.map(d => `[${d.severity}] ${d.part}: ${d.type}`);
                  setReservation(prev => ({ ...prev, damageReport: [...(prev.damageReport || []), ...formatted] }));
                  triggerNotification('system', 'Danos Detetados', `${damages.length} registados.`);
              }
          }
      } catch (e) {
          console.error(e);
          triggerNotification('system', 'Erro', 'Falha ao processar a imagem.');
      } finally {
          setIsAnalyzing(false);
          if (activeDocType) setActiveDocType(null);
      }
  };

  // ... (Other handlers same as previous: Dashboard, FleetDoc, Signature, Login) ...
  const handleDashboardCapture = async (d: string) => {
      const matches = d.match(/^data:(.+);base64,(.+)$/);
      if (!matches) return;
      const res = await analyzeDashboard(matches[2]);
      if (res.fuelLevel || res.odometer) {
          setReservation(prev => ({ ...prev, fuelLevel: res.fuelLevel || prev.fuelLevel, odometer: res.odometer || prev.odometer }));
          triggerNotification('push', 'Leitura OK', `Fuel: ${res.fuelLevel} | Km: ${res.odometer}`);
      }
  };
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.[0]) {
          const r = new FileReader();
          r.onloadend = () => handleCapture(r.result as string, 'image', e.target.files![0].name);
          r.readAsDataURL(e.target.files[0]);
      }
  };
  const handleFleetDocUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!uploadingDocType || !e.target.files?.[0]) return;
      const r = new FileReader();
      r.onloadend = async () => {
          const m = (r.result as string).match(/^data:(.+);base64,(.+)$/);
          if (m) {
              const a = await analyzeVehicleDocument(m[2], uploadingDocType);
              setEditingCar(p => {
                  const u: Partial<CarDetails> = {};
                  if (a.expiryDate) {
                      if (uploadingDocType === 'Seguro') u.insuranceExpiry = a.expiryDate;
                      if (uploadingDocType === 'IUC') u.iucExpiry = a.expiryDate;
                      if (uploadingDocType === 'Inspecao') u.inspectionExpiry = a.expiryDate;
                  }
                  return { ...p, ...u };
              });
              triggerNotification('push', 'Processado', `${uploadingDocType} validado.`);
          }
      };
      r.readAsDataURL(e.target.files[0]);
  };
  const handleSignature = (d: string) => { setReservation(p => ({ ...p, signature: d })); setPhase(AppPhase.CONTRACT_PREVIEW); };
  const handleAdminLogin = () => { if (db.login(loginPassword)) { setCurrentUser(db.login(loginPassword)); setPhase(AppPhase.ADMIN_DASHBOARD); setLoginPassword(''); } else alert("Credenciais inválidas."); };
  const handleManualHealthCheck = async () => setSystemHealth(await systemMonitor.runDailyHealthCheck());
  
  const removeSecondaryDriver = (index: number) => {
    if (!confirm('Tem a certeza que deseja remover este condutor?')) return;
    setReservation(prev => {
        const updated = [...(prev.secondaryDrivers || [])];
        updated.splice(index, 1);
        return { ...prev, secondaryDrivers: updated };
    });
  };

  // Google Platform
  const handleGoogleSignIn = async () => {
      if (!googleClientId) return alert("Missing Config");
      await googlePlatformService.loadScripts(googleClientId, googleApiKey);
      if (await googlePlatformService.signIn()) {
          setIsGoogleSignedIn(true);
          setUserCalendars(await googlePlatformService.listCalendars());
      }
  };
  const handleCreateCarCalendar = async (name: string) => {
      if (!isGoogleSignedIn) return alert("Login required");
      const c = await googlePlatformService.createCalendar(`AutoRent - ${name}`);
      setUserCalendars(p => [...p, c]);
      setEditingCar(p => ({ ...p, googleCalendarId: c.id }));
  };

  const finishReservation = async () => {
      // 1. Create Calendar Event
      let calId = undefined;
      const car = fleet.find(c => c.model === reservation.selectedCar);
      if (car?.googleCalendarId && isGoogleSignedIn && reservation.startDate) {
          try {
              // Combine Date and Time for precise calendar blocking
              const startDateTime = `${reservation.startDate}T${reservation.startTime || '09:00'}:00`;
              const endDateTime = `${reservation.endDate || reservation.startDate}T${reservation.endTime || '18:00'}:00`;

              calId = await googlePlatformService.createEvent(car.googleCalendarId, {
                  summary: `Reserva: ${reservation.driverName}`,
                  description: `AutoRent.\nCarro: ${reservation.selectedCar}\nCliente: ${reservation.driverName} (${reservation.phone})\nCondutores Extra: ${reservation.secondaryDrivers?.map(d => d.name).join(', ') || 'Nenhum'}\nRef: ${Date.now()}`,
                  start: startDateTime,
                  end: endDateTime,
                  email: reservation.email
              });
              triggerNotification('push', 'Calendário', 'Evento criado.');
          } catch (e) { console.error("Calendar Error", e); }
      }
      
      const final = { ...reservation, status: 'confirmed' as any, googleCalendarEventId: calId, id: Date.now().toString() };
      db.saveReservation(final);

      // 2. Automations (Native Google)
      if (isGoogleSignedIn) {
          // Log to Sheets
          if (googleSheetId) {
             try {
                await googlePlatformService.appendToSheet(googleSheetId, final);
                triggerNotification('system', 'Google Sheets', 'Linha adicionada com sucesso.');
             } catch(e) { console.error("Sheets Error", e); }
          }
          
          // Send Email Confirmation (via Gmail API from logged in admin)
          if (final.email) {
              try {
                  const directions = `https://www.google.com/maps/dir/?api=1&destination=Aeroporto+Joao+Paulo+II+Ponta+Delgada`;
                  const emailBody = `Olá ${final.driverName},\n\nA sua reserva foi confirmada!\n\nVeículo: ${final.selectedCar}\nMatrícula: ${final.licensePlate}\nLevantamento: ${final.startDate} às ${final.startTime}\nDevolução: ${final.endDate} às ${final.endTime}\n\nLocalização: ${directions}\n\nObrigado,\nAutoRent Azores`;
                  await googlePlatformService.sendEmail(final.email, `Reserva Confirmada: ${final.selectedCar}`, emailBody);
                  triggerNotification('email', 'Email Enviado', `Confirmação enviada para ${final.email}`);
              } catch(e) { console.error("Gmail Error", e); }
          }
      }

      setPhase(AppPhase.COMPLETED);
  };
  
  const handleAdminChatSubmit = async () => {
    if (!adminInput.trim()) return;
    const userMsg = { role: 'user' as const, text: adminInput };
    setAdminChatHistory(prev => [...prev, userMsg]);
    setAdminInput('');
    setIsAdminThinking(true);
    
    const response = await askAdminAssistant([...adminChatHistory, userMsg], adminInput);
    
    setAdminChatHistory(prev => [...prev, { role: 'model', text: response }]);
    setIsAdminThinking(false);
  };

  // --- Render Helpers ---
  const renderProgressStepper = () => (
      <div className="w-full max-w-4xl mx-auto px-4 flex justify-between relative z-10">
          <div className="absolute top-1/2 w-full h-0.5 bg-slate-200 dark:bg-slate-700 -z-10 rounded"></div>
          {FLOW_STEPS.map((s, i) => {
              const idx = FLOW_STEPS.findIndex(x => x.id === phase);
              const isActive = s.id === phase;
              return (
                  <button 
                      key={s.id}
                      onClick={() => idx >= i && setPhase(s.id)}
                      className={`flex flex-col items-center gap-1 transition-all ${isActive ? 'scale-110' : ''}`}
                  >
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 text-xl shadow-sm bg-white dark:bg-slate-800 ${i <= idx ? 'border-blue-600 text-blue-600' : 'border-slate-300 dark:border-slate-600 text-slate-300'}`}>
                          {s.icon}
                      </div>
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${isActive ? 'text-blue-600' : 'text-slate-400'}`}>
                          {s.label}
                      </span>
                  </button>
              );
          })}
      </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white transition-colors font-sans">
      <ToastSystem notifications={notifications} onRemove={removeNotification} />
      
      {phase === AppPhase.ADMIN_DASHBOARD ? (
        <div className="p-4">
            <div className="flex justify-between mb-4">
                <h1 className="text-2xl font-bold">Admin Dashboard</h1>
                <button onClick={() => setPhase(AppPhase.WELCOME)} className="text-red-500 font-bold border border-red-500 px-4 py-1 rounded hover:bg-red-500 hover:text-white transition-colors">Sair</button>
            </div>
            
            <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
                {['fleet', 'reservations', 'users', 'services', 'knowledge', 'system'].map(t => (
                  <button 
                    key={t} 
                    onClick={() => setAdminTab(t as any)} 
                    className={`px-4 py-2 rounded capitalize font-bold whitespace-nowrap ${adminTab === t ? 'bg-blue-600 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}
                  >
                    {t === 'knowledge' ? 'Assistente' : t}
                  </button>
                ))}
            </div>

            {/* TAB: FLEET */}
            {adminTab === 'fleet' && (
                <div>
                    <button onClick={() => setIsFleetModalOpen(true)} className="mb-4 bg-green-600 text-white px-4 py-2 rounded shadow flex items-center gap-2"><span>+</span> Novo Veículo</button>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {fleet.map(c => (
                            <div key={c.id} className="bg-white dark:bg-slate-800 p-4 rounded shadow border dark:border-slate-700">
                                <div className="h-32 bg-slate-200 rounded mb-2 overflow-hidden relative">
                                  <img src={c.image} className="w-full h-full object-cover" />
                                  <div className="absolute top-2 right-2 bg-white/80 px-2 py-1 rounded text-xs font-bold">{c.category}</div>
                                </div>
                                <h3 className="font-bold text-lg">{c.model}</h3>
                                <div className="flex justify-between items-center text-sm text-slate-500 mt-2">
                                  <span className="font-mono bg-slate-100 dark:bg-slate-900 px-2 py-1 rounded">{c.licensePlate}</span>
                                  {c.googleCalendarId && <span title="Calendar Linked">📅</span>}
                                </div>
                                <div className="mt-4 flex gap-2">
                                  <button onClick={() => { setEditingCar(c); setIsFleetModalOpen(true); }} className="flex-1 text-blue-500 border border-blue-200 py-1 rounded hover:bg-blue-50">Editar</button>
                                  <button onClick={() => { if(confirm('Apagar?')) { db.deleteCar(c.id); setFleet(db.getFleet()); }}} className="text-red-500 border border-red-200 px-3 py-1 rounded hover:bg-red-50">✕</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* TAB: RESERVATIONS */}
            {adminTab === 'reservations' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 dark:bg-slate-800 text-slate-500 uppercase text-xs">
                      <th className="p-3 rounded-tl-lg">Cliente</th>
                      <th className="p-3">Veículo</th>
                      <th className="p-3">Datas</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 rounded-tr-lg">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reservationsList.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-slate-500">Sem reservas.</td></tr>}
                    {reservationsList.map(r => (
                      <tr key={r.id} className="border-b dark:border-slate-800">
                        <td className="p-3 font-bold">{r.driverName}<br/><span className="text-xs font-normal text-slate-500">{r.email}</span></td>
                        <td className="p-3">{r.selectedCar}</td>
                        <td className="p-3 text-sm">{r.startDate} <span className="text-slate-400">➜</span> {r.endDate}</td>
                        <td className="p-3"><span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-bold uppercase">{r.status || 'Confirmada'}</span></td>
                        <td className="p-3 text-sm"><button className="text-blue-500 hover:underline">Detalhes</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* TAB: USERS */}
            {adminTab === 'users' && (
              <div>
                 <button onClick={() => setIsUserModalOpen(true)} className="mb-4 bg-green-600 text-white px-4 py-2 rounded shadow">+ Utilizador</button>
                 <div className="space-y-2">
                    {users.map(u => (
                      <div key={u.id} className="flex items-center justify-between bg-white dark:bg-slate-800 p-4 rounded shadow">
                          <div>
                            <p className="font-bold">{u.name}</p>
                            <p className="text-sm text-slate-500">{u.email} ({u.role})</p>
                          </div>
                          <button onClick={() => { if(confirm('Remover user?')) { db.deleteUser(u.id); setUsers(db.getUsers()); }}} className="text-red-500 px-3">Remover</button>
                      </div>
                    ))}
                 </div>
              </div>
            )}
            
            {/* TAB: ASSISTANT (KNOWLEDGE) */}
            {adminTab === 'knowledge' && (
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg flex flex-col h-[600px] border dark:border-slate-700">
                    <div className="p-4 border-b dark:border-slate-700 bg-slate-50 dark:bg-slate-900 rounded-t-xl">
                        <h3 className="font-bold">Assistente Técnico & Pesquisa</h3>
                        <p className="text-xs text-slate-500">Use este chat para pesquisar leis, voos ou ajuda técnica.</p>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {adminChatHistory.map((msg, i) => (
                            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[80%] p-3 rounded-xl whitespace-pre-wrap ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-700'}`}>
                                    {msg.text}
                                </div>
                            </div>
                        ))}
                        <div ref={adminChatEndRef}></div>
                        {isAdminThinking && (
                            <div className="flex items-center gap-2 text-slate-500 text-sm">
                                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
                                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce delay-100"></div>
                                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce delay-200"></div>
                                Pesquisando...
                            </div>
                        )}
                    </div>
                    <div className="p-4 border-t dark:border-slate-700 bg-slate-50 dark:bg-slate-900 rounded-b-xl flex gap-2">
                        <input 
                            className="flex-1 p-3 border rounded-lg dark:bg-slate-800 focus:ring-2 focus:ring-blue-500 outline-none" 
                            placeholder="Ex: Qual o preço médio do gasóleo hoje?" 
                            value={adminInput}
                            onChange={e => setAdminInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleAdminChatSubmit()}
                        />
                        <button onClick={handleAdminChatSubmit} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 transition-colors">
                            Enviar
                        </button>
                    </div>
                </div>
            )}

            {/* TAB: SYSTEM */}
            {adminTab === 'system' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
                    <div className="bg-white dark:bg-slate-800 p-6 rounded shadow">
                        <h3 className="font-bold mb-4 text-lg">Google Integrations</h3>
                        <p className="text-sm text-slate-500 mb-4">Conecte a conta Google da empresa para ativar Calendário, Sheets e Gmail automático.</p>
                        
                        <label className="block text-xs uppercase text-slate-500 mb-1">Client ID</label>
                        <input className="border p-2 w-full mb-3 dark:bg-slate-900 rounded" placeholder="Google Client ID" value={googleClientId} onChange={e => {setGoogleClientId(e.target.value); localStorage.setItem('google_client_id', e.target.value)}} />
                        
                        <label className="block text-xs uppercase text-slate-500 mb-1">API Key</label>
                        <input className="border p-2 w-full mb-4 dark:bg-slate-900 rounded" placeholder="Google API Key" value={googleApiKey} onChange={e => {setGoogleApiKey(e.target.value); localStorage.setItem('google_api_key', e.target.value)}} />
                        
                        <div className="flex items-center gap-4 mb-6">
                           <button onClick={handleGoogleSignIn} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50" disabled={isGoogleSignedIn}>
                             {isGoogleSignedIn ? '✅ Google Conectado' : 'Conectar Google'}
                           </button>
                        </div>
                        
                        <div className="border-t pt-4">
                           <label className="block text-xs uppercase text-slate-500 mb-1">Google Sheet ID (para registo)</label>
                           <input className="border p-2 w-full mb-1 dark:bg-slate-900 rounded" placeholder="Spreadsheet ID (da URL)" value={googleSheetId} onChange={e => {setGoogleSheetId(e.target.value); localStorage.setItem('google_sheet_id', e.target.value)}} />
                           <p className="text-xs text-slate-400">Copie o ID da URL da folha de cálculo onde quer guardar as reservas.</p>
                        </div>

                        <p className="text-xs mt-6 text-slate-400">Authorized Origin: {window.location.origin}</p>
                    </div>

                    {/* NEW: Deployment Guide */}
                     <div className="bg-slate-50 dark:bg-slate-900 p-6 rounded shadow border dark:border-slate-700">
                        <h3 className="font-bold mb-4 text-lg flex items-center gap-2">🚀 Guia de Deploy & Setup</h3>
                        
                        <div className="space-y-6 text-sm">
                            <div>
                                <h4 className="font-bold text-blue-600 mb-2">1. Configurar Google Cloud (Cloud Shell)</h4>
                                <p className="mb-2 text-slate-600 dark:text-slate-400">Execute este comando no Google Cloud Shell para ativar as APIs necessárias:</p>
                                <div className="bg-black text-green-400 p-3 rounded font-mono text-xs overflow-x-auto select-all">
                                    gcloud services enable calendar-json.googleapis.com sheets.googleapis.com gmail.googleapis.com
                                </div>
                            </div>

                            <div>
                                <h4 className="font-bold text-blue-600 mb-2">2. Obter Credenciais</h4>
                                <ol className="list-decimal pl-5 space-y-1 text-slate-600 dark:text-slate-400">
                                    <li>Vá a <strong>APIs & Services > Credentials</strong>.</li>
                                    <li>Crie um <strong>OAuth Client ID</strong> (Web Application).</li>
                                    <li>Adicione o URL de produção (ex: <code>https://tua-app.vercel.app</code>) em <strong>Authorized JavaScript origins</strong>.</li>
                                    <li>Copie o <strong>Client ID</strong> e cole-o no formulário à esquerda.</li>
                                </ol>
                            </div>

                            <div>
                                <h4 className="font-bold text-blue-600 mb-2">3. Deploy na Vercel/Netlify</h4>
                                <ol className="list-decimal pl-5 space-y-1 text-slate-600 dark:text-slate-400">
                                    <li>Faça push do código para o GitHub.</li>
                                    <li>Importe o projeto na Vercel.</li>
                                    <li>Adicione a Environment Variable: <code>API_KEY</code> (A tua chave Gemini AI Studio).</li>
                                </ol>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Modal for New/Edit Car */}
            {isFleetModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-fade-in">
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl w-full max-w-lg shadow-2xl">
                        <h3 className="font-bold text-xl mb-6">Dados da Viatura</h3>
                        <input className="border p-3 w-full mb-3 dark:bg-slate-900 rounded" placeholder="Modelo (ex: Fiat Panda)" value={editingCar.model || ''} onChange={e => setEditingCar(p => ({...p, model: e.target.value}))} />
                        <input className="border p-3 w-full mb-3 dark:bg-slate-900 rounded" placeholder="Matrícula" value={editingCar.licensePlate || ''} onChange={e => setEditingCar(p => ({...p, licensePlate: e.target.value}))} />
                        <input className="border p-3 w-full mb-3 dark:bg-slate-900 rounded" placeholder="Preço (ex: 39€/dia)" value={editingCar.price || ''} onChange={e => setEditingCar(p => ({...p, price: e.target.value}))} />
                        
                        {isGoogleSignedIn && (
                            <div className="flex gap-2 my-2 bg-slate-50 dark:bg-slate-900 p-2 rounded">
                                <select className="bg-transparent flex-1 outline-none" value={editingCar.googleCalendarId || ''} onChange={e => setEditingCar(p => ({...p, googleCalendarId: e.target.value}))}>
                                    <option value="">-- Selecionar Calendário --</option>
                                    {userCalendars.map(c => <option key={c.id} value={c.id}>{c.summary}</option>)}
                                </select>
                                <button onClick={() => handleCreateCarCalendar(editingCar.model || 'Carro')} className="text-green-600 font-bold px-2 hover:bg-green-100 rounded" title="Criar Novo Calendário">+</button>
                            </div>
                        )}

                        <div className="flex justify-end gap-3 mt-6 border-t pt-4">
                            <button onClick={() => setIsFleetModalOpen(false)} className="px-4 py-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors">Cancelar</button>
                            <button onClick={() => { 
                              if(editingCar.id) db.updateCar(editingCar as CarDetails); 
                              else db.addCar(editingCar as CarDetails); 
                              setIsFleetModalOpen(false); 
                              setFleet(db.getFleet()); 
                            }} className="px-6 py-2 bg-blue-600 text-white rounded font-bold shadow hover:bg-blue-700 transition-colors">Guardar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
      ) : (
        <main className="container mx-auto px-4 py-4 flex flex-col min-h-screen">
             {/* HEADER AREA */}
             <div className="flex justify-end mb-4 fixed top-4 right-4 z-50">
                 <button onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')} className="w-10 h-10 bg-white dark:bg-slate-800 rounded-full shadow-lg flex items-center justify-center text-xl hover:scale-110 transition-transform">{theme === 'light' ? '🌙' : '☀️'}</button>
             </div>
             
             {/* TOP NAVIGATION / STEPPER - VISIBLE EXCEPT WELCOME */}
             {phase !== AppPhase.WELCOME && phase !== AppPhase.COMPLETED && (
                 <div className="pt-4 pb-4 sticky top-0 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-md z-40 transition-colors border-b border-slate-200 dark:border-slate-800">
                     {renderProgressStepper()}
                 </div>
             )}
             
             {phase === AppPhase.WELCOME && (
                <div className="flex flex-col items-center justify-center flex-1 text-center gap-6 mt-20 animate-scale-in">
                    <h1 className="text-5xl font-bold text-blue-600 drop-shadow-sm">AutoRent Azores</h1>
                    <p className="text-slate-500 text-lg max-w-md">O seu assistente de aluguer inteligente. Rápido, sem papel e seguro.</p>
                    <button onClick={() => connectToGemini()} className="bg-blue-600 text-white px-8 py-4 rounded-full text-xl font-bold shadow-xl hover:scale-105 transition-transform flex items-center gap-3">
                        <span className="text-2xl">🎙️</span> Iniciar Reserva
                    </button>
                    <button onClick={() => setPhase(AppPhase.ADMIN_LOGIN)} className="text-slate-400 text-sm mt-8 hover:text-slate-600 underline">Acesso Administrativo</button>
                </div>
             )}

             {phase === AppPhase.DETAILS && (
                 <div className="max-w-lg mx-auto w-full pt-8 animate-fade-in">
                     <h2 className="text-2xl font-bold mb-4">Os seus dados</h2>
                     <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow space-y-6 border border-slate-200 dark:border-slate-700">
                         <div>
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Nome Completo</label>
                            <input placeholder="Ex: João Silva" value={reservation.driverName || ''} onChange={e => setReservation(p => ({...p, driverName: e.target.value}))} className="w-full p-4 text-lg border rounded dark:bg-slate-900 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium placeholder-slate-400" />
                         </div>
                         <div className="flex gap-4">
                             <div className="flex-[2]">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Levantamento</label>
                                <div className="flex gap-2">
                                  <input type="date" value={reservation.startDate || ''} onChange={e => setReservation(p => ({...p, startDate: e.target.value}))} className="flex-[2] p-4 text-lg border rounded dark:bg-slate-900 focus:ring-2 focus:ring-blue-500 outline-none font-medium" />
                                  <input type="time" value={reservation.startTime || '10:00'} onChange={e => setReservation(p => ({...p, startTime: e.target.value}))} className="flex-[1] p-4 text-lg border rounded dark:bg-slate-900 focus:ring-2 focus:ring-blue-500 outline-none font-medium" />
                                </div>
                             </div>
                         </div>
                         <div className="flex gap-4">
                             <div className="flex-[2]">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Devolução</label>
                                <div className="flex gap-2">
                                  <input type="date" value={reservation.endDate || ''} onChange={e => setReservation(p => ({...p, endDate: e.target.value}))} className="flex-[2] p-4 text-lg border rounded dark:bg-slate-900 focus:ring-2 focus:ring-blue-500 outline-none font-medium" />
                                  <input type="time" value={reservation.endTime || '10:00'} onChange={e => setReservation(p => ({...p, endTime: e.target.value}))} className="flex-[1] p-4 text-lg border rounded dark:bg-slate-900 focus:ring-2 focus:ring-blue-500 outline-none font-medium" />
                                </div>
                             </div>
                         </div>
                         <div>
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Email</label>
                            <input type="email" placeholder="email@exemplo.com" value={reservation.email || ''} onChange={e => setReservation(p => ({...p, email: e.target.value}))} className={`w-full p-4 text-lg border rounded dark:bg-slate-900 focus:ring-2 outline-none transition-all font-medium ${reservation.email ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : ''}`} />
                         </div>
                         <div>
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Telefone</label>
                            <input type="tel" placeholder="+351 9..." value={reservation.phone || ''} onChange={e => setReservation(p => ({...p, phone: e.target.value}))} className={`w-full p-4 text-lg border rounded dark:bg-slate-900 focus:ring-2 outline-none transition-all font-medium ${reservation.phone ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : ''}`} />
                         </div>
                         
                         <div className="border-t pt-4">
                             <div className="flex justify-between mb-2"><span className="font-bold">Condutores Extra</span><button onClick={() => setReservation(p => ({...p, secondaryDrivers: [...(p.secondaryDrivers||[]), {id: Date.now().toString(), name: ''}]}))} className="text-blue-500 text-sm font-bold hover:underline">+ Adicionar</button></div>
                             {reservation.secondaryDrivers?.map((d, i) => (
                                 <div key={d.id} className="flex gap-2 mb-2 items-center">
                                     <span className="w-8 h-8 flex items-center justify-center bg-slate-100 dark:bg-slate-900 rounded-full font-bold text-sm">#{i+1}</span>
                                     <input placeholder="Nome 2º Condutor" value={d.name} onChange={e => { const list = [...reservation.secondaryDrivers!]; list[i].name = e.target.value; setReservation(p => ({...p, secondaryDrivers: list}))}} className="flex-1 p-2 border rounded dark:bg-slate-900" />
                                     <button onClick={() => removeSecondaryDriver(i)} className="text-red-500 hover:text-red-700 p-2" title="Remover">🗑️</button>
                                 </div>
                             ))}
                         </div>
                     </div>
                     <button onClick={() => setPhase(AppPhase.DOCUMENTS)} className="w-full mt-6 bg-blue-600 text-white py-4 rounded-xl font-bold shadow-lg hover:bg-blue-700 transition-colors">Continuar</button>
                 </div>
             )}

             {phase === AppPhase.DOCUMENTS && (
                 <div className="max-w-xl mx-auto w-full pt-8 animate-fade-in">
                     <h2 className="text-2xl font-bold mb-4 text-center">Documentos</h2>
                     <div className="space-y-6">
                         {/* Main Driver */}
                         <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border-l-4 border-blue-500 shadow-md">
                             <h3 className="font-bold mb-4 text-lg">Condutor Principal</h3>
                             <div className="grid grid-cols-2 gap-4">
                                 <button onClick={() => setActiveDocType('cc_front')} className={`p-4 border-2 border-dashed rounded-xl text-sm font-bold flex flex-col items-center gap-2 transition-colors ${reservation.uploadedFiles?.some(f => f.name.includes('cc_front')) ? 'bg-green-50 border-green-500 text-green-700' : 'hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
                                     <span className="text-2xl">🆔</span>
                                     CC Frente
                                 </button>
                                 <button onClick={() => setActiveDocType('dl_front')} className={`p-4 border-2 border-dashed rounded-xl text-sm font-bold flex flex-col items-center gap-2 transition-colors ${reservation.uploadedFiles?.some(f => f.name.includes('dl_front')) ? 'bg-green-50 border-green-500 text-green-700' : 'hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
                                    <span className="text-2xl">🚗</span>
                                    Carta Frente
                                 </button>
                             </div>
                         </div>

                         {/* Secondary Drivers */}
                         {reservation.secondaryDrivers?.map((d, i) => (
                             <div key={d.id} className="bg-white dark:bg-slate-800 p-6 rounded-xl border-l-4 border-purple-500 shadow-md">
                                 <h3 className="font-bold mb-4 text-lg">{d.name || `2º Condutor #${i+1}`}</h3>
                                 <div className="grid grid-cols-2 gap-4">
                                     <button onClick={() => setActiveDocType(`sec_${i}_cc_front`)} className={`p-4 border-2 border-dashed rounded-xl text-sm font-bold flex flex-col items-center gap-2 transition-colors ${d.ccFrontUploaded ? 'bg-green-50 border-green-500 text-green-700' : 'hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
                                         <span>🆔</span> CC Frente
                                     </button>
                                     <button onClick={() => setActiveDocType(`sec_${i}_dl_front`)} className={`p-4 border-2 border-dashed rounded-xl text-sm font-bold flex flex-col items-center gap-2 transition-colors ${d.dlFrontUploaded ? 'bg-green-50 border-green-500 text-green-700' : 'hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
                                         <span>🚗</span> Carta Frente
                                     </button>
                                 </div>
                             </div>
                         ))}
                     </div>
                     <button onClick={() => setPhase(AppPhase.VEHICLE_SELECTION)} className="w-full mt-8 bg-blue-600 text-white py-4 rounded-xl font-bold shadow-lg hover:bg-blue-700 transition-colors">Continuar</button>
                 </div>
             )}

             {phase === AppPhase.VEHICLE_SELECTION && (
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-8 animate-fade-in max-w-4xl mx-auto">
                     {fleet.map(c => (
                         <div key={c.id} onClick={() => setReservation(p => ({...p, selectedCar: c.model, licensePlate: c.licensePlate}))} className={`bg-white dark:bg-slate-800 p-4 rounded-2xl cursor-pointer border-2 shadow-lg transition-all hover:scale-105 ${reservation.selectedCar === c.model ? 'border-blue-500 ring-4 ring-blue-500/20' : 'border-transparent'}`}>
                             <div className="h-48 bg-slate-200 rounded-xl mb-4 overflow-hidden"><img src={c.image} className="w-full h-full object-cover" /></div>
                             <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="font-bold text-xl">{c.model}</h3>
                                    <p className="text-slate-500 text-sm">{c.category}</p>
                                </div>
                                <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full font-bold">{c.price}</span>
                             </div>
                         </div>
                     ))}
                     <button onClick={() => setPhase(AppPhase.PICKUP_INSPECTION)} className="md:col-span-2 mt-6 bg-blue-600 text-white py-4 rounded-xl font-bold shadow-lg hover:bg-blue-700">Confirmar {reservation.selectedCar}</button>
                 </div>
             )}

             {phase === AppPhase.PICKUP_INSPECTION && (
                 <div className="max-w-md mx-auto pt-8 animate-fade-in">
                     <h2 className="text-2xl font-bold mb-6 text-center">Vistoria Inicial</h2>
                     <div className="space-y-6">
                        <CameraCapture label="Painel de Instrumentos (Km/Combustível)" onCapture={(d) => handleDashboardCapture(d)} />
                        <CameraCapture label="Estado Exterior (Vídeo 360º)" mode="video" onCapture={(d) => handleCapture(d, 'video', 'Vistoria')} />
                     </div>
                     <button onClick={() => setPhase(AppPhase.CONTRACT_SIGNATURE)} className="w-full mt-8 bg-blue-600 text-white py-4 rounded-xl font-bold shadow-lg hover:bg-blue-700">Validar Inspeção</button>
                 </div>
             )}

             {phase === AppPhase.CONTRACT_SIGNATURE && (
                 <div className="max-w-md mx-auto pt-8 animate-fade-in">
                     <h2 className="text-2xl font-bold mb-6 text-center">Assinatura Digital</h2>
                     <p className="text-center text-slate-500 mb-4 text-sm">Por favor assine na caixa abaixo para aceitar os termos.</p>
                     <SignaturePad onSave={handleSignature} />
                 </div>
             )}

             {phase === AppPhase.CONTRACT_PREVIEW && (
                 <div className="max-w-2xl mx-auto bg-white text-black p-8 rounded shadow-xl text-sm pt-8 animate-fade-in relative" ref={contractRef}>
                     <div className="absolute top-4 right-4 text-xs text-slate-400">REF: {Date.now()}</div>
                     <h1 className="text-2xl font-bold border-b-2 border-black pb-4 mb-6">CONTRATO DE ALUGUER</h1>
                     
                     <div className="grid grid-cols-2 gap-8 mb-8">
                         <div>
                             <h3 className="font-bold uppercase text-xs text-slate-500 mb-1">Cliente</h3>
                             <p className="text-lg">{reservation.driverName}</p>
                             <p>{reservation.email}</p>
                             <p>{reservation.phone}</p>
                         </div>
                         <div>
                             <h3 className="font-bold uppercase text-xs text-slate-500 mb-1">Viatura</h3>
                             <p className="text-lg">{reservation.selectedCar}</p>
                             <p className="font-mono bg-slate-100 inline-block px-2">{reservation.licensePlate}</p>
                         </div>
                     </div>

                     <div className="bg-slate-50 p-4 rounded mb-8">
                        <div className="flex justify-between mb-2 border-b pb-2">
                            <span>Levantamento</span>
                            <strong>{reservation.startDate}</strong>
                        </div>
                        <div className="flex justify-between">
                            <span>Devolução</span>
                            <strong>{reservation.endDate}</strong>
                        </div>
                     </div>

                     {reservation.secondaryDrivers && reservation.secondaryDrivers.length > 0 && (
                         <div className="mb-8">
                             <strong className="block mb-2">Condutores Adicionais:</strong>
                             <ul className="list-disc pl-5 space-y-1">
                                 {reservation.secondaryDrivers.map(d => <li key={d.id}>{d.name} (CC: {d.ccNumber || 'N/A'})</li>)}
                             </ul>
                         </div>
                     )}

                     <div className="mt-12 flex justify-between items-end">
                        <div className="text-center">
                            <div className="h-24 mb-2 border-b border-black w-48 flex items-end justify-center">
                                {reservation.signature && <img src={reservation.signature} className="h-full object-contain" />}
                            </div>
                            <p className="text-xs uppercase">Assinatura do Cliente</p>
                        </div>
                        <div className="text-center opacity-50">
                            <div className="h-24 mb-2 border-b border-black w-48 flex items-end justify-center">
                                <span className="font-handwriting text-2xl">AutoRent Rep.</span>
                            </div>
                            <p className="text-xs uppercase">Pela AutoRent</p>
                        </div>
                     </div>

                     <button onClick={finishReservation} className="fixed bottom-6 right-6 bg-green-600 text-white px-8 py-4 rounded-full shadow-2xl font-bold text-lg hover:bg-green-700 hover:scale-105 transition-all flex items-center gap-2">
                        <span>✅</span> Finalizar Contrato
                     </button>
                 </div>
             )}

             {phase === AppPhase.COMPLETED && (
                 <div className="flex flex-col items-center justify-center flex-1 animate-scale-in text-center p-4">
                     <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center text-5xl mb-6 text-green-600">✓</div>
                     <h2 className="text-4xl font-bold mb-4">Reserva Confirmada!</h2>
                     <p className="text-xl text-slate-600 mb-8">Obrigado, {reservation.driverName}.<br/>Enviámos os detalhes para o seu email.</p>
                     <button onClick={() => { 
                         setReservation({
                             documentsUploaded: false,
                             transcript: [],
                             driverName: '',
                             email: '',
                             phone: '',
                             startDate: '',
                             startTime: '10:00',
                             endDate: '',
                             endTime: '10:00',
                             uploadedFiles: [],
                             secondaryDrivers: []
                         }); 
                         setPhase(AppPhase.WELCOME); 
                     }} className="bg-slate-200 dark:bg-slate-800 px-8 py-3 rounded-full font-bold hover:bg-slate-300 transition-colors">Voltar ao Início</button>
                 </div>
             )}
        </main>
      )}

      {/* Camera Overlay Modal */}
      {activeDocType && (
          <div className="fixed inset-0 bg-black/95 z-[60] p-4 flex flex-col animate-fade-in">
              {isAnalyzing ? (
                  <div className="flex flex-col items-center justify-center h-full text-white animate-pulse">
                      <div className="w-20 h-20 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-6"></div>
                      <h3 className="text-2xl font-bold mb-2">A processar documento...</h3>
                      <p className="text-slate-400">A extrair dados automaticamente via AI</p>
                  </div>
              ) : (
                  <>
                    <button onClick={() => setActiveDocType(null)} className="text-white mb-6 text-right font-bold text-lg px-4 hover:text-slate-300">✕ Fechar</button>
                    <div className="flex-1 flex items-center justify-center">
                        <div className="w-full max-w-lg bg-slate-900 rounded-2xl p-2 shadow-2xl border border-slate-700">
                            <CameraCapture 
                                label={activeDocType.includes('sec') ? "Documento 2º Condutor" : "Documento Principal"} 
                                onCapture={(d) => handleCapture(d, 'image', activeDocType)} 
                            />
                        </div>
                    </div>
                  </>
              )}
          </div>
      )}

      {/* Admin Login Modal */}
      {phase === AppPhase.ADMIN_LOGIN && (
          <div className="fixed inset-0 bg-slate-100 dark:bg-slate-900 flex items-center justify-center p-4 z-50">
              <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-2xl w-full max-w-sm">
                  <h2 className="text-2xl font-bold mb-6 text-center">Acesso Reservado</h2>
                  <input type="password" placeholder="Palavra-passe" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} className="border p-4 w-full mb-4 dark:bg-slate-900 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" onKeyDown={e => e.key === 'Enter' && handleAdminLogin()} autoFocus />
                  <button onClick={handleAdminLogin} className="bg-blue-600 text-white w-full py-3 rounded-lg font-bold hover:bg-blue-700 transition-colors">Entrar</button>
                  <button onClick={() => setPhase(AppPhase.WELCOME)} className="w-full mt-4 text-sm text-slate-500 hover:underline text-center">Voltar ao ecrã inicial</button>
              </div>
          </div>
      )}

      {/* Voice Assistant Floating Bar */}
      <div className={`fixed bottom-0 left-0 right-0 p-4 transition-transform duration-500 ease-in-out z-40 ${isMicActive ? 'translate-y-0' : 'translate-y-full'}`}>
          <div className="max-w-xl mx-auto bg-slate-900/95 backdrop-blur text-white p-4 rounded-2xl flex items-center gap-4 shadow-2xl border border-white/10 ring-1 ring-white/20">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center animate-pulse shadow-lg shadow-blue-500/30">
                  <span className="text-2xl">🎙️</span>
              </div>
              <div className="flex-1">
                  <p className="font-bold text-lg">AutoRent AI a ouvir...</p>
                  <div className="h-1.5 bg-white/10 rounded-full mt-2 w-full overflow-hidden">
                      <div className="h-full bg-blue-400 transition-all duration-100 ease-linear" style={{width: `${Math.min(100, audioVolume*200)}%`}}></div>
                  </div>
              </div>
              <button onClick={() => disconnect()} className="bg-white/10 hover:bg-white/20 p-3 rounded-full transition-colors" title="Parar Assistente">
                  ✕
              </button>
          </div>
      </div>

      {error && <ErrorNotification message={error} onRetry={() => connectToGemini(true)} onDismiss={() => setError(null)} onContactSupport={() => alert("Call support")} />}
    </div>
  );
}
