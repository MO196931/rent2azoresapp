
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AppPhase, ReservationData, CarDetails, ServiceItem } from './types';
import { decode, decodeAudioData, createPcmBlob } from './services/audioUtils';
import { db } from './services/mockDatabase'; 
import { GoogleGenAI, LiveServerMessage, Modality, Type } from '@google/genai';
import CameraCapture from './components/CameraCapture';
import SignaturePad from './components/SignaturePad';
import { analyzeDashboard } from './services/geminiService';
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
  const [reservation, setReservation] = useState<ReservationData>(() => {
    const saved = localStorage.getItem('elite_active_session');
    if (saved) return JSON.parse(saved);
    return {
      mainDriver: { name: '', email: '', phone: '' },
      additionalDrivers: [],
      selectedExtras: [],
      transcript: [],
      checkin: { damagePhotos: [], isCompleteLater: false }
    };
  });

  const [connected, setConnected] = useState(false);
  const [audioVolume, setAudioVolume] = useState(0);
  const [ocrActive, setOcrActive] = useState<string | null>(null);
  const [checkinStep, setCheckinStep] = useState<string>('DASHBOARD'); 
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [appError, setAppError] = useState<{ message: string; isFatal: boolean } | null>(null);
  
  const retryCountRef = useRef(0);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const outCtxRef = useRef<AudioContext | null>(null);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const removeNote = (id: string) => setNotifications(prev => prev.filter(n => n.id !== id));

  useEffect(() => {
    setFleet(db.getFleet()); 
    const unsubscribe = notificationManager.subscribe((note) => {
      setNotifications(prev => [...prev, note]);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    localStorage.setItem('elite_active_session', JSON.stringify(reservation));
    if (reservation.status === 'confirmed') {
       localStorage.removeItem('elite_active_session');
    }
  }, [reservation]);

  const connectToGemini = useCallback(async () => {
    if (connected) return;
    try {
      setAppError(null);
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
          tools: [{ functionDeclarations: [
            { 
              name: 'update_reservation', 
              description: 'Updates reservation fields like dates, times, name and car preference.',
              parameters: { 
                type: Type.OBJECT, 
                properties: { 
                  startDate: {type: Type.STRING, description: 'Format YYYY-MM-DD'}, 
                  endDate: {type: Type.STRING, description: 'Format YYYY-MM-DD'}, 
                  startTime: {type: Type.STRING, description: 'Format HH:mm'},
                  endTime: {type: Type.STRING, description: 'Format HH:mm'},
                  mainDriverName: {type: Type.STRING},
                  carId: {type: Type.STRING}
                } 
              } 
            },
            { 
              name: 'set_phase', 
              description: 'Navigates the user to a specific app phase.',
              parameters: { 
                type: Type.OBJECT, 
                properties: { 
                  phase: {type: Type.STRING, description: 'Enum: WELCOME, DETAILS, VEHICLE_CHECKIN, CONTRACT_SIGNATURE'}, 
                  step: {type: Type.STRING, description: 'Optional sub-step for checkin.'} 
                } 
              } 
            }
          ]}],
          systemInstruction: `Você é o Concierge Elite da AutoRent Azores. 
          ESTILO: Sofisticado, proativo, extremamente útil. Use Português de Portugal.
          OBJETIVO: Recolher datas (início/fim), horas (início/fim) e dados do condutor para o aluguer.
          COMPORTAMENTO:
          - Seja assuntivo. Se o cliente hesitar, sugira um itinerário de 3 ou 5 dias.
          - Proponha veículos baseados no destino (Jeep para montanha, Fiat para cidade).
          - Quando tiver os dados principais (datas e horas), use a função 'update_reservation'.
          - Para mostrar o resumo ao cliente, use 'set_phase' com 'DETAILS'.
          - No check-in, facilite o processo. Se necessário, permita adiar fotos técnicas.`
        },
        callbacks: {
          onopen: () => { 
            setConnected(true); 
            retryCountRef.current = 0; 
            notificationManager.createAlert('system', 'Concierge Elite', 'Assistente de voz pronto para a sua reserva.');
          },
          onmessage: async (msg: LiveServerMessage) => {
            if (msg.toolCall) {
              for (const fc of msg.toolCall.functionCalls) {
                const args = fc.args as any;
                if (fc.name === 'update_reservation') {
                  setReservation(p => ({ ...p, 
                    startDate: args.startDate || p.startDate,
                    endDate: args.endDate || p.endDate,
                    startTime: args.startTime || p.startTime,
                    endTime: args.endTime || p.endTime,
                    selectedCarId: args.carId || p.selectedCarId,
                    mainDriver: { ...p.mainDriver, name: args.mainDriverName || p.mainDriver.name }
                  }));
                }
                if (fc.name === 'set_phase') {
                  if (args.phase) setPhase(args.phase as AppPhase);
                  if (args.step) setCheckinStep(args.step);
                }
                sessionPromise.then(s => s.sendToolResponse({ functionResponses: [{ id: fc.id, name: fc.name, response: { result: "ok" } }] }));
              }
            }
            const audioBase64 = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioBase64 && outCtxRef.current) {
              const buf = await decodeAudioData(decode(audioBase64), outCtxRef.current);
              const src = outCtxRef.current.createBufferSource();
              src.buffer = buf;
              src.connect(outCtxRef.current.destination);
              src.addEventListener('ended', () => audioSourcesRef.current.delete(src));
              src.start();
              audioSourcesRef.current.add(src);
            }
            if (msg.serverContent?.interrupted) {
              audioSourcesRef.current.forEach(s => s.stop());
              audioSourcesRef.current.clear();
            }
          },
          onerror: (e) => {
            console.error("Gemini Error:", e);
            setConnected(false);
          },
          onclose: () => {
            setConnected(false);
            processor.disconnect();
            inputCtx.close();
            stream.getTracks().forEach(t => t.stop());
          }
        }
      });

      sessionPromiseRef.current = sessionPromise;
      const source = inputCtx.createMediaStreamSource(stream);
      processor.onaudioprocess = (e) => {
        const data = e.inputBuffer.getChannelData(0);
        let sum = 0; for(let i=0; i<data.length; i++) sum += data[i] * data[i];
        setAudioVolume(Math.sqrt(sum/data.length)*100);
        sessionPromiseRef.current?.then(s => s.sendRealtimeInput({ media: createPcmBlob(data) }));
      };
      source.connect(processor); 
      processor.connect(inputCtx.destination);
    } catch (e: any) { 
      setAppError({ message: "Não foi possível aceder ao microfone para o Concierge.", isFatal: true });
    }
  }, [connected]);

  const handleCapture = async (slot: string, img: string) => {
    setOcrActive(`A ler dados do ${slot}...`);
    try {
      if (['docFront', 'licenseFront'].includes(slot)) {
        setReservation(p => ({ ...p, mainDriver: { ...p.mainDriver, [slot]: img } }));
      } else {
        setReservation(p => ({ ...p, checkin: { ...p.checkin!, [slot]: img } }));
        if (slot === 'odometerPhoto') {
          const data = await analyzeDashboard(img.split(',')[1]);
          if (data) {
             setReservation(p => ({ ...p, checkin: { ...p.checkin!, ...data } }));
             notificationManager.createAlert('system', 'Leitura Automática', `Quilometragem detectada: ${data.odometerValue}km`);
          }
        }
      }
      systemMonitor.recordLearning(`Capture:${slot}`, 5);
      sessionPromiseRef.current?.then(s => s.sendMessage({ message: `SISTEMA: Documento ${slot} capturado com sucesso.` }));
    } catch (err) {
      notificationManager.createAlert('system', 'Erro OCR', 'Dados ilegíveis. Por favor, confirme manualmente.');
    } finally {
      setOcrActive(null);
    }
  };

  const finalize = async (sig: string) => {
    setOcrActive("A gerar contrato premium...");
    try {
      const car = fleet.find(c => c.id === reservation.selectedCarId) || fleet[0];
      await generateRentalContract(reservation, db.getCompany(), car, sig);
      setReservation(p => ({ ...p, status: 'confirmed' }));
      setPhase(AppPhase.COMPLETED);
      notificationManager.createAlert('whatsapp', 'Sucesso', 'O seu contrato assinado foi enviado.');
    } catch (e) {
      setAppError({ message: "Erro ao finalizar o documento digital.", isFatal: false });
    } finally {
      setOcrActive(null);
    }
  };

  const renderPhase = () => {
    switch (phase) {
      case AppPhase.WELCOME:
        return (
          <div className="flex flex-col items-center justify-center min-h-[75vh] text-center px-6 animate-in fade-in duration-1000">
            <div className="w-48 h-48 bg-blue-600 rounded-[4rem] mb-10 flex items-center justify-center text-7xl shadow-2xl animate-pulse-blue">🚙</div>
            <h1 className="text-6xl font-black mb-2 tracking-tighter text-slate-900 dark:text-white">AutoRent Azores</h1>
            <p className="text-slate-400 mb-12 text-lg italic font-medium">Concierge Elite Inteligente</p>
            <div className="flex flex-col gap-4 w-full max-w-xs">
              <button 
                onClick={connectToGemini} 
                className={`py-7 rounded-[2.5rem] font-black text-xl shadow-2xl transition-all active:scale-95 ${connected ? 'bg-green-500 text-white animate-pulse' : 'bg-slate-900 text-white hover:bg-black'}`}
              >
                {connected ? '🎙️ Ouvindo...' : '🎙️ Iniciar Reserva'}
              </button>
              {reservation.mainDriver.name && (
                <button 
                  onClick={() => setPhase(AppPhase.DETAILS)} 
                  className="text-blue-600 font-black uppercase text-[10px] tracking-[0.2em] py-4 border-2 border-blue-50 rounded-[2rem] hover:bg-blue-50 dark:border-blue-900/10"
                >
                  Retomar Reserva Pendente
                </button>
              )}
            </div>
          </div>
        );
      case AppPhase.DETAILS:
        return (
          <div className="max-w-4xl mx-auto py-10 px-6 space-y-10 animate-in slide-in-from-bottom-8 duration-500">
            <h2 className="text-5xl font-black text-center tracking-tighter">Resumo da Reserva</h2>
            <div className="bg-white dark:bg-slate-900 p-10 rounded-[3.5rem] shadow-2xl space-y-8 border dark:border-slate-800">
                <InputField label="Nome do Condutor" value={reservation.mainDriver.name} placeholder="A aguardar identificação..." />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                        <InputField label="Data de Início" type="date" value={reservation.startDate} />
                        <InputField label="Hora de Entrega" type="time" value={reservation.startTime} />
                    </div>
                    <div className="space-y-4">
                        <InputField label="Data de Fim" type="date" value={reservation.endDate} />
                        <InputField label="Hora de Devolução" type="time" value={reservation.endTime} />
                    </div>
                </div>
                <div className="pt-8 border-t dark:border-slate-800 space-y-4">
                    <div className="flex justify-between items-center px-4">
                      <span className="text-xs font-black text-slate-400 uppercase">Viatura Proposta</span>
                      <span className="text-sm font-black text-blue-600">{fleet.find(c => c.id === reservation.selectedCarId)?.model || 'Selecione ou peça por voz'}</span>
                    </div>
                    <button 
                      onClick={() => setPhase(AppPhase.VEHICLE_CHECKIN)} 
                      className="w-full bg-blue-600 text-white py-7 rounded-[2.5rem] font-black uppercase tracking-widest shadow-xl hover:bg-blue-700 transition-colors"
                    >
                      Seguir para Vistoria
                    </button>
                    <button 
                      onClick={() => setPhase(AppPhase.WELCOME)} 
                      className="w-full text-slate-400 font-black uppercase text-[10px] tracking-widest text-center"
                    >
                      Alterar por Voz
                    </button>
                </div>
            </div>
          </div>
        );
      case AppPhase.VEHICLE_CHECKIN:
        return (
          <div className="max-w-4xl mx-auto py-10 px-6 space-y-8 animate-in fade-in duration-500">
            <div className="flex justify-between items-end mb-4">
              <div>
                <h2 className="text-4xl font-black tracking-tighter">Check-in Digital</h2>
                <p className="text-blue-600 font-black uppercase text-[10px] tracking-widest mt-1">Etapa: {checkinStep}</p>
              </div>
              <button 
                onClick={() => {
                   setReservation(p => ({ ...p, checkin: { ...p.checkin!, isCompleteLater: true } }));
                   setPhase(AppPhase.CONTRACT_SIGNATURE);
                }} 
                className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-blue-600 border-b border-slate-200"
              >
                Concluir Presencialmente →
              </button>
            </div>
            <div className="bg-white dark:bg-slate-900 p-10 rounded-[3.5rem] shadow-2xl border dark:border-slate-800">
                {checkinStep === 'DASHBOARD' && (
                  <CameraCapture label="Fotografia do Painel (KM/Combustível)" onCapture={(img) => handleCapture('odometerPhoto', img)} />
                )}
                {checkinStep === 'EXT_FRONT' && (
                  <CameraCapture label="Estado Exterior (Frente)" onCapture={(img) => handleCapture('exteriorFront', img)} />
                )}
                <div className="mt-8 pt-8 border-t dark:border-slate-800 flex flex-col md:flex-row gap-4 items-center justify-between">
                    <p className="text-xs text-slate-400 italic">As fotos garantem a transparência do estado da viatura.</p>
                    <button 
                      onClick={() => {
                        if (checkinStep === 'DASHBOARD') setCheckinStep('EXT_FRONT');
                        else setPhase(AppPhase.CONTRACT_SIGNATURE);
                      }} 
                      className="w-full md:w-auto bg-slate-100 dark:bg-slate-800 px-12 py-4 rounded-full font-black text-xs uppercase tracking-widest"
                    >
                      Continuar
                    </button>
                </div>
            </div>
          </div>
        );
      case AppPhase.CONTRACT_SIGNATURE:
        return (
          <div className="max-w-4xl mx-auto py-12 px-6 animate-in zoom-in-95 duration-500">
            <h2 className="text-5xl font-black text-center mb-10 tracking-tighter">Assinatura Digital</h2>
            <div className="bg-white dark:bg-slate-900 p-10 rounded-[3.5rem] shadow-2xl space-y-10 border dark:border-slate-800">
                <label className="flex items-start gap-5 cursor-pointer p-4 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-3xl transition-colors">
                  <input 
                    type="checkbox" 
                    checked={termsAccepted} 
                    onChange={e => setTermsAccepted(e.target.checked)} 
                    className="w-8 h-8 rounded-xl border-4 border-slate-200 text-blue-600 mt-1" 
                  />
                  <div>
                    <p className="font-black text-lg text-slate-800 dark:text-white">Confirmo os Termos e Vistoria</p>
                    <p className="text-sm text-slate-400 italic">O contrato será gerado com validade jurídica imediata.</p>
                  </div>
                </label>
                {termsAccepted && (
                  <div className="animate-in slide-in-from-top-4">
                    <SignaturePad onSave={finalize} />
                  </div>
                )}
            </div>
          </div>
        );
      case AppPhase.COMPLETED:
        return (
          <div className="flex flex-col items-center justify-center min-h-[80vh] text-center px-6 animate-in fade-in duration-1000">
            <div className="text-9xl mb-10 animate-bounce">🏔️</div>
            <h2 className="text-7xl font-black tracking-tighter mb-4">Reserva Concluída</h2>
            <p className="text-slate-400 mb-12 text-lg max-w-sm leading-relaxed font-medium">
              O seu veículo está pronto. Verifique o seu WhatsApp para o itinerário sugerido pelo Concierge.
            </p>
            <button 
              onClick={() => {
                localStorage.removeItem('elite_active_session');
                window.location.reload();
              }} 
              className="px-14 py-6 bg-blue-600 text-white rounded-[2.5rem] font-black uppercase text-sm tracking-widest shadow-2xl"
            >
              Nova Reserva
            </button>
          </div>
        );
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white font-sans overflow-x-hidden">
      <header className="fixed top-0 left-0 right-0 p-6 flex justify-between items-center z-50 pointer-events-none">
          <div 
            className="pointer-events-auto bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl px-10 py-5 rounded-[2.5rem] shadow-2xl border flex items-center gap-3 cursor-pointer" 
            onDoubleClick={() => setPhase(AppPhase.ADMIN_DASHBOARD)}
          >
            <span className="text-blue-600 text-2xl font-black italic tracking-tighter">Elite</span> 
            <span className="font-black text-2xl tracking-tighter">Azores</span>
          </div>
      </header>
      
      <main className="pt-20 pb-32">
        {renderPhase()}
      </main>
      
      <ToastSystem notifications={notifications} onRemove={removeNote} />
      
      {appError && (
        <ErrorNotification 
          message={appError.message} 
          isFatal={appError.isFatal} 
          onRetry={() => { setAppError(null); connectToGemini(); }} 
          onDismiss={() => setAppError(null)}
          onContactSupport={() => window.location.href = 'mailto:geral@autorentazores.pt'}
        />
      )}

      {ocrActive && (
          <div className="fixed inset-0 bg-blue-600/90 backdrop-blur-3xl z-[200] flex flex-col items-center justify-center text-white text-center p-10 animate-in fade-in duration-300">
              <div className="w-40 h-40 border-[12px] border-white/20 border-t-white rounded-full animate-spin mb-10 shadow-2xl"></div>
              <h2 className="text-5xl font-black tracking-tighter mb-2">Processamento Elite</h2>
              <p className="text-xl font-bold opacity-75 italic">{ocrActive}</p>
          </div>
      )}

      {connected && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[100] pointer-events-none">
            <div className={`w-24 h-24 rounded-full bg-blue-600 flex items-center justify-center shadow-[0_0_80px_rgba(37,99,235,0.6)] transition-all duration-300 ${audioVolume > 15 ? 'scale-125' : 'scale-100'}`}>
                <div className="flex gap-1.5 items-end h-8">
                    {[1,2,3,4,5].map(i => (
                      <div 
                        key={i} 
                        className="w-1.5 bg-white rounded-full transition-all duration-75" 
                        style={{height: `${Math.max(20, audioVolume * (i * 0.8))}%`}}
                      ></div>
                    ))}
                </div>
            </div>
        </div>
      )}
    </div>
  );
}

const InputField = ({ label, value, type = "text", placeholder }: any) => (
    <div className="space-y-2">
        <label className="text-[10px] font-black uppercase text-slate-400 ml-6 tracking-[0.3em]">{label}</label>
        <input 
          type={type} 
          readOnly 
          className="w-full p-8 bg-slate-50 dark:bg-slate-800 rounded-[2.5rem] font-black text-xl border-4 border-transparent outline-none text-slate-900 dark:text-white" 
          value={value || ''} 
          placeholder={placeholder} 
        />
    </div>
);
