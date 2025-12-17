
import React, { useState, useEffect, useRef } from 'react';
import { AppPhase, ReservationData, CarDetails, ChatMessage, UserProfile, GoogleCalendar, ServiceItem, HealthReport } from './types';
import { base64ToArrayBuffer, decodeAudioData, createPcmBlob } from './services/audioUtils';
import { analyzeDocument, checkSystemHealth } from './services/geminiService';
import { systemMonitor } from './services/systemMonitor'; 
import { notificationManager, AppNotification } from './services/notificationManager';
import { db } from './services/mockDatabase'; 
import { googlePlatformService } from './services/googleCalendar'; 
import CameraCapture from './components/CameraCapture';
import SignaturePad from './components/SignaturePad';
import ErrorNotification from './components/ErrorNotification';
import ToastSystem from './components/ToastSystem';
import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type } from '@google/genai';

const FLOW_STEPS = [
  { id: AppPhase.DETAILS, label: 'Dados', icon: '📅' },
  { id: AppPhase.DOCUMENTS, label: 'Docs', icon: '🪪' },
  { id: AppPhase.VEHICLE_SELECTION, label: 'Viatura', icon: '🚗' },
  { id: AppPhase.PICKUP_INSPECTION, label: 'Vistoria', icon: '🔍' },
  { id: AppPhase.CONTRACT_SIGNATURE, label: 'Assinar', icon: '✍️' },
  { id: AppPhase.CONTRACT_PREVIEW, label: 'Contrato', icon: '📄' },
];

const SYSTEM_INSTRUCTION = `
Você é o "Agente AutoRent", especializado em reservas de veículos nos Açores.
Fale sempre em Português de Portugal (PT-PT). Sua voz deve ser amigável e profissional.

MISSÃO CRÍTICA:
1. Assim que a conversa começar, use a ferramenta 'navigateApp' para ir para o ecrã 'DETAILS'.
2. Pergunte imediatamente: "Olá! Sou o seu assistente AutoRent. Para que datas e a que horas deseja alugar o veículo?".
3. RECOLHA OBRIGATÓRIA:
   - Data de Início e HORA de Início.
   - Data de Fim e HORA de Fim.
   - Se o cliente der apenas a data (ex: "Dia 10 a 15"), responda: "Excelente. E a que horas pretende levantar o carro no dia 10 e devolver no dia 15?".
   - Use 'updateReservationDetails' para cada campo que o cliente fornecer.

4. SEGUIMENTO:
   - Assim que tiver datas e horas, confirme-as e pergunte o nome do condutor.
   - Não avance para 'DOCUMENTS' até o utilizador confirmar que os dados da viagem estão corretos.
`;

const updateReservationTool: FunctionDeclaration = {
  name: "updateReservationDetails",
  description: "Updates reservation form fields (dates, times, names).",
  parameters: {
    type: Type.OBJECT,
    properties: {
      startDate: { type: Type.STRING, description: "YYYY-MM-DD" },
      startTime: { type: Type.STRING, description: "HH:mm" },
      endDate: { type: Type.STRING, description: "YYYY-MM-DD" },
      endTime: { type: Type.STRING, description: "HH:mm" },
      driverName: { type: Type.STRING },
      email: { type: Type.STRING },
      phone: { type: Type.STRING }
    }
  }
};

const navigateTool: FunctionDeclaration = {
  name: "navigateApp",
  description: "Navigates the user to a specific app screen.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      screen: { type: Type.STRING, enum: ["DETAILS", "DOCUMENTS", "VEHICLE_SELECTION", "PICKUP_INSPECTION", "CONTRACT_SIGNATURE", "CONTRACT_PREVIEW"] }
    },
    required: ["screen"]
  }
};

