
import React, { useState, useEffect, useCallback } from 'react';
import { systemMonitor } from '../services/systemMonitor';
import { HealthReport } from '../types';

interface DiagnosticDashboardProps {
  autoStart?: boolean;
}

export const DiagnosticDashboard: React.FC<DiagnosticDashboardProps> = ({ autoStart = false }) => {
  const [report, setReport] = useState<HealthReport>(() => systemMonitor.getInstantReport());
  const [isScanning, setIsScanning] = useState(false);
  const [scanStep, setScanStep] = useState('');
  const [progress, setProgress] = useState(0);

  const runFullDiagnostic = useCallback(async () => {
    if (isScanning) return;
    
    setIsScanning(true);
    setProgress(5);
    setScanStep('Inicializando protocolos de segurança...');
    await new Promise(r => setTimeout(r, 600));
    
    setProgress(25);
    setScanStep('Validando conectividade com Gemini AI...');
    const result = await systemMonitor.runFullDiagnostic();
    
    setProgress(60);
    setScanStep('Analisando integridade dos módulos locais...');
    await new Promise(r => setTimeout(r, 400));
    
    setProgress(85);
    setScanStep('Verificando quotas de armazenamento e memória...');
    await new Promise(r => setTimeout(r, 400));
    
    setProgress(100);
    setScanStep('Diagnóstico concluído com sucesso.');
    setReport(result);
    setIsScanning(false);
  }, [isScanning]);

  useEffect(() => {
    if (autoStart) runFullDiagnostic();
  }, [autoStart, runFullDiagnostic]);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-black tracking-tighter italic uppercase">Health Monitor</h2>
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] mt-1">Status em Tempo Real do Ecossistema</p>
        </div>
        <button 
          onClick={runFullDiagnostic} 
          disabled={isScanning}
          className={`px-6 py-3 bg-blue-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl transition-all ${isScanning ? 'opacity-50' : 'hover:scale-105 active:scale-95'}`}
        >
          {isScanning ? 'A Processar...' : 'Executar Scan'}
        </button>
      </div>

      {isScanning && (
        <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border dark:border-slate-800 space-y-4">
           <div className="flex justify-between items-center mb-2">
              <span className="text-[10px] font-black uppercase text-blue-500 tracking-widest animate-pulse">{scanStep}</span>
              <span className="text-xs font-black">{progress}%</span>
           </div>
           <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-blue-600 transition-all duration-500" style={{ width: `${progress}%` }}></div>
           </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border dark:border-slate-800">
           <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-4">Estabilidade Global</p>
           <div className="flex items-center gap-4">
              <div className={`text-5xl font-black tracking-tighter ${report.stabilityScore > 80 ? 'text-green-500' : 'text-amber-500'}`}>{report.stabilityScore}%</div>
              <div className={`w-3 h-3 rounded-full ${report.status === 'healthy' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
           </div>
        </div>
        
        <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border dark:border-slate-800">
           <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-4">Memória Heap (JS)</p>
           <div className="text-3xl font-black tracking-tight">{formatBytes(report.environment.memory || 0)}</div>
           <p className="text-[9px] text-slate-400 mt-2 font-bold uppercase">Uso Ativo do Motor V8</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border dark:border-slate-800">
           <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-4">Armazenamento Local</p>
           <div className="flex justify-between items-end">
              <span className="text-3xl font-black tracking-tight">{report.environment.storageUsage?.percentage}%</span>
              <span className="text-[10px] text-slate-400 font-bold mb-1 uppercase tracking-tighter">{report.environment.storageUsage?.used}KB / 5MB</span>
           </div>
           <div className="w-full h-1 bg-slate-100 dark:bg-slate-800 rounded-full mt-3 overflow-hidden">
              <div className="h-full bg-indigo-500" style={{ width: `${report.environment.storageUsage?.percentage}%` }}></div>
           </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-[3rem] border dark:border-slate-800 p-10">
         <h3 className="text-xl font-black italic uppercase mb-8 border-b dark:border-slate-800 pb-4">Módulos do Sistema</h3>
         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {report.modules.map(mod => (
              <div key={mod.name} className="flex flex-col gap-2">
                 <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black uppercase tracking-widest">{mod.name.replace('_', ' ')}</span>
                    <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${mod.status === 'healthy' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                      {mod.status}
                    </span>
                 </div>
                 <div className="text-xs font-bold text-slate-400">Latência: {mod.latency}ms</div>
                 <div className="text-[9px] opacity-60 italic">{mod.lastTestMessage || 'Módulo operacional'}</div>
              </div>
            ))}
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
         <div className="bg-white dark:bg-slate-900 p-8 rounded-[3rem] border dark:border-slate-800">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-6">Logs Recentes</h3>
            <div className="space-y-4 max-h-[300px] overflow-y-auto pr-4 no-scrollbar">
               {systemMonitor.getLogs().map(log => (
                 <div key={log.id} className="text-[10px] flex gap-3 items-start border-l-2 border-slate-100 dark:border-slate-800 pl-4 py-1">
                    <span className="font-mono opacity-30 shrink-0">{new Date(log.timestamp).toLocaleTimeString()}</span>
                    <span className={`font-black uppercase shrink-0 ${log.level === 'error' ? 'text-red-500' : 'text-blue-500'}`}>{log.level}</span>
                    <span className="font-medium text-slate-600 dark:text-slate-300">{log.message}</span>
                 </div>
               ))}
            </div>
         </div>
         
         <div className="bg-white dark:bg-slate-900 p-8 rounded-[3rem] border dark:border-slate-800">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-6">Correções Automáticas</h3>
            <div className="space-y-4">
               {report.recentHeals.length === 0 ? (
                 <p className="text-[10px] text-slate-400 italic">Nenhuma ação corretiva disparada.</p>
               ) : (
                 report.recentHeals.map(heal => (
                   <div key={heal.id} className="p-4 bg-blue-50 dark:bg-blue-900/10 rounded-2xl border border-blue-100 dark:border-blue-800/20">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[9px] font-black text-blue-600 uppercase">{heal.module}</span>
                        <span className="text-[8px] font-mono opacity-40">{new Date(heal.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <p className="text-xs font-bold">{heal.action}</p>
                      <p className="text-[10px] text-slate-500 mt-1 italic">{heal.resultMessage}</p>
                   </div>
                 ))
               )}
            </div>
         </div>
      </div>
    </div>
  );
};
