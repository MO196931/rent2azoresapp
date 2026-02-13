
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AppPhase, ReservationData, CarDetails } from './types';
import { decode, decodeAudioData, createPcmBlob } from './services/audioUtils';
import { db } from './services/mockDatabase'; 
import { GoogleGenAI, LiveServerMessage, Modality, Type } from '@google/genai';
import CameraCapture from './components/CameraCapture';
import SignaturePad from './components/SignaturePad';
import { generateRentalContract } from './services/pdfService';
import { notificationManager } from './services/notificationManager';
import ToastSystem from './components/ToastSystem';
import { AppNotification } from './services/notificationManager';
import { AdminManagement } from './components/AdminManagement';
import { systemMonitor } from './services/systemMonitor';
import ErrorNotification from './components/ErrorNotification';

export default function App() {
  const [phase, setPhase] = useState<AppPhase>(AppPhase.WELCOME);
  const [fleet, setFleet] = useState<CarDetails[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [textInput, setTextInput] = useState('');
  const [inputMode, setInputMode] = useState<'VOICE' | 'TEXT'>('VOICE');
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [systemHealth, setSystemHealth] = useState(100);
  
  const [reservation, setReservation] = useState<ReservationData>(() => {
    const saved = localStorage.getItem('elite_active_session');
    if (saved) return JSON.parse(saved);
    return {
      mainDriver: { name: '', email: '', phone: '' },
      additionalDrivers: [],
      selectedExtras: [],
      checkin: { damagePhotos: [], isCompleteLater: false }
    };
  });

  const [connected, setConnected] = useState(false);
  const [audioVolume, setAudioVolume] = useState(0);
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const outCtxRef = useRef<AudioContext | null>(null);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);

  useEffect(() => {
    setFleet(db.getFleet()); 
    const unsubscribe = notificationManager.subscribe((note) => {
      setNotifications(prev => [...prev, note]);
    });

    const healthInterval = setInterval(() => {
        setSystemHealth(systemMonitor.getFullReport().stabilityScore);
    }, 2000);

    return () => {
        unsubscribe();
        clearInterval(healthInterval);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('elite_active_session', JSON.stringify(reservation));
  }, [reservation]);

  const connectToGemini = useCallback(async () => {
    if (connected) return;
    try {
      if (!outCtxRef.current) {
        outCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const processor = inputCtx.createScriptProcessor(1024, 1, 1);

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          tools: [
            { googleMaps: {} },
            { functionDeclarations: [
              { 
                name: 'update_reservation', 
                description: 'Preenche campos da reserva em tempo real.',
                parameters: { 
                  type: Type.OBJECT, 
                  properties: { 
                    startDate: {type: Type.STRING}, 
                    endDate: {type: Type.STRING}, 
                    startTime: {type: Type.STRING},
                    endTime: {type: Type.STRING},
                    pickupLocation: {type: Type.STRING},
                    dropoffLocation: {type: Type.STRING},
                    accommodationName: {type: Type.STRING},
                    accommodationAddress: {type: Type.STRING},
                    mainDriverName: {type: Type.STRING},
                    carId: {type: Type.STRING}
                  } 
                } 
              },
              { 
                name: 'set_ui_phase', 
                description: 'Muda a fase visual da aplicação.',
                parameters: { 
                  type: Type.OBJECT, 
                  properties: { 
                    phase: {type: Type.STRING, description: 'Enum: LOCATIONS, ACCOMMODATION, DETAILS, VEHICLE_CHECKIN'} 
                  } 
                } 
              }
            ]}
          ],
          systemInstruction: `Você é o Concierge de Elite da AutoRent Azores. 
          REGRAS DE OURO:
          1. VOCÊ CONDUZ: Não espere o cliente. Comece com "Bem-vindo! Para quando e onde deseja a sua viatura?".
          2. PROATIVIDADE: Se o cliente não souber as datas, sugira "Talvez de sexta a domingo?".
          3. ALOJAMIENTO: Pergunte SEMPRE onde ficarão. Use 'googleMaps' para resolver o nome do hotel em morada.
          4. FEEDBACK VISUAL: Use 'update_reservation' mal receba uma informação (ex: mal digam a data, atualize-a).
          5. SEM SILÊNCIO: Se houver silêncio prolongado, faça uma recomendação local (ex: Lagoa das Sete Cidades).`
        },
        callbacks: {
          onopen: () => { 
            setConnected(true);
            systemMonitor.logEvent('info', 'AI_CORE', 'Sessão Live Iniciada com sucesso.');
            notificationManager.createAlert('system', 'Elite Sync', 'Agente AI Ativo. A iniciar condução de reserva.');
          },
          onmessage: async (msg: LiveServerMessage) => {
            if (msg.toolCall) {
              for (const fc of msg.toolCall.functionCalls) {
                const args = fc.args as any;
                if (fc.name === 'update_reservation') {
                  setReservation(p => ({ ...p, ...args }));
                  systemMonitor.logEvent('info', 'DATABASE', `Campos atualizados via IA: ${Object.keys(args).join(', ')}`);
                }
                if (fc.name === 'set_ui_phase') {
                  if (args.phase) {
                      setPhase(args.phase as AppPhase);
                      systemMonitor.logEvent('info', 'USER_INTERFACE', `Fase alterada para ${args.phase}`);
                  }
                }
                sessionPromise.then(s => s.sendToolResponse({ 
                  functionResponses: { id: fc.id, name: fc.name, response: { result: "Campo atualizado na UI" } } 
                }));
              }
            }
            
            // Audio Logic
            const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData && outCtxRef.current) {
              const buf = await decodeAudioData(decode(audioData), outCtxRef.current);
              const src = outCtxRef.current.createBufferSource();
              src.buffer = buf;
              src.connect(outCtxRef.current.destination);
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outCtxRef.current.currentTime);
              src.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buf.duration;
              audioSourcesRef.current.add(src);
              src.onended = () => audioSourcesRef.current.delete(src);
            }

            if (msg.serverContent?.interrupted) {
              audioSourcesRef.current.forEach(s => s.stop());
              audioSourcesRef.current.clear();
              nextStartTimeRef.current = 0;
              systemMonitor.logEvent('warn', 'AUDIO_SUBSYSTEM', 'Interrupção de áudio detetada (User barge-in).');
            }
          },
          onclose: () => {
              setConnected(false);
              systemMonitor.logEvent('warn', 'AI_CORE', 'Sessão encerrada.');
          }
        }
      });

      sessionPromiseRef.current = sessionPromise;
      const source = inputCtx.createMediaStreamSource(stream);
      processor.onaudioprocess = (e) => {
        const data = e.inputBuffer.getChannelData(0);
        let sum = 0; for(let i=0; i<data.length; i++) sum += data[i] * data[i];
        setAudioVolume(Math.sqrt(sum/data.length)*100);
        if (inputMode === 'VOICE') {
          sessionPromiseRef.current?.then(s => s.sendRealtimeInput({ media: createPcmBlob(data) }));
        }
      };
      source.connect(processor); 
      processor.connect(inputCtx.destination);
    } catch (e) {
      systemMonitor.logEvent('error', 'AUDIO_SUBSYSTEM', 'Falha ao aceder ao hardware de áudio.');
      notificationManager.createAlert('system', 'Erro de Áudio', 'Por favor, autorize o microfone.');
    }
  }, [connected, inputMode]);

  const handleSendText = () => {
    if (!textInput.trim()) return;
    setIsAiProcessing(true);
    sessionPromiseRef.current?.then(s => s.sendMessage({ message: textInput }));
    setTextInput('');
    setTimeout(() => setIsAiProcessing(false), 1000);
  };

  const renderCurrentPhase = () => {
    switch (phase) {
      case AppPhase.ADMIN_DASHBOARD:
          return <AdminManagement onBack={() => setPhase(AppPhase.WELCOME)} lang="pt" />;

      case AppPhase.WELCOME:
        return (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center animate-in fade-in duration-700">
             <div className="relative mb-12">
                <div className={`w-40 h-40 bg-blue-600 rounded-full flex items-center justify-center text-7xl shadow-[0_0_60px_rgba(37,99,235,0.4)] ${connected ? 'animate-pulse' : ''}`}>🚙</div>
                {connected && <div className="absolute -bottom-2 -right-2 bg-green-500 w-8 h-8 rounded-full border-4 border-white animate-bounce"></div>}
             </div>
             <h1 className="text-6xl font-black tracking-tighter mb-4 text-slate-900 dark:text-white">Elite Azores</h1>
             <p className="text-slate-400 text-xl font-medium mb-12 max-w-sm">O seu agente de viagens proativo alimentado por IA.</p>
             {!connected && (
               <button onClick={connectToGemini} className="px-16 py-7 bg-blue-600 text-white rounded-[2.5rem] font-black text-xl shadow-2xl hover:bg-blue-700 active:scale-95 transition-all">
                  Iniciar Conversa
               </button>
             )}
          </div>
        );
      
      case AppPhase.LOCATIONS:
      case AppPhase.ACCOMMODATION:
      case AppPhase.DETAILS:
        return (
          <div className="max-w-5xl mx-auto py-10 px-6 space-y-12 animate-in slide-in-from-bottom-8 duration-500">
             <header className="flex justify-between items-end">
                <div>
                   <h2 className="text-4xl font-black tracking-tighter">Estado da Reserva</h2>
                   <p className="text-blue-600 font-bold uppercase text-[10px] tracking-widest mt-1">Sincronização Ativa com Agente AI</p>
                </div>
                <div className="flex gap-4">
                   <ProgressStep label="Datas" active={!!reservation.startDate} />
                   <ProgressStep label="Locais" active={!!reservation.pickupLocation} />
                   <ProgressStep label="Hotel" active={!!reservation.accommodationName} />
                </div>
             </header>

             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <RealtimeCard label="Levantamento" value={reservation.pickupLocation} icon="📍" placeholder="A definir..." />
                <RealtimeCard label="Devolução" value={reservation.dropoffLocation} icon="🏁" placeholder="Mesmo local?" />
                <RealtimeCard label="Início" value={`${reservation.startDate || ''} ${reservation.startTime || ''}`} icon="📅" />
                <RealtimeCard label="Fim" value={`${reservation.endDate || ''} ${reservation.endTime || ''}`} icon="⏳" />
                <RealtimeCard label="Alojamento" value={reservation.accommodationName} subValue={reservation.accommodationAddress} icon="🏨" color="bg-indigo-50" />
                <RealtimeCard label="Viatura" value={fleet.find(c => c.id === reservation.selectedCarId)?.model} icon="🚗" color="bg-blue-50" />
             </div>

             {reservation.startDate && reservation.pickupLocation && (
                <div className="flex flex-col gap-4 animate-in fade-in duration-500">
                   <button 
                     onClick={() => setPhase(AppPhase.VEHICLE_CHECKIN)} 
                     className="w-full bg-slate-900 text-white py-8 rounded-[3rem] font-black uppercase text-sm tracking-widest hover:bg-black shadow-2xl"
                   >
                     Confirmar Dados e Ir para Vistoria
                   </button>
                   <p className="text-center text-xs text-slate-400 font-medium">Pode continuar a falar para ajustar qualquer detalhe acima.</p>
                </div>
             )}
          </div>
        );

      case AppPhase.VEHICLE_CHECKIN:
        return (
          <div className="max-w-3xl mx-auto py-10 px-6 animate-in zoom-in-95 duration-500">
             <h2 className="text-4xl font-black mb-8 tracking-tighter">Vistoria Inteligente</h2>
             <div className="bg-white dark:bg-slate-900 p-10 rounded-[3.5rem] shadow-2xl border dark:border-slate-800 space-y-8">
                <CameraCapture label="Fotografia do Painel (KM/Combustível)" onCapture={(img) => {
                   setReservation(p => ({ ...p, checkin: { ...p.checkin!, odometerPhoto: img } }));
                   systemMonitor.logEvent('info', 'DATABASE', 'Imagem do painel capturada para OCR.');
                   notificationManager.createAlert('system', 'Imagem Recebida', 'A processar dados do painel via IA...');
                }} />
                <button onClick={() => setPhase(AppPhase.CONTRACT_SIGNATURE)} className="w-full bg-blue-600 text-white py-6 rounded-3xl font-black uppercase">Seguir para Assinatura</button>
             </div>
          </div>
        );

      case AppPhase.CONTRACT_SIGNATURE:
        return (
          <div className="max-w-3xl mx-auto py-10 px-6 text-center animate-in fade-in duration-500">
             <h2 className="text-4xl font-black mb-12 tracking-tighter">Assinatura do Contrato</h2>
             <SignaturePad onSave={async (sig) => {
                setProcessingStatus("A gerar contrato PDF assinado...");
                const car = fleet.find(c => c.id === reservation.selectedCarId) || fleet[0];
                await generateRentalContract(reservation, db.getCompany(), car, sig);
                systemMonitor.logEvent('info', 'USER_INTERFACE', 'Contrato PDF gerado e assinado.');
                setPhase(AppPhase.COMPLETED);
                setProcessingStatus(null);
             }} />
          </div>
        );

      case AppPhase.COMPLETED:
        return (
          <div className="flex flex-col items-center justify-center min-h-[80vh] text-center p-6 animate-in zoom-in duration-1000">
             <div className="text-9xl mb-10">🌴</div>
             <h2 className="text-7xl font-black tracking-tighter mb-4">Boa Viagem!</h2>
             <p className="text-slate-400 text-xl font-medium max-w-md mx-auto">Tudo organizado. O seu {fleet.find(c => c.id === reservation.selectedCarId)?.model} está à sua espera.</p>
             <button onClick={() => window.location.reload()} className="mt-12 px-14 py-6 bg-slate-900 text-white rounded-full font-black uppercase text-sm tracking-widest shadow-2xl">Nova Reserva</button>
          </div>
        );

      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white font-sans selection:bg-blue-200">
      {/* HUD Proativo Superior */}
      <header className="fixed top-0 left-0 right-0 p-6 z-50 pointer-events-none">
          <div className="max-w-6xl mx-auto flex justify-between items-center pointer-events-auto">
             <div 
                onClick={() => setPhase(AppPhase.WELCOME)} 
                className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl px-10 py-5 rounded-[2.5rem] shadow-2xl border flex items-center gap-4 cursor-pointer"
             >
                <span className="text-blue-600 font-black text-2xl tracking-tighter italic">Elite</span>
                <span className="font-black text-2xl tracking-tighter">Azores</span>
             </div>
             
             <div className="flex gap-3">
                <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl px-6 py-4 rounded-[2rem] border flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${systemHealth > 90 ? 'bg-green-500' : 'bg-amber-500 animate-pulse'}`}></div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">System: {systemHealth}%</span>
                </div>
                
                {phase !== AppPhase.ADMIN_DASHBOARD && (
                   <button 
                     onClick={() => setPhase(AppPhase.ADMIN_DASHBOARD)}
                     className="px-8 py-4 bg-slate-900 text-white rounded-[2rem] font-black text-[10px] uppercase tracking-widest transition-all shadow-xl hover:bg-black"
                   >
                     Staff Panel
                   </button>
                )}

                {connected && phase !== AppPhase.ADMIN_DASHBOARD && (
                  <button 
                    onClick={() => setInputMode(inputMode === 'VOICE' ? 'TEXT' : 'VOICE')}
                    className={`px-8 py-4 rounded-[2rem] font-black text-[10px] uppercase tracking-widest transition-all shadow-xl ${inputMode === 'VOICE' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-400 border'}`}
                  >
                    {inputMode === 'VOICE' ? '🎙️ Voz Ativa' : '⌨️ Modo Teclado'}
                  </button>
                )}
             </div>
          </div>
      </header>

      <main className={`transition-all duration-500 ${phase === AppPhase.ADMIN_DASHBOARD ? 'pt-0' : 'pt-32 pb-48'}`}>
        {renderCurrentPhase()}
      </main>

      {/* Barra de Interação Persistente (Chat Proativo) */}
      {connected && phase !== AppPhase.COMPLETED && phase !== AppPhase.ADMIN_DASHBOARD && (
        <div className="fixed bottom-10 left-0 right-0 px-6 z-50 animate-in slide-in-from-bottom-10 duration-700">
            <div className="max-w-4xl mx-auto">
                <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-3xl p-4 rounded-[3.5rem] shadow-[0_20px_100px_rgba(0,0,0,0.1)] border dark:border-slate-800 flex items-center gap-4">
                    <div className={`w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center transition-all ${audioVolume > 10 ? 'scale-125 shadow-[0_0_30px_rgba(37,99,235,0.6)]' : ''}`}>
                       <div className="flex gap-1 items-end h-5">
                          {[1,2,3].map(i => (
                             <div key={i} className="w-1 bg-white rounded-full animate-pulse" style={{height: `${40 + (Math.random() * 60)}%`}}></div>
                          ))}
                       </div>
                    </div>
                    
                    <input 
                      className="flex-1 bg-transparent border-none outline-none font-bold text-xl text-slate-800 dark:text-white placeholder:text-slate-300"
                      placeholder={inputMode === 'VOICE' ? "Diga-me o que pretende..." : "Escreva aqui as datas ou local..."}
                      value={textInput}
                      onChange={e => setTextInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSendText()}
                    />
                    
                    <button 
                      onClick={handleSendText}
                      className="w-16 h-16 bg-slate-900 text-white rounded-full flex items-center justify-center hover:bg-blue-600 transition-all active:scale-90"
                    >
                      {isAiProcessing ? <span className="animate-spin">⚙️</span> : '➔'}
                    </button>
                </div>
            </div>
        </div>
      )}

      {processingStatus && (
        <div className="fixed inset-0 bg-blue-600/90 backdrop-blur-3xl z-[200] flex flex-col items-center justify-center text-white">
           <div className="w-24 h-24 border-8 border-white/20 border-t-white rounded-full animate-spin mb-8"></div>
           <h3 className="text-4xl font-black tracking-tighter mb-2">{processingStatus}</h3>
           <p className="text-white/60 font-bold italic">Otimização Elite em curso...</p>
        </div>
      )}

      <ToastSystem notifications={notifications} onRemove={(id) => setNotifications(prev => prev.filter(n => n.id !== id))} />
    </div>
  );
}

