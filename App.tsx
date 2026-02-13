
import { AppPhase, ReservationData, CarDetails, SystemLog, AppNotification, VehicleCheckinData } from './types';
import { decode, decodeAudioData, createPcmBlob } from './services/audioUtils';
import { db } from './services/mockDatabase'; 
import { GoogleGenAI, LiveServerMessage, Modality, Type } from '@google/genai';
import { notificationManager } from './services/notificationManager';
import ToastSystem from './components/ToastSystem';
import CameraCapture from './components/CameraCapture';
import SignaturePad from './components/SignaturePad';
import { generateRentalContract } from './services/pdfService';
import { AdminManagement } from './components/AdminManagement';
import { googlePlatformService } from './services/googleCalendar';
import React, { useState, useEffect, useRef } from 'react';

const DRAFT_KEY = 'autorent_current_draft';

type InspectionCategory = 'odometer' | 'interior' | 'exterior' | 'damage';

export default function App() {
  const [phase, setPhase] = useState<AppPhase>(AppPhase.WELCOME);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [aiTranscript, setAiTranscript] = useState('');
  const [activeCapture, setActiveCapture] = useState<'id' | 'license' | 'signature' | 'fleet' | 'inspection' | 'location' | 'terms' | null>(null);
  const [inspectionCategory, setInspectionCategory] = useState<InspectionCategory>('odometer');
  const [inspectionStep, setInspectionStep] = useState(0);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [companyLogo, setCompanyLogo] = useState(db.getCompany().logoUrl);
  const [userCoords, setUserCoords] = useState<{lat: number, lng: number} | null>(null);
  const [hasDraft, setHasDraft] = useState(false);
  
  const [reservation, setReservation] = useState<ReservationData>(() => {
    const saved = localStorage.getItem(DRAFT_KEY);
    return saved ? JSON.parse(saved) : {
      mainDriver: { name: '', email: '', phone: '' },
      additionalDrivers: [],
      selectedExtras: [],
      status: 'draft',
      checkin: { interiorPhotos: [], exteriorPhotos: [], damagePhotos: [] }
    };
  });

  const outCtxRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);

  useEffect(() => {
    const saved = localStorage.getItem(DRAFT_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Only consider it a draft if at least some data exists
      if (parsed.mainDriver?.name || parsed.pickupLocation || parsed.selectedCarId) {
        setHasDraft(true);
      }
    }

    const logInterval = setInterval(() => {
      const currentCompany = db.getCompany();
      if (currentCompany.logoUrl !== companyLogo) setCompanyLogo(currentCompany.logoUrl);
    }, 1000);
    
    const unsubscribe = notificationManager.subscribe((n) => {
      setNotifications(prev => [...prev, n as unknown as AppNotification]);
    });

    navigator.geolocation.getCurrentPosition(
      (pos) => setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => console.warn("Geo blocked")
    );

    return () => { clearInterval(logInterval); unsubscribe(); };
  }, [companyLogo]);

  useEffect(() => {
    if (reservation.status === 'draft') {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(reservation));
    }
  }, [reservation]);

  const aiTools = [
    {
      name: 'update_reservation',
      description: 'Atualiza dados da reserva (datas, horas, cliente, localizacao).',
      parameters: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          startDate: { type: Type.STRING },
          endDate: { type: Type.STRING },
          pickupLocation: { type: Type.STRING },
          accommodationName: { type: Type.STRING }
        }
      }
    },
    {
      name: 'request_ui_action',
      description: 'Abre componentes visuais (frota, camera, termos).',
      parameters: {
        type: Type.OBJECT,
        properties: {
          action: { type: Type.STRING, enum: ['id_capture', 'signature_pad', 'show_fleet', 'inspection', 'location_search', 'show_terms'] }
        },
        required: ['action']
      }
    }
  ];

  const handleStartSession = async (isResuming: boolean = false) => {
    setIsConnecting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      outCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      await outCtxRef.current.resume();

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const processor = inputCtx.createScriptProcessor(4096, 1, 1);

      // Enhanced Context for the AI to handle resumes perfectly
      const resumeContext = isResuming 
        ? `IMPORTANTE: O cliente está a RETOMAR uma reserva anterior. 
           DADOS ATUAIS NO SISTEMA:
           - Cliente: ${reservation.mainDriver?.name || 'Não definido'}
           - Carro: ${reservation.selectedCarId || 'Não escolhido'}
           - Local: ${reservation.pickupLocation || 'Não definido'}
           - Vistoria: ${reservation.checkin?.odometerPhoto ? 'Iniciada' : 'Não iniciada'}
           
           Dá as boas vindas de volta pelo nome (se souberes) e pergunta se quer continuar do ponto onde parou.` 
        : `Esta é uma nova reserva. Começa com uma saudação calorosa dos Açores e pergunta o nome do cliente.`;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          tools: [{ googleMaps: {} }, { functionDeclarations: aiTools }],
          toolConfig: userCoords ? { retrievalConfig: { latLng: { latitude: userCoords.lat, longitude: userCoords.lng } } } : undefined,
          systemInstruction: `És o Agente Virtual da AutoRent Azores. Falas de forma profissional mas acolhedora.
          ${resumeContext}
          
          FLUXO OBRIGATÓRIO:
          1. Validar Datas e Nome do condutor principal.
          2. Validar Localização (Hotel/Alojamento) usando Google Maps.
          3. Mostrar Frota (request_ui_action: 'show_fleet').
          4. Pedir ID/Documentos (request_ui_action: 'id_capture').
          5. Guia para Vistoria Completa (request_ui_action: 'inspection').
          6. Mostrar Termos Legais (request_ui_action: 'show_terms').
          7. Recolher Assinatura Final.`
        },
        callbacks: {
          onopen: () => { setConnected(true); setIsConnecting(false); },
          onmessage: async (msg: LiveServerMessage) => {
            if (msg.serverContent?.outputTranscription) setAiTranscript(msg.serverContent.outputTranscription.text);

            if (msg.toolCall) {
              for (const fc of msg.toolCall.functionCalls) {
                if (fc.name === 'update_reservation') {
                   const args = fc.args as any;
                   setReservation(prev => ({ 
                     ...prev, 
                     mainDriver: { ...prev.mainDriver, name: args.name || prev.mainDriver.name },
                     startDate: args.startDate || prev.startDate,
                     endDate: args.endDate || prev.endDate,
                     pickupLocation: args.pickupLocation || prev.pickupLocation,
                     accommodationName: args.accommodationName || prev.accommodationName
                   }));
                   sessionPromise.then(s => s.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: { result: "Dados atualizados no rascunho." } } }));
                }
                if (fc.name === 'request_ui_action') {
                   const { action } = fc.args as any;
                   if (action === 'id_capture') setActiveCapture('id');
                   if (action === 'show_fleet') setActiveCapture('fleet');
                   if (action === 'inspection') { 
                     setActiveCapture('inspection'); 
                     setInspectionCategory('odometer');
                     setInspectionStep(0); 
                   }
                   if (action === 'location_search') setActiveCapture('location');
                   if (action === 'show_terms') setActiveCapture('terms');
                   sessionPromise.then(s => s.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: { result: "Interface aberta para o cliente." } } }));
                }
              }
            }

            const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData && outCtxRef.current) {
              const buf = await decodeAudioData(decode(audioData), outCtxRef.current);
              const src = outCtxRef.current.createBufferSource();
              src.buffer = buf; src.connect(outCtxRef.current.destination);
              src.start(nextStartTimeRef.current);
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outCtxRef.current.currentTime) + buf.duration;
            }
          }
        }
      });

      const source = inputCtx.createMediaStreamSource(stream);
      processor.onaudioprocess = (e) => {
        const data = e.inputBuffer.getChannelData(0);
        if (connected) sessionPromise.then(s => s.sendRealtimeInput({ media: createPcmBlob(data) }));
      };
      source.connect(processor); processor.connect(inputCtx.destination);
    } catch (e) { setIsConnecting(false); }
  };

  const handleReset = () => {
    if (confirm("Tens a certeza que queres apagar o rascunho atual e começar do zero?")) {
      localStorage.removeItem(DRAFT_KEY);
      window.location.reload();
    }
  };

  const handleCapture = (dataUrl: string) => {
    if (activeCapture === 'id') {
      setReservation(prev => ({ ...prev, mainDriver: { ...prev.mainDriver, docFront: dataUrl } }));
      setActiveCapture(null);
    }
    
    if (activeCapture === 'inspection') {
      setReservation(prev => {
        const newCheckin = { ...prev.checkin };
        
        if (inspectionCategory === 'odometer') {
          newCheckin.odometerPhoto = dataUrl;
          setInspectionCategory('interior');
          setInspectionStep(0);
        } else if (inspectionCategory === 'interior') {
          newCheckin.interiorPhotos = [...(newCheckin.interiorPhotos || []), dataUrl];
          if (inspectionStep < 4) {
            setInspectionStep(prevStep => prevStep + 1);
          } else {
            setInspectionCategory('exterior');
            setInspectionStep(0);
          }
        } else if (inspectionCategory === 'exterior') {
          newCheckin.exteriorPhotos = [...(newCheckin.exteriorPhotos || []), dataUrl];
          if (inspectionStep < 3) {
            setInspectionStep(prevStep => prevStep + 1);
          } else {
            setInspectionCategory('damage');
            setInspectionStep(0);
          }
        } else if (inspectionCategory === 'damage') {
          newCheckin.damagePhotos = [...(newCheckin.damagePhotos || []), dataUrl];
          if (inspectionStep < 4) {
            setInspectionStep(prevStep => prevStep + 1);
          } else {
            setActiveCapture(null);
          }
        }
        
        return { ...prev, checkin: newCheckin };
      });
    }
  };

  const getInspectionLabel = () => {
    switch(inspectionCategory) {
      case 'odometer': return 'Foto do Odómetro';
      case 'interior': return `Vistoria Interior: Foto ${inspectionStep + 1} de 5`;
      case 'exterior': return `Vistoria Exterior: Foto ${inspectionStep + 1} de 4`;
      case 'damage': return `Danos Visíveis: Foto ${inspectionStep + 1} de 5 (Opcional)`;
    }
  };

  const handleSign = async (sig: string) => {
    const finalReservation = { ...reservation, signature: sig, status: 'confirmed' as const };
    setReservation(finalReservation);
    setActiveCapture(null);
    const car = db.getFleet().find(c => c.id === reservation.selectedCarId) || db.getFleet()[0];
    await generateRentalContract(finalReservation, db.getCompany(), car, sig);
    localStorage.removeItem(DRAFT_KEY);
    setPhase(AppPhase.COMPLETED);
  };

  const TERMS_CONTENT = `
    1. SEGUROS: A viatura inclui seguro contra terceiros. Franquia de 800€.
    2. COMBUSTÍVEL: A viatura deve ser entregue com o mesmo nível recebido.
    3. CONDUTOR: Apenas os condutores declarados podem conduzir.
    4. MULTAS: São da inteira responsabilidade do locatário.
    5. ASSISTÊNCIA: Em caso de avaria, contactar o número +351 900 000 000.
  `;

  if (phase === AppPhase.ADMIN_DASHBOARD) return <AdminManagement onBack={() => setPhase(AppPhase.WELCOME)} lang="pt" />;

  if (phase === AppPhase.COMPLETED) {
    return (
      <div className="min-h-screen bg-white dark:bg-slate-950 flex flex-col items-center justify-center p-10 text-center space-y-8 animate-in zoom-in duration-500">
        <div className="w-32 h-32 bg-green-500 rounded-full flex items-center justify-center text-6xl text-white shadow-2xl animate-bounce">✓</div>
        <h1 className="text-4xl font-black tracking-tighter">Reserva Concluída!</h1>
        <p className="text-slate-500 max-w-sm font-medium">O rascunho foi limpo e o contrato foi gerado.</p>
        <button onClick={() => window.location.reload()} className="px-10 py-5 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl active:scale-95 transition-all">Nova Reserva</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white flex flex-col font-sans overflow-hidden">
      <header className="p-6 flex justify-between items-center bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b dark:border-slate-800 z-50">
         <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
            <span className="font-black italic text-xl tracking-tighter uppercase">AUTORENT AZORES</span>
         </div>
         <div className="flex gap-2">
            {hasDraft && !connected && (
              <button onClick={handleReset} className="px-4 py-2 bg-red-50 text-red-600 rounded-full text-[10px] font-black uppercase border border-red-100">
                Limpar Rascunho
              </button>
            )}
            <button onClick={() => setPhase(AppPhase.ADMIN_DASHBOARD)} className="px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-full text-[10px] font-black uppercase">Painel</button>
         </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-8 relative">
        {!connected ? (
          <div className="max-w-xl w-full text-center space-y-10 animate-in fade-in duration-700">
            <div className="space-y-4">
              <h1 className="text-6xl font-black tracking-tighter leading-none">Vem descobrir os Açores.</h1>
              <p className="text-slate-400 font-bold uppercase tracking-[0.2em] text-xs">Agente Inteligente AutoRent Azores</p>
            </div>
            
            <div className="flex flex-col gap-6">
              {hasDraft && (
                <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border-2 border-blue-500 shadow-2xl animate-in slide-in-from-top-4">
                   <p className="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-4">Reserva em curso detectada</p>
                   <div className="flex justify-between items-center mb-6 text-left">
                      <div>
                        <p className="text-lg font-black">{reservation.mainDriver.name || 'Cliente sem nome'}</p>
                        <p className="text-xs text-slate-400 font-medium">
                          {reservation.selectedCarId ? 'Carro Escolhido' : 'Pendente de Viatura'}
                        </p>
                      </div>
                      <div className="text-right">
                         <p className="text-[10px] font-bold text-slate-400">Progresso</p>
                         <p className="text-sm font-black text-blue-600">
                            {reservation.checkin.odometerPhoto ? '75%' : '30%'}
                         </p>
                      </div>
                   </div>
                   <button 
                    onClick={() => handleStartSession(true)} 
                    className="w-full py-6 bg-blue-600 text-white rounded-[2rem] font-black text-xl shadow-xl active:scale-95 transition-all animate-pulse-blue"
                  >
                    Retomar Reserva
                  </button>
                </div>
              )}

              <button 
                onClick={() => handleStartSession(false)} 
                className={`w-full py-8 ${hasDraft ? 'bg-slate-200 dark:bg-slate-800 text-slate-500' : 'bg-blue-600 text-white shadow-2xl'} rounded-[2.5rem] font-black text-2xl active:scale-95 transition-all`}
              >
                {hasDraft ? 'Iniciar Nova Reserva' : 'Começar Agora'}
              </button>
            </div>

            <p className="text-[10px] text-slate-400 max-w-xs mx-auto font-medium leading-relaxed">
              Ao iniciar, concorda que o seu progresso será guardado automaticamente para que possa continuar mais tarde.
            </p>
          </div>
        ) : (
          <div className="max-w-xl w-full text-center space-y-8 animate-in slide-in-from-bottom-8">
             <div className="p-8 bg-white dark:bg-slate-900 border-2 border-blue-100 dark:border-slate-800 rounded-[2.5rem] shadow-2xl relative">
                <div className="absolute -top-3 left-10 px-4 py-1 bg-blue-600 text-white text-[8px] font-black uppercase tracking-widest rounded-full">Agente em Directo</div>
                <p className="text-2xl font-bold italic leading-tight text-slate-800 dark:text-slate-100">"{aiTranscript || "Diga 'Olá' para começar..."}"</p>
             </div>
             
             <div className="grid grid-cols-2 gap-4">
                <div className={`p-5 rounded-3xl border-2 transition-all ${reservation.pickupLocation ? 'bg-green-50 border-green-200 text-green-700' : 'bg-white dark:bg-slate-900 border-transparent opacity-40'}`}>
                   <p className="text-[9px] font-black uppercase tracking-widest mb-1">Localização</p>
                   <p className="text-xs font-bold truncate">{reservation.pickupLocation || 'A aguardar...'}</p>
                </div>
                <div className={`p-5 rounded-3xl border-2 transition-all ${reservation.selectedCarId ? 'bg-green-50 border-green-200 text-green-700' : 'bg-white dark:bg-slate-900 border-transparent opacity-40'}`}>
                   <p className="text-[9px] font-black uppercase tracking-widest mb-1">Veículo</p>
                   <p className="text-xs font-bold">{reservation.selectedCarId ? 'Confirmado' : 'Por escolher'}</p>
                </div>
             </div>
          </div>
        )}
      </main>

      {/* MODALS (Termos, Localização, Câmara, Assinatura, Frota) */}
      {activeCapture === 'terms' && (
        <div className="fixed inset-0 z-[110] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-6 animate-in zoom-in">
           <div className="bg-white dark:bg-slate-900 w-full max-w-md p-8 rounded-[3rem] shadow-2xl border dark:border-slate-800">
              <h3 className="text-2xl font-black tracking-tighter mb-4">Condições Gerais</h3>
              <div className="bg-slate-50 dark:bg-slate-800 p-6 rounded-2xl h-64 overflow-y-auto mb-6 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400 font-medium">
                 {TERMS_CONTENT}
              </div>
              <button onClick={() => setActiveCapture('signature')} className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all">Aceitar e Assinar</button>
           </div>
        </div>
      )}

      {activeCapture === 'location' && (
        <div className="fixed inset-0 z-[110] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-6">
           <div className="bg-white dark:bg-slate-900 w-full max-w-md p-8 rounded-[3rem] shadow-2xl">
              <h3 className="text-2xl font-black mb-4 tracking-tighter">Onde está alojado?</h3>
              <input 
                autoFocus
                type="text" 
                placeholder="Nome do Hotel ou Morada..." 
                className="w-full p-5 bg-slate-100 dark:bg-slate-800 rounded-2xl outline-none font-bold border-2 border-transparent focus:border-blue-500 transition-all"
                onChange={(e) => setReservation(prev => ({ ...prev, pickupLocation: e.target.value }))}
              />
              <button onClick={() => setActiveCapture(null)} className="mt-6 w-full py-5 bg-slate-900 dark:bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest">Confirmar Local</button>
           </div>
        </div>
      )}

      {activeCapture && (activeCapture === 'id' || activeCapture === 'inspection') && (
        <div className="fixed inset-0 z-[120] bg-slate-950 flex items-center justify-center p-6">
           <div className="w-full max-w-md">
             <CameraCapture 
               label={activeCapture === 'inspection' ? getInspectionLabel() : 'Validar Identidade'} 
               onCapture={handleCapture} 
             />
             <div className="flex gap-4 mt-6">
                {activeCapture === 'inspection' && inspectionCategory === 'damage' && (
                  <button onClick={() => setActiveCapture(null)} className="flex-1 py-5 bg-green-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg">Finalizar Vistoria</button>
                )}
                <button onClick={() => setActiveCapture(null)} className="flex-1 text-white/50 text-[10px] font-black uppercase tracking-widest border-2 border-white/10 rounded-2xl py-5 hover:bg-white/5">Cancelar</button>
             </div>
           </div>
        </div>
      )}

      {activeCapture === 'signature' && (
        <div className="fixed inset-0 z-[130] bg-slate-950/95 flex items-center justify-center p-6">
           <div className="w-full max-w-lg">
             <SignaturePad onSave={handleSign} />
             <button onClick={() => setActiveCapture('terms')} className="mt-4 w-full text-white/40 text-[10px] font-black uppercase tracking-[0.2em]">Voltar aos Termos</button>
           </div>
        </div>
      )}

      {activeCapture === 'fleet' && (
        <div className="fixed inset-x-0 bottom-0 z-[100] bg-white dark:bg-slate-900 rounded-t-[3.5rem] p-10 shadow-2xl border-t-4 border-blue-600 h-[70vh] overflow-y-auto animate-in slide-in-from-bottom-20 duration-500">
           <div className="flex justify-between items-center mb-8">
              <div>
                <h3 className="text-3xl font-black tracking-tighter">Escolha o seu Carro</h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Todos os veículos incluem seguro base</p>
              </div>
              <button onClick={() => setActiveCapture(null)} className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center font-black">✕</button>
           </div>
           <div className="grid gap-6">
              {db.getFleet().map(car => (
                <button 
                  key={car.id} 
                  onClick={() => { setReservation(prev => ({ ...prev, selectedCarId: car.id })); setActiveCapture(null); }} 
                  className="group flex gap-8 bg-slate-50 dark:bg-slate-800/50 p-6 rounded-[2.5rem] text-left hover:border-blue-500 border-2 border-transparent transition-all shadow-sm hover:shadow-xl"
                >
                   <div className="w-32 h-32 shrink-0 overflow-hidden rounded-3xl">
                      <img src={car.image} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                   </div>
                   <div className="flex flex-col justify-center">
                      <p className="font-black text-2xl tracking-tighter leading-none mb-1">{car.brand} {car.model}</p>
                      <p className="text-blue-600 font-black text-lg mb-2">{car.price}</p>
                      <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">{car.specs}</p>
                   </div>
                </button>
              ))}
           </div>
        </div>
      )}

      <ToastSystem notifications={notifications} onRemove={id => setNotifications(prev => prev.filter(n => n.id !== id))} />
    </div>
  );
}
