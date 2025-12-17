
import React, { useState, useEffect, useRef } from 'react';
import { AppPhase, ReservationData, CarDetails, ChatMessage, UserProfile, ServiceItem } from './types';
import { base64ToArrayBuffer, decodeAudioData, createPcmBlob } from './services/audioUtils';
import { analyzeDocument } from './services/geminiService';
import { systemMonitor } from './services/systemMonitor'; 
import { db } from './services/mockDatabase'; 
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
Você é o "Agente AutoRent", o especialista em reservas da AutoRent Azores.
Fale sempre em Português de Portugal (PT-PT).

MISSÃO PRINCIPAL:
1. Assim que a conversa começar, use 'navigateApp' para o ecrã 'DETAILS'.
2. Peça imediatamente: Data de Início, Hora de Início, Data de Fim e Hora de Fim.
3. Se o cliente der as datas mas esquecer as horas, insista gentilmente: "E a que horas pretende levantar e devolver a viatura?".
4. Use 'updateReservationDetails' para preencher os campos assim que ouvir os dados.

ESTILO:
Profissional, acolhedor e focado na eficiência.
`;

const updateReservationTool: FunctionDeclaration = {
  name: "updateReservationDetails",
  description: "Updates fields in the reservation form.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      startDate: { type: Type.STRING },
      startTime: { type: Type.STRING },
      endDate: { type: Type.STRING },
      endTime: { type: Type.STRING },
      driverName: { type: Type.STRING },
      email: { type: Type.STRING }
    }
  }
};

const navigateTool: FunctionDeclaration = {
  name: "navigateApp",
  description: "Changes the current screen of the application.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      screen: { type: Type.STRING, enum: Object.values(AppPhase) }
    },
    required: ["screen"]
  }
};

export default function App() {
  const [phase, setPhase] = useState<AppPhase>(AppPhase.WELCOME);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
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
    setFleet(db.getFleet());
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) setTheme('dark');
  }, []);

  useEffect(() => {
    document.documentElement.className = theme;
  }, [theme]);

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
          onerror: () => setError("Erro na ligação. Verifique a sua chave API."),
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
      setError("Acesso ao microfone negado.");
    }
  };

  const disconnect = () => {
    if (audioStreamRef.current) audioStreamRef.current.getTracks().forEach(t => t.stop());
    if (audioContextRef.current) audioContextRef.current.close();
    setConnected(false);
    setIsMicActive(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white transition-colors selection:bg-blue-500 selection:text-white">
      <ToastSystem notifications={[]} onRemove={() => {}} />
      
      <main className="container mx-auto px-4 py-6 max-w-2xl flex flex-col min-h-screen">
          <header className="flex justify-between items-center mb-10">
              <div className="text-2xl font-black tracking-tighter text-blue-600">AUTORENT</div>
              <button onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')} className="w-10 h-10 bg-white dark:bg-slate-800 rounded-full shadow flex items-center justify-center border dark:border-slate-700">
                {theme === 'light' ? '🌙' : '☀️'}
              </button>
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
                              <span className={`text-[10px] mt-2 font-black uppercase tracking-tighter ${isCurrent ? 'text-blue-600' : 'text-slate-400'}`}>{s.label}</span>
                          </div>
                      )
                  })}
              </nav>
          )}

          {phase === AppPhase.WELCOME && (
              <div className="flex flex-col items-center justify-center flex-1 text-center animate-in fade-in zoom-in duration-500">
                  <div className="w-32 h-32 bg-blue-600 rounded-[2.5rem] flex items-center justify-center text-6xl shadow-2xl shadow-blue-500/30 mb-10 transform -rotate-6">🚗</div>
                  <h1 className="text-5xl font-black mb-4 tracking-tight leading-none">A sua viagem<br/>começa aqui.</h1>
                  <p className="text-slate-500 dark:text-slate-400 text-lg mb-12 max-w-xs mx-auto">Reserve a sua viatura nos Açores através de conversação inteligente.</p>
                  <button onClick={connectToGemini} className="bg-blue-600 text-white w-full py-5 rounded-2xl text-xl font-bold shadow-2xl hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-center gap-4 group">
                      <span className="text-2xl group-hover:animate-bounce">🎙️</span> Iniciar Reserva
                  </button>
                  <button onClick={() => setPhase(AppPhase.ADMIN_LOGIN)} className="mt-8 text-slate-400 font-bold uppercase text-xs tracking-widest hover:text-blue-600 transition-colors">Acesso Staff</button>
              </div>
          )}

          {phase === AppPhase.DETAILS && (
              <div className="animate-in slide-in-from-bottom-4 duration-500 space-y-6">
                  <div className="bg-white dark:bg-slate-800 p-8 rounded-[2.5rem] shadow-xl border border-slate-100 dark:border-slate-700 space-y-8">
                      <h2 className="text-2xl font-black flex items-center gap-3">
                          <span className="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center text-sm">01</span>
                          Dados da Reserva
                      </h2>
                      
                      <div className="space-y-6">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-2">
                                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">📅 Data Levantamento</label>
                                  <input type="date" value={reservation.startDate} onChange={e => setReservation(p => ({...p, startDate: e.target.value}))} className="w-full p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border-2 border-transparent focus:border-blue-500 outline-none font-bold" />
                              </div>
                              <div className="space-y-2">
                                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">🕒 Hora Levantamento</label>
                                  <input type="time" value={reservation.startTime} onChange={e => setReservation(p => ({...p, startTime: e.target.value}))} className="w-full p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border-2 border-transparent focus:border-blue-500 outline-none font-bold text-blue-600" />
                              </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-2">
                                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">📅 Data Devolução</label>
                                  <input type="date" value={reservation.endDate} onChange={e => setReservation(p => ({...p, endDate: e.target.value}))} className="w-full p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border-2 border-transparent focus:border-blue-500 outline-none font-bold" />
                              </div>
                              <div className="space-y-2">
                                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">🕒 Hora Devolução</label>
                                  <input type="time" value={reservation.endTime} onChange={e => setReservation(p => ({...p, endTime: e.target.value}))} className="w-full p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border-2 border-transparent focus:border-blue-500 outline-none font-bold text-blue-600" />
                              </div>
                          </div>

                          <div className="space-y-2">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">👤 Nome do Condutor</label>
                              <input placeholder="Ex: Maria Silva" value={reservation.driverName} onChange={e => setReservation(p => ({...p, driverName: e.target.value}))} className="w-full p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border-2 border-transparent focus:border-blue-500 outline-none font-bold" />
                          </div>
                      </div>
                  </div>
                  <button onClick={() => setPhase(AppPhase.DOCUMENTS)} className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black text-lg shadow-xl hover:bg-blue-700 transition-colors">Confirmar e Prosseguir</button>
              </div>
          )}

          {phase === AppPhase.DOCUMENTS && (
              <div className="animate-in slide-in-from-bottom-4 duration-500 space-y-6">
                  <h2 className="text-2xl font-black">Digitalização de Documentos</h2>
                  <div className="grid grid-cols-1 gap-4">
                      <button onClick={() => setActiveDocType('cc')} className="group p-6 bg-white dark:bg-slate-800 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-blue-500 transition-all text-left">
                          <div className="text-3xl mb-3">🪪</div>
                          <h3 className="font-bold text-lg">Cartão de Cidadão</h3>
                          <p className="text-sm text-slate-500">Capture a frente e o verso.</p>
                      </button>
                      <button onClick={() => setActiveDocType('dl')} className="group p-6 bg-white dark:bg-slate-800 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-blue-500 transition-all text-left">
                          <div className="text-3xl mb-3">🚗</div>
                          <h3 className="font-bold text-lg">Carta de Condução</h3>
                          <p className="text-sm text-slate-500">Obrigatória para levantamento.</p>
                      </button>
                  </div>
                  <button onClick={() => setPhase(AppPhase.VEHICLE_SELECTION)} className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black shadow-lg">Escolher Veículo</button>
              </div>
          )}

          {phase === AppPhase.VEHICLE_SELECTION && (
              <div className="animate-in slide-in-from-bottom-4 duration-500 space-y-6">
                  <h2 className="text-2xl font-black">Selecione a Viatura</h2>
                  {fleet.map(car => (
                      <div key={car.id} onClick={() => { setReservation(p => ({...p, selectedCar: car.model, licensePlate: car.licensePlate})); setPhase(AppPhase.PICKUP_INSPECTION); }} 
                           className="bg-white dark:bg-slate-800 p-5 rounded-[2rem] border-2 border-transparent hover:border-blue-600 cursor-pointer shadow-lg transition-all group">
                          <div className="aspect-video bg-slate-100 dark:bg-slate-900 rounded-2xl overflow-hidden mb-4">
                              <img src={car.image} className="w-full h-full object-cover group-hover:scale-105 transition-transform" alt={car.model} />
                          </div>
                          <div className="flex justify-between items-end">
                              <div>
                                  <h3 className="font-black text-xl">{car.model}</h3>
                                  <p className="text-slate-500 font-bold text-sm">{car.category} • {car.specs}</p>
                              </div>
                              <div className="text-right">
                                  <div className="text-blue-600 font-black text-2xl">{car.price}</div>
                                  <div className="text-[10px] text-slate-400 font-black uppercase">por dia</div>
                              </div>
                          </div>
                      </div>
                  ))}
              </div>
          )}

          {phase === AppPhase.PICKUP_INSPECTION && (
              <div className="animate-in slide-in-from-bottom-4 duration-500 space-y-6">
                  <div className="text-center">
                    <h2 className="text-2xl font-black">Vistoria de Check-in</h2>
                    <p className="text-slate-500">Registe o estado atual da viatura.</p>
                  </div>
                  <div className="bg-white dark:bg-slate-800 p-8 rounded-[2rem] shadow-xl border dark:border-slate-700 space-y-6">
                      <CameraCapture label="Foto do Painel (KM e Combustível)" onCapture={() => {}} mode="photo" />
                      <CameraCapture label="Vídeo Exterior da Viatura" onCapture={() => {}} mode="video" />
                  </div>
                  <button onClick={() => setPhase(AppPhase.CONTRACT_SIGNATURE)} className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black text-lg">Finalizar Vistoria</button>
              </div>
          )}

          {phase === AppPhase.CONTRACT_SIGNATURE && (
              <div className="animate-in slide-in-from-bottom-4 duration-500 space-y-6">
                  <div className="text-center space-y-2">
                    <h2 className="text-2xl font-black">Assinatura do Contrato</h2>
                    <p className="text-slate-500 text-sm">Ao assinar, aceita os termos e condições da AutoRent.</p>
                  </div>
                  <SignaturePad onSave={(sig) => { setReservation(p => ({...p, signature: sig})); setPhase(AppPhase.COMPLETED); }} />
              </div>
          )}

          {phase === AppPhase.COMPLETED && (
              <div className="flex-1 flex flex-col items-center justify-center text-center animate-in zoom-in duration-700">
                  <div className="w-24 h-24 bg-green-500 text-white rounded-full flex items-center justify-center text-5xl mb-8 shadow-2xl shadow-green-500/30">✓</div>
                  <h2 className="text-4xl font-black mb-4">Boa Viagem!</h2>
                  <p className="text-slate-500 text-lg max-w-xs mx-auto mb-10">A sua reserva para o {reservation.selectedCar} foi concluída com sucesso. Receberá o contrato no seu email.</p>
                  <button onClick={() => window.location.reload()} className="px-12 py-4 bg-slate-200 dark:bg-slate-800 rounded-2xl font-black hover:bg-slate-300 transition-colors">Voltar ao Início</button>
              </div>
          )}
      </main>

      {/* Voice Bar */}
      <div className={`fixed bottom-6 left-6 right-6 transition-all duration-500 transform ${isMicActive ? 'translate-y-0 opacity-100' : 'translate-y-40 opacity-0'}`}>
          <div className="max-w-md mx-auto bg-slate-900/95 backdrop-blur-xl text-white p-4 rounded-[2rem] flex items-center gap-4 shadow-2xl border border-white/10 ring-1 ring-white/20">
              <div className="relative">
                  <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg">🎙️</div>
                  {audioVolume > 1 && <div className="absolute -inset-1 border-2 border-blue-400 rounded-2xl animate-ping opacity-20"></div>}
              </div>
              <div className="flex-1">
                  <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Assistente Online</p>
                  <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 transition-all duration-75" style={{width: `${Math.min(100, audioVolume * 3)}%`}}></div>
                  </div>
              </div>
              <button onClick={disconnect} className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-xl hover:bg-white/20 transition-colors">✕</button>
          </div>
      </div>

      {activeDocType && (
          <div className="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-4">
              <div className="w-full max-w-lg bg-white dark:bg-slate-800 rounded-3xl overflow-hidden relative shadow-2xl">
                  <button onClick={() => setActiveDocType(null)} className="absolute top-4 right-4 z-20 bg-black/50 text-white w-10 h-10 rounded-full flex items-center justify-center">✕</button>
                  <CameraCapture label="Digitalizar Documento" onCapture={async (d) => {
                      setIsAnalyzing(true);
                      const res = await analyzeDocument(d.split(',')[1], activeDocType);
                      setReservation(prev => ({ ...prev, ...res }));
                      setIsAnalyzing(false);
                      setActiveDocType(null);
                  }} />
                  {isAnalyzing && (
                      <div className="absolute inset-0 bg-blue-600/90 flex flex-col items-center justify-center text-white z-10 animate-in fade-in">
                          <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin mb-4"></div>
                          <span className="font-black text-xl">A processar dados...</span>
                      </div>
                  )}
              </div>
          </div>
      )}

      {error && <ErrorNotification message={error} onRetry={connectToGemini} onDismiss={() => setError(null)} onContactSupport={() => {}} />}
    </div>
  );
}
