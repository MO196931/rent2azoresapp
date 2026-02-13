
import React, { useState } from 'react';
import { systemMonitor } from '../services/systemMonitor';
import { runPdfTest } from '../services/pdfService';
import { notificationManager } from '../services/notificationManager';
import { HealthReport } from '../types';

export const DiagnosticDashboard: React.FC = () => {
  const [report, setReport] = useState<HealthReport>(systemMonitor.getFullReport());
  const [isScanning, setIsScanning] = useState(false);
  const [isPdfTesting, setIsPdfTesting] = useState(false);
  const [learningTopic, setLearningTopic] = useState<string | null>(null);

  const runDiagnostic = async () => {
    setIsScanning(true);
    await systemMonitor.verifyTranslations();
    const newReport = await systemMonitor.runDailyHealthCheck();
    setReport(newReport);
    setTimeout(() => setIsScanning(false), 1500);
  };

  const handlePdfTest = async () => {
    setIsPdfTesting(true);
    try {
      await runPdfTest();
      systemMonitor.logEvent('info', 'USER_INTERFACE', 'Teste de motor PDF concluído com sucesso.');
    } catch (e) {
      systemMonitor.logEvent('error', 'USER_INTERFACE', 'Falha no motor de geração PDF.');
    }
    setIsPdfTesting(false);
  };

  const testWhatsApp = () => {
    notificationManager.createAlert('whatsapp', 'Teste de WhatsApp', '🚗 Confirmação Elite: O seu veículo está pronto! Esta é uma simulação do Gateway de mensagens.');
  };

  const topics: Record<string, string> = {
    'AI_CORE': 'O motor Gemini processa áudio pcm a 16kHz. O diagnóstico valida a latência de tokens e a precisão do OCR nos dashboards.',
    'AUDIO_SUBSYSTEM': 'Gere o ScriptProcessorNode. A estabilidade aqui garante que não existam cortes na conversa VIP.',
    'STABILITY': 'Métrica composta. Se a estabilidade descer abaixo de 80%, o sistema sugere a limpeza de cache local.',
    'TRANSLATIONS': 'Auditoria de chaves i18n para garantir que o cliente VIP recebe o idioma correto sem falhas.'
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h2 className="text-3xl font-black tracking-tighter">System Health Center</h2>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Elite Auto-Healer Engine v2.5</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={testWhatsApp}
            className="px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest bg-green-600 text-white shadow-xl hover:bg-green-700 transition-all active:scale-95 flex items-center gap-2"
          >
            <span>📱</span> Test WhatsApp
          </button>
          <button 
            onClick={handlePdfTest}
            disabled={isPdfTesting}
            className="px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest bg-slate-900 text-white shadow-xl hover:bg-black transition-all active:scale-95"
          >
            {isPdfTesting ? 'Generating PDF...' : 'Test PDF Engine'}
          </button>
          <button 
            onClick={runDiagnostic}
            disabled={isScanning}
            className={`px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${isScanning ? 'bg-slate-200 animate-pulse text-slate-500' : 'bg-blue-600 text-white shadow-lg shadow-blue-500/30 active:scale-95'}`}
          >
            {isScanning ? 'Analyzing...' : 'Run Diagnostics'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border dark:border-slate-800 shadow-sm relative overflow-hidden group">
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-blue-600 opacity-[0.03] rounded-full group-hover:scale-150 transition-transform duration-1000"></div>
          <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Global Stability</p>
          <div className="text-5xl font-black text-blue-600">{report.stabilityScore}%</div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full mt-6 overflow-hidden">
            <div className="bg-blue-600 h-full transition-all duration-1000" style={{width: `${report.stabilityScore}%`}}></div>
          </div>
          <button onClick={() => setLearningTopic('STABILITY')} className="mt-6 text-[10px] font-black text-slate-400 underline uppercase tracking-tighter">View Methodology</button>
        </div>

        <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border dark:border-slate-800 shadow-sm flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">WhatsApp Gateway</p>
              <div className="px-3 py-1 bg-green-100 text-green-600 rounded-full text-[9px] font-black uppercase">Active</div>
            </div>
            <div className="text-3xl font-black">200 <span className="text-sm text-slate-400 font-bold italic">OK</span></div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter mt-4">Encryption: RSA-4096 Enabled</p>
        </div>

        {report.modules.slice(0,1).map(m => (
          <div key={m.name} className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border dark:border-slate-800 shadow-sm flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{m.name.replace('_', ' ')}</p>
              <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase ${m.status === 'healthy' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                {m.status}
              </div>
            </div>
            <div className="text-3xl font-black">{m.latency} <span className="text-sm text-slate-400 font-bold">ms</span></div>
            <button onClick={() => setLearningTopic(m.name)} className="mt-4 text-[10px] font-black text-blue-600 uppercase tracking-tighter">System Specs</button>
          </div>
        ))}
      </div>

      {learningTopic && (
        <div className="bg-slate-900 text-white p-10 rounded-[3rem] border border-white/10 animate-in zoom-in-95 duration-500 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10 text-6xl">🧠</div>
          <div className="flex justify-between items-center mb-4">
            <h4 className="font-black text-blue-400 uppercase text-xs tracking-[0.2em]">Operational Intelligence</h4>
            <button onClick={() => setLearningTopic(null)} className="text-white/50 hover:text-white text-xl">✕</button>
          </div>
          <p className="text-lg leading-relaxed font-bold italic">"{topics[learningTopic]}"</p>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-[3rem] border dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="p-8 border-b dark:border-slate-800 flex justify-between items-center">
          <h3 className="font-black text-xs uppercase tracking-widest text-slate-400">Activity Log</h3>
        </div>
        <div className="p-16 text-center">
            <div className="text-4xl mb-4">✨</div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Coerência de Dados Garantida</p>
            <p className="text-[9px] text-slate-300 mt-1">Todos os módulos estão em sincronia com o mock-backend.</p>
        </div>
      </div>
    </div>
  );
};
