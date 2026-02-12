
import React, { useState, useEffect, useRef } from 'react';
import { AppPhase, ReservationData, CarDetails } from './types';
import { SupportedLang } from './translations';
import { decode, decodeAudioData, createPcmBlob } from './services/audioUtils';
import { db } from './services/mockDatabase'; 
import { systemMonitor } from './services/systemMonitor';
import { generateRentalContract } from './services/pdfService';
import CameraCapture from './components/CameraCapture';
import { DiagnosticDashboard } from './components/DiagnosticDashboard';
import { CloudHub } from './components/CloudHub';
import SignaturePad from './components/SignaturePad';
import { GoogleGenAI, LiveServerMessage, Modality, Type } from '@google/genai';

export default function App() {
  const [phase, setPhase] = useState<AppPhase>(AppPhase.WELCOME);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [lang, setLang] = useState<SupportedLang>('pt');
  const [fleet, setFleet] = useState<CarDetails[]>([]);
  
  const [reservation, setReservation] = useState<ReservationData>(() => ({
    status: 'draft', additionalDrivers: [], selectedExtras: [], selectedInsurance: 's1',
    documentsUploaded: false, transcript: [], driverName: '',
    startDate: '', startTime: '', endDate: '', endTime: ''
  }));

  // Refs para controlo de animação de campos preenchidos por IA
  const [aiUpdatedFields, setAiUpdatedFields] = useState<Set<string>>(new Set());

  // Audio & AI Refs
  const [connected, setConnected] = useState(false);
  const [audioVolume, setAudioVolume] = useState(0);
  const [isAiThinking, setIsAiThinking] = useState(false);
  
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const t = (key: any) => systemMonitor.getTranslation(lang, key);

  useEffect(() => {
    setFleet(db.getFleet());
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  // Ferramenta ultra-precisa para preenchimento de dados
  const updateReservationTool = {
    name: 'update_reservation_data',
    parameters: {
      type: Type.OBJECT,
      description: 'Atualiza os dados da reserva no formulário. Use sempre que o utilizador mencionar datas, horas ou nomes.',
      properties: {
        driverName: { type: Type.STRING },
        startDate: { type: Type.STRING, description: 'Formato YYYY-MM-DD' },
        endDate: { type: Type.STRING, description: 'Formato YYYY-MM-DD' },
        startTime: { type: Type.STRING, description: 'Formato HH:mm' },
        endTime: { type: Type.STRING, description: 'Formato HH:mm' },
        selectedCar: { type: Type.STRING, description: 'ID da viatura (c1 para Panda, c2 para Jeep)' }
      }
    }
  };

  const connectToGemini = async () => {
    if (connected) return;
    try {
      if (!outputAudioContextRef.current) {
        outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      const outCtx = outputAudioContextRef.current;
      if (outCtx.state === 'suspended') await outCtx.resume();

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } 
      });

      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const source = inputCtx.createMediaStreamSource(stream);
      const processor = inputCtx.createScriptProcessor(1024, 1, 1); // Latência mínima

      const systemInstruction = `
        Você é o Concierge da AutoRent Azores. Sua missão é guiar o utilizador numa sequência lógica:
        
        SEQUÊNCIA DE CONVERSA:
        1. Perguntar o NOME e as DATAS de aluguer.
        2. Assim que tiver as datas, perguntar as HORAS de levantamento e devolução.
        3. Com datas e horas fechadas, sugira um CARRO (Panda para economia, Jeep para trilhos).
        
        REGRAS DE COMPORTAMENTO:
        - Se o utilizador fornecer dados, use 'update_reservation_data' imediatamente.
        - Não espere que o utilizador preencha tudo. Vá confirmando: "Registado, vou colocar o Jeep para o dia 10".
        - Se o formulário estiver quase completo, diga: "Vou passar agora para a fase de seleção para confirmarmos o veículo".
        - Respostas curtas, alegres e profissionais.
        - Idioma: ${lang.toUpperCase()}.
      `;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction,
          tools: [{ functionDeclarations: [updateReservationTool] }],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } }
        },
        callbacks: {
          onopen: () => { 
            setConnected(true); 
            nextStartTimeRef.current = outCtx.currentTime + 0.1;
          },
          onmessage: async (msg: LiveServerMessage) => {
            if (msg.toolCall) {
              for (const fc of msg.toolCall.functionCalls) {
                if (fc.name === 'update_reservation_data') {
                  const updatedKeys = Object.keys(fc.args);
                  setAiUpdatedFields(new Set(updatedKeys));
                  setReservation(prev => ({ ...prev, ...fc.args }));
                  
                  // Limpar animação de brilho após 2 segundos
                  setTimeout(() => setAiUpdatedFields(new Set()), 2000);

                  sessionPromise.then(s => s.sendToolResponse({
                    functionResponses: { id: fc.id, name: fc.name, response: { result: "OK" } }
                  }));

                  // Lógica de transição automática de página
                  if (fc.args.startDate && fc.args.endDate && phase === AppPhase.DETAILS) {
                    // Se já temos as datas, podemos sugerir avançar
                  }
                }
              }
            }

            const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData) {
              setIsAiThinking(false);
              const audioBuffer = await decodeAudioData(decode(audioData), outCtx, 24000, 1);
              const currentTime = outCtx.currentTime;
              if (nextStartTimeRef.current < currentTime) nextStartTimeRef.current = currentTime + 0.05;

              const src = outCtx.createBufferSource();
              src.buffer = audioBuffer;
              src.connect(outCtx.destination);
              src.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              activeSourcesRef.current.add(src);
              src.onended = () => activeSourcesRef.current.delete(src);
            }

            if (msg.serverContent?.interrupted) {
              activeSourcesRef.current.forEach(s => { try { s.stop(); } catch(e){} });
              activeSourcesRef.current.clear();
              nextStartTimeRef.current = outCtx.currentTime;
            }
          },
          onclose: () => setConnected(false),
          onerror: () => setConnected(false)
        }
      });

      sessionPromiseRef.current = sessionPromise;
      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        let sum = 0; for(let i=0; i<inputData.length; i++) sum += inputData[i]*inputData[i];
        const vol = Math.sqrt(sum/inputData.length)*100;
        setAudioVolume(vol);
        
        // Interrupt AI if user starts speaking loudly
        if (vol > 15 && activeSourcesRef.current.size > 0) {
           activeSourcesRef.current.forEach(s => { try { s.stop(); } catch(e){} });
           activeSourcesRef.current.clear();
        }

        if (vol > 5) setIsAiThinking(true);
        sessionPromiseRef.current?.then(s => s.sendRealtimeInput({ media: createPcmBlob(inputData, 16000) }));
      };
      source.connect(processor); processor.connect(inputCtx.destination);
    } catch (e) {
      alert("Erro ao aceder ao microfone.");
    }
  };

  const InputField = ({ label, value, onChange, placeholder, type = "text", fieldId }: any) => (
    <div className={`space-y-1 transition-all duration-500 ${aiUpdatedFields.has(fieldId) ? 'scale-[1.02]' : ''}`}>
      <label className="text-[10px] font-black uppercase text-slate-400 ml-6 tracking-widest">{label}</label>
      <div className="relative">
        <input 
          type={type} 
          placeholder={placeholder} 
          className={`w-full p-6 rounded-[2rem] bg-white dark:bg-slate-900 border-2 transition-all font-bold text-lg outline-none ${aiUpdatedFields.has(fieldId) ? 'border-blue-500 shadow-[0_0_20px_rgba(37,99,235,0.2)]' : 'border-transparent focus:border-blue-600'}`} 
          value={value} 
          onChange={onChange} 
        />
        {aiUpdatedFields.has(fieldId) && <div className="absolute right-6 top-1/2 -translate-y-1/2 text-blue-500 animate-bounce">✨</div>}
      </div>
    </div>
  );

  const renderPhase = () => {
    switch (phase) {
      case AppPhase.WELCOME:
        return (
          <div className="flex flex-col items-center justify-center min-h-[70vh] space-y-12 animate-in fade-in zoom-in duration-700">
             <div className="w-32 h-32 bg-blue-600 rounded-[3rem] flex items-center justify-center shadow-2xl animate-bounce-slow text-5xl">🐬</div>
             <div className="text-center space-y-4">
               <h2 className="text-6xl font-black tracking-tighter leading-tight">Olá! Vamos viajar?</h2>
               <p className="text-slate-400 font-medium px-4 text-lg">Diga-me o seu nome e as datas para começarmos.</p>
             </div>
             <div className="flex flex-col gap-4 w-full max-w-xs">
               <button onClick={connectToGemini} className="bg-blue-600 text-white py-7 rounded-[2.5rem] text-xl font-black shadow-2xl shadow-blue-500/20 active:scale-95 transition-all flex items-center justify-center gap-4 group">
                  <span className="text-2xl group-hover:animate-pulse">🎙️</span> Falar com Concierge
               </button>
               <button onClick={() => setPhase(AppPhase.DETAILS)} className="text-slate-400 font-black text-[11px] uppercase tracking-widest py-4">Ou preencher manualmente</button>
             </div>
          </div>
        );

      case AppPhase.DETAILS:
        return (
          <div className="w-full max-w-md mx-auto space-y-8 animate-in slide-in-from-right duration-500 pb-20">
            <h3 className="text-4xl font-black tracking-tighter mb-10">Dados do Aluguer</h3>
            <InputField label="Nome do Condutor" fieldId="driverName" value={reservation.driverName} onChange={(e:any) => setReservation({...reservation, driverName: e.target.value})} placeholder="Ex: João Silva" />
            
            <div className="grid grid-cols-2 gap-4">
              <InputField label="Início" fieldId="startDate" type="date" value={reservation.startDate} onChange={(e:any) => setReservation({...reservation, startDate: e.target.value})} />
              <InputField label="Levantamento" fieldId="startTime" type="time" value={reservation.startTime} onChange={(e:any) => setReservation({...reservation, startTime: e.target.value})} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <InputField label="Fim" fieldId="endDate" type="date" value={reservation.endDate} onChange={(e:any) => setReservation({...reservation, endDate: e.target.value})} />
              <InputField label="Devolução" fieldId="endTime" type="time" value={reservation.endTime} onChange={(e:any) => setReservation({...reservation, endTime: e.target.value})} />
            </div>

            <button onClick={() => setPhase(AppPhase.VEHICLE_SELECTION)} className="w-full bg-slate-900 text-white py-6 rounded-[2.5rem] text-xl font-black shadow-xl active:scale-95 transition-transform mt-8">Ver Veículos Disponíveis →</button>
          </div>
        );

      case AppPhase.VEHICLE_SELECTION:
        return (
          <div className="space-y-8 animate-in slide-in-from-right duration-500 pb-20">
            <h3 className="text-4xl font-black tracking-tighter">Escolha a sua Máquina</h3>
            <div className="grid grid-cols-1 gap-6">
              {fleet.map(car => (
                <div key={car.id} onClick={() => { setReservation({...reservation, selectedCar: car.id}); setPhase(AppPhase.INSURANCE_AND_EXTRAS); }} className={`group relative p-4 rounded-[3rem] bg-white dark:bg-slate-900 border-4 transition-all active:scale-95 ${reservation.selectedCar === car.id ? 'border-blue-600' : 'border-transparent shadow-sm hover:shadow-xl'}`}>
                  <img src={car.image} className="w-full h-48 object-cover rounded-[2.5rem] mb-4 group-hover:scale-[1.02] transition-transform" />
                  <div className="flex justify-between items-center px-6 pb-2">
                    <div>
                      <h4 className="font-black text-2xl">{car.brand} {car.model}</h4>
                      <p className="text-slate-400 text-xs font-bold">{car.specs}</p>
                    </div>
                    <div className="text-right">
                      <span className="font-black text-blue-600 text-2xl">{car.price}</span>
                      <p className="text-[9px] font-black uppercase tracking-tighter opacity-40">IVA Incluído</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setPhase(AppPhase.DETAILS)} className="w-full py-4 text-slate-400 font-black uppercase text-[10px] tracking-widest">← Alterar Datas</button>
          </div>
        );

      default:
        return <div className="p-20 text-center font-black">A carregar interface...</div>;
    }
  };

  return (
    <div className={`min-h-screen flex flex-col transition-all duration-700 ${theme === 'dark' ? 'dark bg-slate-950 text-white' : 'bg-slate-50 text-slate-900'}`}>
      <main className="flex-1 overflow-y-auto px-6 py-10 relative">
        {renderPhase()}
      </main>

      {/* Botão de Voz Flutuante (Minimalista) */}
      {!connected && phase !== AppPhase.WELCOME && (
        <button onClick={connectToGemini} className="fixed bottom-10 right-10 w-20 h-20 bg-blue-600 text-white rounded-full shadow-[0_20px_50px_rgba(37,99,235,0.4)] flex items-center justify-center text-4xl z-50 animate-pulse-blue active:scale-90 transition-all hover:scale-110">
          🎙️
        </button>
      )}

      {/* Overlay de Voz Ativo - Focado no Feedback Visual */}
      {connected && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-3xl z-[100] flex flex-col items-center justify-center p-8 animate-in fade-in duration-300">
          <div className="w-full max-w-sm text-center space-y-10">
             <div className="relative flex justify-center">
                <div className={`w-40 h-40 rounded-full border-8 border-blue-500/20 flex items-center justify-center transition-all duration-75 ${audioVolume > 10 ? 'scale-110 border-blue-400/40' : 'scale-100'}`}>
                  <div className="w-32 h-32 bg-blue-600 rounded-full flex items-center justify-center text-6xl shadow-2xl animate-pulse">🐬</div>
                </div>
                {isAiThinking && <div className="absolute inset-0 border-4 border-blue-400 rounded-full animate-ping opacity-30"></div>}
             </div>
             
             <div className="space-y-2">
               <p className="text-blue-400 font-black uppercase text-xs tracking-[0.4em]">{isAiThinking ? 'A processar o que disse...' : 'Estou a ouvir...'}</p>
               <h4 className="text-2xl font-black text-white italic">"Diga-me, quais as datas?"</h4>
             </div>

             <div className="flex gap-1.5 justify-center h-12 items-end">
               {[1,2,3,4,5,6,7,8].map(i => (
                 <div key={i} className="w-2 bg-blue-500 rounded-full transition-all duration-75" style={{height: `${Math.max(6, audioVolume * (i*0.3))}px`, opacity: 0.1 + (i*0.1)}}></div>
               ))}
             </div>

             <div className="pt-10">
                <button onClick={() => setConnected(false)} className="w-full py-6 bg-white/10 hover:bg-white/20 rounded-[2.5rem] font-black uppercase text-xs tracking-widest text-white transition-all border border-white/10">Concluir Voz e Ver Formulário</button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
