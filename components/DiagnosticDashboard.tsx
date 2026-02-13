
import React, { useState, useEffect, useCallback } from 'react';
import { systemMonitor } from '../services/systemMonitor';
import { HealthReport } from '../types';

interface DiagnosticDashboardProps {
  autoStart?: boolean;
}

export const DiagnosticDashboard: React.FC<DiagnosticDashboardProps> = ({ autoStart = false }) => {
  const [report, setReport] = useState<HealthReport>(systemMonitor.getFullReport());
  const [isScanning, setIsScanning] = useState(false);
  const [scanStep, setScanStep] = useState('');
  const [progress, setProgress] = useState(0);

  const runFullDiagnostic = useCallback(async () => {
    if (isScanning) return;
    
    setIsScanning(true);
    setProgress(5);
    setScanStep('Inicializando protocolos de segurança...');
    await new Promise(r => setTimeout(r, 800));
    
    setProgress(25);
    setScanStep('Validando conectividade com Gemini AI...');
    await new Promise(r => setTimeout(r, 1000));
    
    setProgress(50);
    setScanStep('Testando subsistema de áudio e buffers de PCM...');
    await new Promise(r => setTimeout(r, 800));
    
    setProgress(75);
    setScanStep('Verificando integridade do Local Storage e base de dados...');
    await new Promise(r => setTimeout(r, 600));
    
    setProgress(90);
    setScanStep('Finalizando relatório de estabilidade...');
    
    const newReport = await systemMonitor.runFullDiagnostic();
    setReport(newReport);
    
    setProgress(100);
    setScanStep('Diagnóstico concluído com sucesso!');
    
    setTimeout(() => {
      setIsScanning(false);
      setProgress(0);
    }, 1500);
  }, [isScanning]);

  useEffect(() => {
    if (autoStart) {
      runFullDiagnostic();
    }
  }, []); // Run once on mount if autoStart is true

  useEffect(() => {
    const interval = setInterval(() => {
      setReport(systemMonitor.getFullReport());
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-green-500 bg-green-500/10';
      case 'degraded': return 'text-amber-500 bg-amber-500/10';
      case 'critical': return 'text-red-500 bg-red-500/10';
      default: return 'text-slate-400';
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in pb-20 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-4xl font-black tracking-tighter">Diagnostic Core</h2>
            <span className={`px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${getStatusColor(report.status)}`}>
              System {report.status}
            </span>
          </div>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-[0.2em]">Elite Auto-Healer Engine v2.5</p>
        </div>
        
        <div className="flex gap-3">
          <button 
            onClick={() => { if(confirm("Deseja forçar reparação total?")) systemMonitor.triggerAutoHeal('AI_CORE', 'Manual Trigger'); }}
            className="px-6 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 transition-all"
          >
            Forçar Reparação
          </button>
          <button 
            onClick={runFullDiagnostic}
            disabled={isScanning}
            className={`relative min-w-[240px] px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all overflow-hidden ${isScanning ? 'bg-slate-200 text-slate-500 cursor-wait' : 'bg-blue-600 text-white shadow-xl shadow-blue-500/20 hover:scale-105 active:scale-95'}`}
          >
            <span className="relative z-10">{isScanning ? 'A Processar...' : 'Correr Suite Completa'}</span>
            {isScanning && <div className="absolute inset-0 bg-blue-600/10 animate-pulse"></div>}
          </button>
        </div>
      </div>

      {/* PROGRESS OVERLAY DURING SCAN */}
      {isScanning && (
        <div className="bg-blue-600 text-white p-10 rounded-[3rem] shadow-2xl animate-in zoom-in duration-500 flex flex-col items-center gap-6">
           <div className="text-center">
              <h3 className="text-2xl font-black italic mb-2 tracking-tighter">Diagnosticando Ecossistema...</h3>
              <p className="text-white/60 text-[10px] font-black uppercase tracking-[0.3em]">{scanStep}</p>
           </div>
           
           <div className="w-full max-w-2xl bg-white/10 h-3 rounded-full overflow-hidden border border-white/10">
              <div 
                className="h-full bg-white shadow-[0_0_20px_rgba(255,255,255,0.5)] transition-all duration-500 ease-out" 
                style={{ width: `${progress}%` }}
              ></div>
           </div>
           
           <div className="flex gap-8 text-[9px] font-black uppercase tracking-widest text-white/40">
              <span className={progress >= 25 ? 'text-white' : ''}>Conectividade</span>
              <span className={progress >= 50 ? 'text-white' : ''}>Áudio</span>
              <span className={progress >= 75 ? 'text-white' : ''}>Database</span>
              <span className={progress >= 90 ? 'text-white' : ''}>Stabilidade</span>
           </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Global Stability Card */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-10 rounded-[3.5rem] border dark:border-slate-800 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-10 opacity-[0.02] text-9xl font-black select-none pointer-events-none group-hover:scale-110 transition-transform duration-1000">SAFE</div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Estabilidade Global do Ecossistema</p>
          <div className="flex items-end gap-4 mb-8">
             <div className="text-8xl font-black text-blue-600 tracking-tighter">{report.stabilityScore}%</div>
             <div className="text-xs font-bold text-slate-400 uppercase mb-4 tracking-widest">Confidence Index</div>
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-4 rounded-full overflow-hidden mb-4">
            <div className={`h-full transition-all duration-1000 ${report.stabilityScore > 80 ? 'bg-blue-600' : 'bg-amber-500'}`} style={{width: `${report.stabilityScore}%`}}></div>
          </div>
          <p className="text-[10px] text-slate-400 font-medium">Última análise realizada em {new Date(report.lastCheck).toLocaleString()}</p>
        </div>

        {/* Quick Stats Grid */}
        <div className="space-y-6">
           {report.modules.map(m => (
             <div key={m.name} className="bg-white dark:bg-slate-900 p-6 rounded-3xl border dark:border-slate-800 flex items-center justify-between">
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{m.name.replace('_', ' ')}</p>
                  <p className="text-sm font-bold mt-1 truncate max-w-[180px]">{m.lastTestMessage || 'A aguardar teste...'}</p>
                </div>
                <div className={`w-3 h-3 rounded-full ${m.status === 'healthy' ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-amber-500 animate-pulse'}`}></div>
             </div>
           ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Healing History */}
        <div className="bg-slate-900 text-white p-10 rounded-[3rem] shadow-2xl border border-white/5">
          <h3 className="text-xl font-black mb-8 italic tracking-tight">Auto-Correction Log</h3>
          <div className="space-y-4">
            {report.recentHeals.length === 0 ? (
               <div className="py-12 text-center opacity-30">
                  <p className="text-4xl mb-4">✨</p>
                  <p className="text-[10px] font-black uppercase tracking-widest">Nenhuma re-calibração necessária</p>
               </div>
            ) : (
              report.recentHeals.slice(0, 5).map(heal => (
                <div key={heal.id} className="p-5 bg-white/5 rounded-2xl border border-white/5 flex items-start gap-4 animate-in slide-in-from-left-4">
                   <div className="w-10 h-10 rounded-xl bg-blue-600/20 flex items-center justify-center text-blue-400 text-lg">⚡</div>
                   <div className="flex-1">
                      <div className="flex justify-between items-start mb-1">
                        <p className="font-black text-[10px] uppercase tracking-widest text-blue-400">{heal.module}</p>
                        <span className="text-[8px] opacity-40 font-mono">{new Date(heal.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <p className="text-sm font-bold mb-1">{heal.action}</p>
                      <p className="text-[10px] text-slate-400 font-medium">{heal.resultMessage}</p>
                   </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Realtime Telemetry Monitor */}
        <div className="bg-white dark:bg-slate-900 p-10 rounded-[3rem] border dark:border-slate-800">
           <div className="flex justify-between items-center mb-8">
              <h3 className="text-xl font-black tracking-tight">Telemetry Stream</h3>
              <div className="flex items-center gap-2">
                 <div className="w-2 h-2 bg-blue-600 rounded-full animate-ping"></div>
                 <span className="text-[9px] font-black uppercase text-blue-600">Live Buffer</span>
              </div>
           </div>
           <div className="space-y-3 font-mono text-[10px] h-[300px] overflow-y-auto pr-4 no-scrollbar">
              {systemMonitor.getLogs().map(log => (
                <div key={log.id} className={`flex gap-4 p-2 rounded-lg ${log.level === 'error' ? 'bg-red-500/5 text-red-500' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                   <span className="opacity-30">[{new Date(log.timestamp).toLocaleTimeString([], {hour12: false})}]</span>
                   <span className="font-bold w-12 text-center uppercase">[{log.level}]</span>
                   <span className="font-black text-slate-900 dark:text-slate-300">[{log.component}]</span>
                   <span className="truncate">{log.message}</span>
                </div>
              ))}
           </div>
        </div>
      </div>
    </div>
  );
};