export default function App() {
  const [phase, setPhase] = useState<AppPhase>(AppPhase.WELCOME);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [loginPassword, setLoginPassword] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
      if (typeof window !== 'undefined') {
          return localStorage.getItem('theme') === 'dark' || (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
      }
      return 'light';
  });

  const [fleet, setFleet] = useState<CarDetails[]>([]);
  const [reservation, setReservation] = useState<ReservationData>({
    documentsUploaded: false,
    transcript: [],
    driverName: '',
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: '',
    pickupLocation: 'Aeroporto Ponta Delgada',
    returnLocation: 'Aeroporto Ponta Delgada',
    secondaryDrivers: []
  });
  
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isMicActive, setIsMicActive] = useState(false);
  const [audioVolume, setAudioVolume] = useState(0);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeDocType, setActiveDocType] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const activeSessionRef = useRef<any>(null);
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  useEffect(() => {
    if (theme === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    setFleet(db.getFleet());
    systemMonitor.runDailyHealthCheck();
  }, []);

  const connectToGemini = async () => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextRef.current = audioContext;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;

      const inputContext = new AudioContext({ sampleRate: 16000 });
      const source = inputContext.createMediaStreamSource(stream);
      const processor = inputContext.createScriptProcessor(4096, 1, 1);

      let nextStartTime = 0;
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          systemInstruction: SYSTEM_INSTRUCTION,
          tools: [{ functionDeclarations: [navigateTool, updateReservationTool] }, { googleSearch: {} }],
        },
        callbacks: {
          onopen: () => { setConnected(true); setIsMicActive(true); },
          onmessage: async (msg: LiveServerMessage) => {
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
                    const args = fc.args as any;
                    if (fc.name === 'navigateApp') setPhase(args.screen as AppPhase);
                    if (fc.name === 'updateReservationDetails') setReservation(prev => ({ ...prev, ...args }));
                    return { id: fc.id, name: fc.name, response: { status: "success" } };
                }));
                const session = await sessionPromise;
                session.sendToolResponse({ functionResponses: responses });
            }
          },
          onerror: () => setError("Erro na ligação de voz."),
          onclose: () => setConnected(false)
        }
      });
      
      activeSessionRef.current = await sessionPromise;

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        let sum = 0;
        for(let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
        setAudioVolume(Math.sqrt(sum / inputData.length) * 100);
        const pcmBlob = createPcmBlob(inputData);
        activeSessionRef.current?.sendRealtimeInput({ media: pcmBlob });
      };
      source.connect(processor);
      processor.connect(inputContext.destination);
    } catch (err) {
      setError("Permita o acesso ao microfone.");
    }
  };

  const disconnect = () => {
    if (audioStreamRef.current) audioStreamRef.current.getTracks().forEach(t => t.stop());
    if (audioContextRef.current) audioContextRef.current.close();
    setConnected(false);
    setIsMicActive(false);
  };

  const handleAdminLogin = () => {
    const user = db.login(loginPassword);
    if (user) { setCurrentUser(user); setPhase(AppPhase.ADMIN_DASHBOARD); }
    else alert("Incorreto.");
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white transition-colors">
      <ToastSystem notifications={notifications} onRemove={(id) => setNotifications(p => p.filter(n => n.id !== id))} />
      
      {phase === AppPhase.ADMIN_DASHBOARD ? (
        <div className="p-8 max-w-7xl mx-auto text-center">
            <h1 className="text-3xl font-black text-blue-600 mb-8">AutoRent Admin</h1>
            <p className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-xl">Painel em desenvolvimento.</p>
            <button onClick={() => setPhase(AppPhase.WELCOME)} className="mt-8 text-red-500 font-bold">Sair</button>
        </div>
      ) : (
        <main className="container mx-auto px-4 py-6 max-w-2xl flex flex-col min-h-screen">
             <header className="flex justify-between items-center mb-10">
                 <div className="text-2xl font-black tracking-tighter text-blue-600">AUTORENT</div>
                 <button onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')} className="w-10 h-10 bg-white dark:bg-slate-800 rounded-full shadow flex items-center justify-center">{theme === 'light' ? '🌙' : '☀️'}</button>
             </header>
             
             {phase !== AppPhase.WELCOME && phase !== AppPhase.COMPLETED && (
                 <nav className="mb-12 flex justify-between relative px-2">
                    <div className="absolute top-6 left-0 right-0 h-0.5 bg-slate-200 dark:bg-slate-800 -z-0"></div>
                    {FLOW_STEPS.map((s, i) => {
                        const activeIdx = FLOW_STEPS.findIndex(x => x.id === phase);
                        const isPast = i < activeIdx;
                        const isCurrent = i === activeIdx;
                        return (
                            <div key={s.id} className="z-10 flex flex-col items-center">
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center border-4 transition-all ${isPast || isCurrent ? 'bg-blue-600 border-blue-100 dark:border-blue-900 text-white' : 'bg-slate-100 dark:bg-slate-800 border-slate-50 dark:border-slate-900 text-slate-400'}`}>
                                    {isPast ? '✓' : s.icon}
                                </div>
                                <span className={`text-[10px] mt-2 font-black uppercase ${isCurrent ? 'text-blue-600' : 'text-slate-400'}`}>{s.label}</span>
                            </div>
                        )
                    })}
                 </nav>
             )}
             
             {phase === AppPhase.WELCOME && (
                <div className="flex flex-col items-center justify-center flex-1 text-center animate-scale-in">
                    <div className="w-32 h-32 bg-blue-600 rounded-[2.5rem] flex items-center justify-center text-6xl shadow-2xl mb-10 transform -rotate-6">🚗</div>
                    <h1 className="text-5xl font-black mb-4 tracking-tight">Viagens Sem Papel.</h1>
                    <p className="text-slate-500 text-lg mb-12 max-w-xs mx-auto">Alugue a sua viatura nos Açores através de voz.</p>
                    <button onClick={connectToGemini} className="bg-blue-600 text-white w-full py-5 rounded-2xl text-xl font-bold shadow-2xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-4">
                        <span className="text-2xl">🎙️</span> Iniciar Reserva
                    </button>
                    <button onClick={() => setPhase(AppPhase.ADMIN_LOGIN)} className="mt-8 text-slate-400 font-bold uppercase text-xs tracking-widest">Acesso Staff</button>
                </div>
             )}

             {phase === AppPhase.DETAILS && (
                 <div className="animate-fade-in space-y-6">
                     <div className="bg-white dark:bg-slate-800 p-8 rounded-[2.5rem] shadow-xl border border-slate-100 dark:border-slate-700 space-y-8">
                         <h2 className="text-2xl font-black flex items-center gap-3">
                             <span className="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center text-sm">01</span>
                             Dados da Reserva
                         </h2>
                         
                         <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">📅 Data Levantamento</label>
                                    <input type="date" value={reservation.startDate} onChange={e => setReservation(p => ({...p, startDate: e.target.value}))} className="w-full p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border-2 border-transparent focus:border-blue-500 outline-none font-bold" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">🕒 Hora Levantamento</label>
                                    <input type="time" value={reservation.startTime} onChange={e => setReservation(p => ({...p, startTime: e.target.value}))} className="w-full p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border-2 border-transparent focus:border-blue-500 outline-none font-bold text-blue-600" />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">📅 Data Devolução</label>
                                    <input type="date" value={reservation.endDate} onChange={e => setReservation(p => ({...p, endDate: e.target.value}))} className="w-full p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border-2 border-transparent focus:border-blue-500 outline-none font-bold" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">🕒 Hora Devolução</label>
                                    <input type="time" value={reservation.endTime} onChange={e => setReservation(p => ({...p, endTime: e.target.value}))} className="w-full p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border-2 border-transparent focus:border-blue-500 outline-none font-bold text-blue-600" />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">👤 Nome Completo</label>
                                <input placeholder="Nome do Condutor" value={reservation.driverName} onChange={e => setReservation(p => ({...p, driverName: e.target.value}))} className="w-full p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border-2 border-transparent focus:border-blue-500 outline-none font-bold" />
                            </div>
                         </div>
                     </div>
                     <button onClick={() => setPhase(AppPhase.DOCUMENTS)} className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black text-lg shadow-xl">Prosseguir para Documentos</button>
                 </div>
             )}

             {phase === AppPhase.DOCUMENTS && (
                 <div className="animate-fade-in space-y-6">
                    <h2 className="text-2xl font-black">Validar Identidade</h2>
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl space-y-4">
                        <button onClick={() => setActiveDocType('cc')} className="w-full p-5 border-2 border-dashed border-slate-300 rounded-2xl font-bold flex justify-between items-center hover:bg-slate-50">
                            <span>🪪 Cartão de Cidadão</span>
                            <span>📸 Capturar</span>
                        </button>
                        <button onClick={() => setActiveDocType('dl')} className="w-full p-5 border-2 border-dashed border-slate-300 rounded-2xl font-bold flex justify-between items-center hover:bg-slate-50">
                            <span>🚗 Carta de Condução</span>
                            <span>📸 Capturar</span>
                        </button>
                    </div>
                    <button onClick={() => setPhase(AppPhase.VEHICLE_SELECTION)} className="w-full py-5 bg-slate-200 dark:bg-slate-700 rounded-2xl font-black">Pular (Debug)</button>
                 </div>
             )}

             {phase === AppPhase.COMPLETED && (
                 <div className="flex-1 flex flex-col items-center justify-center text-center">
                    <div className="w-20 h-20 bg-green-500 text-white rounded-full flex items-center justify-center text-4xl mb-6 shadow-xl shadow-green-500/20">✓</div>
                    <h2 className="text-4xl font-black mb-2">Reserva Concluída!</h2>
                    <p className="text-slate-500">Obrigado pela preferência, {reservation.driverName}.</p>
                    <button onClick={() => window.location.reload()} className="mt-10 px-8 py-4 bg-blue-600 text-white rounded-full font-bold">Nova Reserva</button>
                 </div>
             )}
        </main>
      )}

      {/* Mic Bar */}
      <div className={`fixed bottom-6 left-6 right-6 transition-all duration-500 ${isMicActive ? 'translate-y-0 opacity-100' : 'translate-y-40 opacity-0'}`}>
          <div className="max-w-md mx-auto bg-slate-900 text-white p-4 rounded-3xl flex items-center gap-4 shadow-2xl border border-white/10">
              <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center animate-pulse">🎙️</div>
              <div className="flex-1">
                  <p className="text-[10px] font-black text-blue-400 uppercase mb-1">Assistente Ativo</p>
                  <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500" style={{width: `${Math.min(100, audioVolume * 3)}%`}}></div>
                  </div>
              </div>
              <button onClick={disconnect} className="p-2 hover:bg-white/10 rounded-lg">✕</button>
          </div>
      </div>

      {activeDocType && (
          <div className="fixed inset-0 bg-black/90 z-[100] p-6 flex items-center justify-center">
              <div className="w-full max-w-lg bg-white rounded-3xl overflow-hidden relative">
                  <button onClick={() => setActiveDocType(null)} className="absolute top-4 right-4 z-10 text-white bg-black/50 p-2 rounded-full">✕</button>
                  <CameraCapture label="Capture o Documento" onCapture={async (d) => {
                      setIsAnalyzing(true);
                      const res = await analyzeDocument(d.split(',')[1], activeDocType);
                      setReservation(prev => ({ ...prev, ...res }));
                      setIsAnalyzing(false);
                      setActiveDocType(null);
                  }} />
                  {isAnalyzing && <div className="absolute inset-0 bg-blue-600/80 flex items-center justify-center text-white font-black text-xl">A analisar...</div>}
              </div>
          </div>
      )}

      {phase === AppPhase.ADMIN_LOGIN && (
          <div className="fixed inset-0 bg-slate-900/90 flex items-center justify-center p-6 z-[100]">
              <div className="bg-white dark:bg-slate-800 p-10 rounded-[2.5rem] w-full max-w-sm text-center shadow-2xl">
                  <h2 className="text-2xl font-black mb-8">Acesso Staff</h2>
                  <input type="password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} className="w-full p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl mb-6 text-center text-2xl" placeholder="Senha" onKeyDown={e => e.key === 'Enter' && handleAdminLogin()} />
                  <button onClick={handleAdminLogin} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black">Entrar</button>
                  <button onClick={() => setPhase(AppPhase.WELCOME)} className="mt-4 text-slate-400 text-xs font-bold uppercase">Voltar</button>
              </div>
          </div>
      )}

      {error && <ErrorNotification message={error} onRetry={connectToGemini} onDismiss={() => setError(null)} onContactSupport={() => {}} />}
    </div>
  );
}
