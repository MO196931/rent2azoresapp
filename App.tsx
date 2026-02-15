
import React, { useState, useEffect, useRef } from 'react';
import { AppPhase, ReservationData, AppNotification, SupportedLang } from './types';
import { decode, decodeAudioData, createPcmBlob, unlockAudio } from './services/audioUtils';
import { db } from './services/mockDatabase'; 
import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration } from '@google/genai';
import { notificationManager } from './services/notificationManager';
import { googlePlatformService } from './services/googleCalendar'; 
import { TRANSLATIONS } from './translations';
import ToastSystem from './components/ToastSystem';
import SignaturePad from './components/SignaturePad';
import { AdminManagement } from './components/AdminManagement';
import { DiagnosticDashboard } from './components/DiagnosticDashboard';
import { systemMonitor } from './services/systemMonitor';

const DRAFT_KEY = 'autorent_current_draft';

export default function App() {
  const [phase, setPhase] = useState<AppPhase>(AppPhase.WELCOME);
  const [lang] = useState<SupportedLang>('pt');
  const [healthStatus, setHealthStatus] = useState<'healthy' | 'degraded' | 'critical'>('healthy');
  
  const t = (key: string) => (TRANSLATIONS[lang] as any)[key] || key;

  const [isConnecting, setIsConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [isModelSpeaking, setIsModelSpeaking] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);

  const [reservation, setReservation] = useState<ReservationData>(() => {
    const saved = localStorage.getItem(DRAFT_KEY);
    return saved ? JSON.parse(saved) : createEmptyReservation();
  });

  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const outCtxRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  function createEmptyReservation(): ReservationData {
    return {
      status: 'draft',
      mainDriver: { name: '', email: '', phone: '' },
      additionalDrivers: [],
      selectedExtras: [],
      checkin: { interiorPhotos: [], exteriorPhotos: [], damagePhotos: [] },
    };
  }

  useEffect(() => {
    const unsubscribe = notificationManager.subscribe((n) => {
      setNotifications(prev => [...prev, n as unknown as AppNotification]);
    });
    
    // Periodically check basic health for the UI indicator
    const healthInterval = setInterval(() => {
        const report = systemMonitor.getInstantReport();
        setHealthStatus(report.status);
    }, 5000);

    return () => {
        unsubscribe();
        clearInterval(healthInterval);
    };
  }, []);

  useEffect(() => {
    if (reservation.status === 'draft') {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(reservation));
    }
  }, [reservation]);

  const aiTools: FunctionDeclaration[] = [
    {
      name: 'set_reservation_info',
      description: 'Define as informações da reserva. Chame sempre que o utilizador fornecer um dado como nome, email, data ou hora.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: 'Nome completo do condutor' },
          email: { type: Type.STRING, description: 'Email de contacto' },
          startDate: { type: Type.STRING, description: 'Data de levantamento (AAAA-MM-DD)' },
          startTime: { type: Type.STRING, description: 'Hora exata de levantamento (HH:MM)' },
          endDate: { type: Type.STRING, description: 'Data de devolução (AAAA-MM-DD)' },
          endTime: { type: Type.STRING, description: 'Hora exata de devolução (HH:MM)' },
          pickupLocation: { type: Type.STRING, description: 'Local de levantamento (ex: Aeroporto PDL)' }
        }
      }
    },
    {
      name: 'confirm_and_close',
      description: 'Chame quando todos os dados estiverem recolhidos e o utilizador confirmar que estão corretos.',
      parameters: { type: Type.OBJECT, properties: {} }
    }
  ];

  const handleVoiceSession = async () => {
    if (connected) return;
    setIsConnecting(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
      
      if (!outCtxRef.current) {
        outCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      await unlockAudio(outCtxRef.current);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const inCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const source = inCtx.createMediaStreamSource(stream);
      const analyser = inCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateVisualizer = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        setAudioLevel(avg);
        animationFrameRef.current = requestAnimationFrame(updateVisualizer);
      };
      updateVisualizer();

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          tools: [{ functionDeclarations: aiTools }],
          systemInstruction: 'É o Agente de Reservas da AutoRent Azores. Seu objetivo é recolher: Nome, Data e Hora de Início, Data e Hora de Fim.'
        },
        callbacks: {
          onopen: () => {
            setConnected(true);
            setIsConnecting(false);
            const processor = inCtx.createScriptProcessor(4096, 1, 1);
            processor.onaudioprocess = (e) => {
              const input = e.inputBuffer.getChannelData(0);
              sessionPromise.then(s => s.sendRealtimeInput({ media: createPcmBlob(input) }));
            };
            source.connect(processor);
            processor.connect(inCtx.destination);
          },
          onmessage: async (msg: LiveServerMessage) => {
            if (msg.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => { try { s.stop(); } catch(e){} });
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
              setIsModelSpeaking(false);
              return;
            }

            if (msg.serverContent?.modelTurn?.parts) {
              for (const part of msg.serverContent.modelTurn.parts) {
                if (part.inlineData?.data) {
                  setIsModelSpeaking(true);
                  const buffer = await decodeAudioData(decode(part.inlineData.data), outCtxRef.current!, 24000, 1);
                  nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outCtxRef.current!.currentTime);
                  const node = outCtxRef.current!.createBufferSource();
                  node.buffer = buffer;
                  node.connect(outCtxRef.current!.destination);
                  node.start(nextStartTimeRef.current);
                  nextStartTimeRef.current += buffer.duration;
                  sourcesRef.current.add(node);
                  node.onended = () => {
                    sourcesRef.current.delete(node);
                    if (sourcesRef.current.size === 0) setIsModelSpeaking(false);
                  };
                }
              }
            }

            if (msg.toolCall) {
              const s = await sessionPromise;
              for (const fc of msg.toolCall.functionCalls) {
                if (fc.name === 'set_reservation_info') {
                  const args = fc.args as any;
                  setReservation(prev => ({
                    ...prev,
                    mainDriver: { ...prev.mainDriver, name: args.name || prev.mainDriver.name, email: args.email || prev.mainDriver.email },
                    startDate: args.startDate || prev.startDate,
                    startTime: args.startTime || prev.startTime,
                    endDate: args.endDate || prev.endDate,
                    endTime: args.endTime || prev.endTime,
                    pickupLocation: args.pickupLocation || prev.pickupLocation
                  }));
                  s.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: { result: "ok" } } });
                }
                if (fc.name === 'confirm_and_close') {
                  setPhase(AppPhase.DETAILS);
                  s.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: { result: "ok" } } });
                }
              }
            }
          },
          onerror: () => { setConnected(false); setIsConnecting(false); },
          onclose: () => { setConnected(false); setIsConnecting(false); }
        }
      });

    } catch (err) {
      console.error("AI Error:", err);
      setIsConnecting(false);
    }
  };

  const finalizeReservation = async (signature: string) => {
    const finalData = { ...reservation, signature, status: 'confirmed' as const, createdAt: new Date().toISOString() };
    setReservation(finalData);
    
    const config = db.getCloudConfig();
    if (config.clientId && config.spreadsheetId) {
      try {
        await googlePlatformService.loadScripts(config.clientId, process.env.API_KEY || '');
        await googlePlatformService.appendToSheet(config.spreadsheetId, finalData);
      } catch (e) { console.warn("Cloud sync failed."); }
    }
    
    setPhase(AppPhase.COMPLETED);
    localStorage.removeItem(DRAFT_KEY);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      <ToastSystem notifications={notifications} onRemove={(id) => setNotifications(n => n.filter(i => i.id !== id))} />
      
      {/* Dynamic Health Header */}
      <div className="pt-4 px-6 flex justify-between items-center z-50">
          <div 
            onClick={() => setPhase(AppPhase.DIAGNOSTIC)}
            className="flex items-center gap-2 px-3 py-1.5 bg-white/50 dark:bg-slate-900/50 backdrop-blur rounded-full border border-slate-200 dark:border-slate-800 cursor-pointer hover:bg-white dark:hover:bg-slate-800 transition-all shadow-sm group"
          >
              <div className={`w-2 h-2 rounded-full ${healthStatus === 'healthy' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : healthStatus === 'degraded' ? 'bg-amber-500' : 'bg-red-500 animate-pulse'}`}></div>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 group-hover:text-blue-600">Sistema: {healthStatus === 'healthy' ? 'Operacional' : 'Check Required'}</span>
          </div>
          <button onClick={() => setPhase(AppPhase.ADMIN_DASHBOARD)} className="w-8 h-8 flex items-center justify-center bg-white dark:bg-slate-900 rounded-full border border-slate-200 dark:border-slate-800 shadow-sm opacity-60 hover:opacity-100 transition-opacity">⚙️</button>
      </div>

      <main className="flex-1 container mx-auto px-4 pb-12 flex flex-col">
        {phase === AppPhase.WELCOME && (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-12">
            <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-700">
              <div className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center text-3xl shadow-2xl mx-auto transform hover:rotate-6 transition-transform">🚗</div>
              <h1 className="text-4xl font-black italic uppercase text-slate-900 dark:text-white tracking-tighter">AutoRent Azores</h1>
              <p className="text-slate-400 font-bold text-[10px] uppercase tracking-[0.3em]">AI Concierge Premium</p>
            </div>

            <div className="relative">
                <button 
                  onClick={handleVoiceSession}
                  disabled={isConnecting}
                  className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-500 shadow-2xl z-10 relative ${connected ? 'bg-red-500 scale-110' : 'bg-blue-600 hover:scale-105'} ${isConnecting ? 'opacity-50' : ''}`}
                >
                  {isConnecting ? <span className="animate-spin text-white">⏳</span> : <span className="text-3xl text-white">{connected ? '⏹️' : '🎙️'}</span>}
                </button>
                {connected && (
                    <div className="absolute -inset-10 border-2 border-blue-500/20 rounded-full animate-ping pointer-events-none"></div>
                )}
            </div>

            <div className="space-y-6 flex flex-col items-center">
                {connected && (
                  <div className="flex gap-1 h-8 items-center justify-center animate-in fade-in duration-300">
                    {[...Array(12)].map((_, i) => (
                      <div key={i} className="w-1.5 bg-blue-600 rounded-full transition-all duration-75" style={{ height: `${Math.max(8, audioLevel * Math.random() * 3)}%` }}></div>
                    ))}
                  </div>
                )}
                
                <p className="text-slate-400 text-sm italic max-w-xs font-medium opacity-80">
                  "Gostaria de alugar um carro em Ponta Delgada para o próximo fim de semana."
                </p>

                <button 
                  onClick={() => setPhase(AppPhase.DIAGNOSTIC)}
                  className="px-6 py-3 bg-slate-200 dark:bg-slate-800 text-slate-950 dark:text-white rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-3 hover:bg-slate-300 dark:hover:bg-slate-700 transition-all border-2 border-transparent hover:border-blue-500"
                >
                  <span>🩺</span> Testar Saúde do Sistema
                </button>
            </div>
          </div>
        )}

        {phase === AppPhase.DIAGNOSTIC && (
           <div className="py-8 animate-in fade-in slide-in-from-bottom-8 duration-500">
             <div className="flex justify-between items-center mb-10">
                <button onClick={() => setPhase(AppPhase.WELCOME)} className="text-slate-500 font-black text-[10px] uppercase tracking-widest hover:text-blue-600 transition-colors">← Voltar</button>
             </div>
             <DiagnosticDashboard autoStart={true} />
           </div>
        )}

        {phase === AppPhase.DETAILS && (
          <div className="max-w-xl mx-auto py-12 space-y-8 animate-in slide-in-from-bottom-12">
            <h2 className="text-3xl font-black italic uppercase text-center tracking-tighter">Resumo da Reserva</h2>
            <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border-2 border-slate-100 dark:border-slate-800 shadow-xl space-y-6">
              <div className="flex justify-between border-b pb-4 dark:border-slate-800">
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Condutor</span>
                  <span className="font-bold text-slate-900 dark:text-white">{reservation.mainDriver.name || '---'}</span>
              </div>
              <div className="flex justify-between border-b pb-4 dark:border-slate-800">
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Levantamento</span>
                  <span className="font-bold text-blue-600">{reservation.startDate} às {reservation.startTime}</span>
              </div>
              <div className="flex justify-between">
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Devolução</span>
                  <span className="font-bold text-blue-600">{reservation.endDate} às {reservation.endTime}</span>
              </div>
            </div>
            <button onClick={() => setPhase(AppPhase.CONTRACT_SIGNATURE)} className="w-full bg-slate-900 dark:bg-white dark:text-slate-900 text-white p-6 rounded-3xl font-black uppercase tracking-widest shadow-2xl hover:scale-[1.02] active:scale-95 transition-all">Confirmar e Assinar 🖋️</button>
          </div>
        )}

        {phase === AppPhase.CONTRACT_SIGNATURE && (
            <div className="max-w-md mx-auto py-12 space-y-8 animate-in fade-in">
                <h2 className="text-3xl font-black italic uppercase text-center">Finalização</h2>
                <SignaturePad onSave={finalizeReservation} />
                <button onClick={() => setPhase(AppPhase.DETAILS)} className="w-full text-slate-400 text-[10px] font-black uppercase tracking-widest">Voltar</button>
            </div>
        )}

        {phase === AppPhase.COMPLETED && (
           <div className="flex-1 flex flex-col items-center justify-center text-center p-8 animate-in zoom-in duration-700">
             <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center text-4xl shadow-2xl animate-bounce">✅</div>
             <h1 className="text-4xl font-black italic uppercase mt-8 tracking-tighter">Reserva Efetuada!</h1>
             <p className="text-slate-500 dark:text-slate-400 font-bold max-w-xs mt-4">A sua reserva foi registada e sincronizada. Receberá um e-mail em breve.</p>
             <button onClick={() => setPhase(AppPhase.WELCOME)} className="mt-12 bg-blue-600 text-white px-10 py-5 rounded-2xl font-black uppercase tracking-widest shadow-xl hover:scale-105 active:scale-95 transition-all">Nova Reserva</button>
           </div>
        )}

        {phase === AppPhase.ADMIN_DASHBOARD && <AdminManagement onBack={() => setPhase(AppPhase.WELCOME)} lang={lang} />}
      </main>
    </div>
  );
}
