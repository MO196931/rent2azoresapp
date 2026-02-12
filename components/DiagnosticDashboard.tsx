
import React, { useState } from 'react';
import { systemMonitor } from '../services/systemMonitor';
import { runPdfTest } from '../services/pdfService';
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

  const topics: Record<string, string> = {
    'AI_CORE': 'A IA utiliza modelos generativos para entender a voz. O diagnóstico verifica a latência (tempo de resposta) e se a chave de API está ativa.',
    'AUDIO_SUBSYSTEM': 'Gere o microfone e as colunas. Corrigimos erros limpando o "Buffer" que pode causar ecos ou atrasos.',
    'STABILITY': 'Métrica global. Abaixo de 70%, o sistema entra em modo de segurança, encurtando as respostas para poupar recursos.',
    'TRANSLATIONS': 'Verifica se todos os idiomas têm as mesmas etiquetas. Se faltar algo, a IA traduz automaticamente.'
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h2 className="text-3xl font-black tracking-tighter">System Health Center</h2>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Auto-Correction Engine v2.5 • Full Test Mode</p>
        </div>
        <div className="flex gap-2">
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
            {isScanning ? 'Analyzing...' : 'Run Full Diagnostics'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border dark:border-slate-800 shadow-sm relative overflow-hidden group">
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-blue-600 opacity-[0.03] rounded-full group-hover:scale-150 transition-transform duration-1000"></div>
          <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Global Stability</p>
          <div className="text-5xl font-black text-blue-600">{report.stabilityScore}%</div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full mt-6 overflow-hidden">
            <div className="bg-blue-600 h-full transition-all duration-1000 shadow-[0_0_10px_rgba(37,99,235,0.5)]" style={{width: `${report.stabilityScore}%`}}></div>
          </div>
          <button onClick={() => setLearningTopic('STABILITY')} className="mt-6 text-[10px] font-black text-slate-400 underline uppercase tracking-tighter">Learn Methodology</button>
        </div>

        {report.modules.slice(0,2).map(m => (
          <div key={m.name} className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border dark:border-slate-800 shadow-sm">
            <div className="flex justify-between items-start mb-4">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{m.name.replace('_', ' ')}</p>
              <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase ${m.status === 'healthy' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${m.status === 'healthy' ? 'bg-green-500' : 'bg-red-500 animate-ping'}`}></span>
                {m.status}
              </div>
            </div>
            <div className="text-3xl font-black">{m.latency} <span className="text-sm text-slate-400 font-bold">ms</span></div>
            <div className="mt-6 flex gap-2">
               <button onClick={() => setLearningTopic(m.name)} className="text-[10px] font-black text-blue-600 uppercase tracking-tighter">Deep View</button>
               <span className="text-slate-300">|</span>
               <button className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">History</button>
            </div>
          </div>
        ))}
      </div>

      {learningTopic && (
        <div className="bg-slate-900 text-white p-10 rounded-[3rem] border border-white/10 animate-in zoom-in-95 duration-500 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10 text-6xl">🧠</div>
          <div className="flex justify-between items-center mb-4">
            <h4 className="font-black text-blue-400 uppercase text-xs tracking-[0.2em]">Learning Node Active</h4>
            <button onClick={() => setLearningTopic(null)} className="text-white/50 hover:text-white text-xl">✕</button>
          </div>
          <p className="text-lg leading-relaxed font-bold italic">"{topics[learningTopic]}"</p>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-[3rem] border dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="p-8 border-b dark:border-slate-800 flex justify-between items-center">
          <h3 className="font-black text-xs uppercase tracking-[0.2em]">Self-Healing Log (Last 24h)</h3>
          <span className="text-[10px] font-mono text-slate-400">STATUS: MONITORING</span>
        </div>
        <div className="divide-y dark:divide-slate-800">
          {report.recentHeals.length === 0 ? (
            <div className="p-16 text-center">
                <div className="text-4xl mb-4">✨</div>
                <div className="text-xs font-black text-slate-400 uppercase tracking-widest">System Architecture Optimal</div>
                <p className="text-[10px] text-slate-300 mt-1">No intervention required by AI Auto-Healer.</p>
            </div>
          ) : (
            report.recentHeals.map(h => (
              <div key={h.id} className="p-6 flex items-center gap-6 group hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-2xl flex items-center justify-center text-green-600 text-xl group-hover:rotate-12 transition-transform">🛡️</div>
                <div className="flex-1">
                  <p className="text-sm font-black text-slate-900 dark:text-white">{h.action}</p>
                  <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-tighter">{new Date(h.timestamp).toLocaleTimeString()} • COMPONENT: {h.module}</p>
                </div>
                <div className="text-right">
                    <span className="text-[10px] font-black text-green-500 border border-green-200 px-3 py-1 rounded-full uppercase tracking-widest">Fixed</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
