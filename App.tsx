
import React, { useState, useEffect, useRef } from 'react';
import { AppPhase, ReservationData, CarDetails, ServiceItem, CompanySettings, MaintenanceRecord } from './types';
import { decode, decodeAudioData, createPcmBlob } from './services/audioUtils';
import { analyzeRegistrationCertificate, askAdminAssistant } from './services/geminiService';
import { db } from './services/mockDatabase'; 
import CameraCapture from './components/CameraCapture';
import { GoogleGenAI, LiveServerMessage, Modality, Type } from '@google/genai';

export default function App() {
  const [phase, setPhase] = useState<AppPhase>(AppPhase.WELCOME);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [fleet, setFleet] = useState<CarDetails[]>([]);
  const [adminTab, setAdminTab] = useState<'reservas' | 'frota' | 'ia' | 'config'>('reservas');
  const [selectedCarForMaint, setSelectedCarForMaint] = useState<CarDetails | null>(null);
  const [loginPassword, setLoginPassword] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [groundingLinks, setGroundingLinks] = useState<{title: string, uri: string}[]>([]);

  const [reservation, setReservation] = useState<ReservationData>(() => ({
    status: 'draft', additionalDrivers: [], selectedExtras: [], selectedInsurance: 's1',
    documentsUploaded: false, transcript: [], driverName: '',
    startDate: new Date().toISOString().split('T')[0], startTime: '10:00',
    endDate: new Date(Date.now() + 86400000).toISOString().split('T')[0], endTime: '10:00',
    contextInsights: ''
  }));

  const [connected, setConnected] = useState(false);
  const [audioVolume, setAudioVolume] = useState(0);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);

  useEffect(() => {
    setFleet(db.getFleet());
  }, []);

  const getSystemInstruction = () => {
    const isConfirmed = reservation.status === 'confirmed';
    return `
      Você é o "Concierge AutoRent Azores".
      
      MODO ATUAL: ${isConfirmed ? 'EXPERT PROATIVO (Dicas de Viagem)' : 'ASSISTENTE DE RESERVA (Recolha de Dados)'}
      
      REGRAS:
      1. Se status for 'confirmed': Use a função 'procurar_dicas_azores' para dar roteiros personalizados baseados nos interesses do cliente (${reservation.contextInsights}).
      2. Se status for 'draft': Foque em fechar a reserva (datas, horas, condutor).
      
      DADOS: Cliente ${reservation.driverName || 'Novo'}. Carro: ${reservation.selectedCar || 'Nenhum'}.
    `;
  };

  const fetchLiveAzoresTips = async (query: string) => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Dê uma dica fascinante sobre os Açores: ${query}`,
      config: { tools: [{ googleSearch: {} }] },
    });
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks) setGroundingLinks(chunks.filter(c => c.web).map(c => ({ title: c.web.title, uri: c.web.uri })));
    return response.text;
  };

  const connectToGemini = async () => {
    setGroundingLinks([]);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const audioContext = new AudioContext({ sampleRate: 24000 });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const inputContext = new AudioContext({ sampleRate: 16000 });
      const source = inputContext.createMediaStreamSource(stream);
      const processor = inputContext.createScriptProcessor(4096, 1, 1);

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: getSystemInstruction(),
          tools: [{
            functionDeclarations: [{
              name: 'procurar_dicas_azores',
              parameters: { type: Type.OBJECT, properties: { query: { type: Type.STRING } }, required: ['query'] }
            }]
          }]
        },
        callbacks: {
          onopen: () => setConnected(true),
          onmessage: async (msg: LiveServerMessage) => {
            if (msg.toolCall) {
              for (const fc of msg.toolCall.functionCalls) {
                const result = await fetchLiveAzoresTips(fc.args.query);
                sessionPromiseRef.current?.then(s => s.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: { result } } }));
              }
            }
            const data = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (data) {
              const buffer = await decodeAudioData(decode(data), audioContext);
              const src = audioContext.createBufferSource();
              src.buffer = buffer; src.connect(audioContext.destination); src.start();
            }
          }
        }
      });
      sessionPromiseRef.current = sessionPromise;
      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        let sum = 0; for(let i=0; i<inputData.length; i++) sum += inputData[i]*inputData[i];
        setAudioVolume(Math.sqrt(sum/inputData.length)*100);
        sessionPromiseRef.current?.then(s => s.sendRealtimeInput({ media: createPcmBlob(inputData) }));
      };
      source.connect(processor); processor.connect(inputContext.destination);
    } catch (e) { console.error(e); }
  };

  const handleRegDocCapture = async (carId: string, base64: string) => {
    setIsAiLoading(true);
    const data = await analyzeRegistrationCertificate(base64);
    setFleet(prev => prev.map(c => c.id === carId ? { ...c, ...data, regDocFront: base64 } : c));
    setIsAiLoading(false);
  };

  const addMaintenance = (carId: string) => {
    const newMaint: MaintenanceRecord = {
      id: Date.now().toString(),
      date: new Date().toISOString().split('T')[0],
      type: 'Preventiva',
      description: 'Mudança de óleo e filtros',
      odometer: 0,
      cost: 150
    };
    setFleet(prev => prev.map(c => c.id === carId ? { ...c, maintenanceHistory: [...c.maintenanceHistory, newMaint] } : c));
  };

  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'dark bg-slate-950 text-white' : 'bg-slate-50 text-slate-900'} transition-colors`}>
      {phase === AppPhase.ADMIN_DASHBOARD ? (
        <div className="flex h-screen overflow-hidden">
          <aside className="w-72 bg-white dark:bg-slate-900 border-r dark:border-slate-800 p-8 flex flex-col">
            <h1 className="text-2xl font-black text-blue-600 mb-10 tracking-tighter">AutoRent Backoffice</h1>
            <nav className="space-y-2 flex-1">
              {['reservas', 'frota', 'ia', 'config'].map((t) => (
                <button key={t} onClick={() => setAdminTab(t as any)} className={`w-full text-left p-4 rounded-xl font-bold capitalize transition-all ${adminTab === t ? 'bg-blue-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                  {t === 'reservas' ? '📅 Reservas' : t === 'frota' ? '🚗 Gestão de Frota' : t === 'ia' ? '🤖 Admin AI' : '⚙️ Config'}
                </button>
              ))}
            </nav>
            <button onClick={() => setPhase(AppPhase.WELCOME)} className="p-4 text-red-500 font-bold uppercase text-xs">Sair</button>
          </aside>

          <main className="flex-1 p-10 overflow-y-auto">
            {adminTab === 'reservas' && (
              <div className="space-y-6">
                <h2 className="text-4xl font-black">Reservas Ativas</h2>
                <div className="grid grid-cols-1 gap-4">
                  {db.getReservations().map(res => (
                    <div key={res.id} className="bg-white dark:bg-slate-900 p-6 rounded-3xl border dark:border-slate-800 flex justify-between items-center shadow-sm">
                      <div>
                        <div className="font-black text-lg">{res.driverName || 'Pendente'}</div>
                        <div className="text-xs text-slate-400 font-bold">{res.selectedCar} • {res.startDate} a {res.endDate}</div>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => {
                            const updated = { ...res, status: 'confirmed' as const };
                            db.saveReservation(updated);
                            setReservation(updated);
                          }}
                          className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase ${res.status === 'confirmed' ? 'bg-green-100 text-green-600' : 'bg-blue-600 text-white'}`}
                        >
                          {res.status === 'confirmed' ? 'Confirmada' : 'Confirmar Reserva'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {adminTab === 'frota' && (
              <div className="space-y-8">
                <h2 className="text-4xl font-black">Frota & Manutenção</h2>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                  {fleet.map(car => (
                    <div key={car.id} className="bg-white dark:bg-slate-900 rounded-[2.5rem] border dark:border-slate-800 shadow-xl overflow-hidden">
                      <div className="p-8 border-b dark:border-slate-800 flex gap-6 items-center">
                        <img src={car.image} className="w-24 h-24 object-cover rounded-2xl" />
                        <div className="flex-1">
                          <h3 className="text-xl font-black">{car.brand} {car.model}</h3>
                          <p className="text-xs font-mono text-blue-600 font-bold uppercase">{car.licensePlate} • VIN: {car.vin || 'Não registado'}</p>
                        </div>
                        <button onClick={() => addMaintenance(car.id)} className="bg-slate-100 dark:bg-slate-800 p-3 rounded-xl hover:bg-blue-600 hover:text-white transition-all text-xs font-black">🔧 Nova Maint.</button>
                      </div>
                      
                      <div className="p-8 grid grid-cols-2 gap-6">
                        <div>
                          <p className="text-[10px] font-black uppercase text-slate-400 mb-4 tracking-widest">Doc. Matrícula</p>
                          <CameraCapture label="Scan Certificado Matrícula" onCapture={(base64) => handleRegDocCapture(car.id, base64)} />
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase text-slate-400 mb-4 tracking-widest">Histórico de Manutenções</p>
                          <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                            {car.maintenanceHistory?.length > 0 ? car.maintenanceHistory.map(m => (
                              <div key={m.id} className="text-[10px] p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg flex justify-between">
                                <span className="font-bold">{m.date} - {m.type}</span>
                                <span className="font-mono text-blue-600">{m.cost}€</span>
                              </div>
                            )) : <p className="text-[10px] italic text-slate-500">Sem registos.</p>}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </main>
        </div>
      ) : (
        <main className="container mx-auto px-4 py-12 max-w-xl text-center">
          <header className="mb-16">
            <h1 className="text-5xl font-black tracking-tighter text-blue-600">AutoRent Azores</h1>
          </header>

          {phase === AppPhase.WELCOME && (
            <div className="space-y-12">
               <h2 className="text-6xl font-black leading-none">A sua viagem<br/> começa aqui.</h2>
               <div className="w-full space-y-4">
                 <button onClick={connectToGemini} className="w-full bg-blue-600 text-white py-8 rounded-[2.5rem] text-xl font-black shadow-2xl hover:scale-[1.02] transition-transform">
                    {connected ? '🐬 Concierge Ativo' : '🎙️ Falar com Agente AI'}
                 </button>
                 {reservation.status === 'confirmed' && (
                   <div className="bg-green-100 text-green-700 p-6 rounded-3xl border border-green-200 animate-bounce">
                     ✅ Reserva Confirmada! O seu concierge está pronto para dar dicas.
                   </div>
                 )}
               </div>
               <button onClick={() => setPhase(AppPhase.ADMIN_LOGIN)} className="text-slate-400 font-black text-xs uppercase tracking-widest">Gestão Staff</button>
            </div>
          )}

          {connected && (
            <div className="fixed bottom-10 left-6 right-6 bg-slate-900 text-white p-8 rounded-[3rem] shadow-2xl border border-white/10">
               <div className="flex items-center gap-6">
                 <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center animate-pulse">🐬</div>
                 <div className="flex-1 text-left">
                    <p className="text-[10px] font-black uppercase tracking-widest text-blue-400">Status: {reservation.status === 'confirmed' ? 'Expert Local Ativo' : 'Recolha de Dados'}</p>
                    <div className="h-2 bg-white/10 rounded-full mt-2 overflow-hidden">
                      <div className="h-full bg-blue-500" style={{width: `${Math.min(100, audioVolume * 5)}%`}}></div>
                    </div>
                 </div>
               </div>
               {groundingLinks.length > 0 && (
                 <div className="mt-6 pt-6 border-t border-white/10 flex flex-wrap gap-2">
                   {groundingLinks.map((l, i) => (
                     <a key={i} href={l.uri} target="_blank" className="text-[10px] bg-white/5 px-3 py-1 rounded-full hover:bg-white/20">🔗 {l.title}</a>
                   ))}
                 </div>
               )}
            </div>
          )}

          {phase === AppPhase.ADMIN_LOGIN && (
            <div className="fixed inset-0 bg-slate-950/95 flex items-center justify-center p-6 z-[300]">
              <div className="bg-white p-12 rounded-[3.5rem] w-full max-w-sm text-center">
                <h2 className="text-3xl font-black mb-8">Admin Access</h2>
                <input type="password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} className="w-full p-5 bg-slate-100 rounded-2xl mb-4 text-center text-2xl font-black" placeholder="••••" />
                <button onClick={() => loginPassword === 'admin' ? setPhase(AppPhase.ADMIN_DASHBOARD) : alert('Erro')} className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black">Login</button>
                <button onClick={() => setPhase(AppPhase.WELCOME)} className="mt-6 text-slate-400 font-bold">Cancelar</button>
              </div>
            </div>
          )}
        </main>
      )}
    </div>
  );
}