const RealtimeCard = ({ label, value, subValue, icon, placeholder = "Pendente", color = "bg-white" }: any) => {
  const isFilled = !!value;
  return (
    <div className={`${color} dark:bg-slate-900 p-8 rounded-[2.5rem] border dark:border-slate-800 shadow-sm transition-all relative overflow-hidden group hover:border-blue-500`}>
       {isFilled && <div className="absolute top-0 left-0 w-1 h-full bg-blue-600 animate-in slide-in-from-left duration-300"></div>}
       <div className="flex justify-between items-start mb-6">
          <span className="text-3xl grayscale group-hover:grayscale-0 transition-all">{icon}</span>
          {isFilled && <span className="text-[10px] font-black text-green-500 uppercase tracking-widest">Verificado</span>}
       </div>
       <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">{label}</p>
       <p className={`text-xl font-black tracking-tight ${isFilled ? 'text-slate-900 dark:text-white' : 'text-slate-200 dark:text-slate-700 italic'}`}>
          {value || placeholder}
       </p>
       {subValue && <p className="text-xs text-slate-400 mt-2 font-medium truncate">{subValue}</p>}
    </div>
  );
};

const ProgressStep = ({ label, active }: { label: string; active: boolean }) => (
  <div className="flex items-center gap-2">
     <div className={`w-3 h-3 rounded-full ${active ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-800'}`}></div>
     <span className={`text-[10px] font-black uppercase tracking-widest ${active ? 'text-blue-600' : 'text-slate-400'}`}>{label}</span>
  </div>
);
