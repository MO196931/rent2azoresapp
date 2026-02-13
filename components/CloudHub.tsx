
import React, { useState } from 'react';
import { db } from '../services/mockDatabase';

interface CloudHubProps {
  t: (key: string) => string;
}

export const CloudHub: React.FC<CloudHubProps> = ({ t }) => {
  const cloud = db.getCloudConfig();
  const [clientId, setClientId] = useState(cloud.clientId || '');

  const saveConfig = () => {
    db.saveCloudConfig({ clientId });
    window.location.reload(); // Refresh to load GAPI with new ID
  };

  const services = [
    {
      name: "Google Sheets",
      label: t('openSheets'),
      url: cloud.spreadsheetId ? `https://docs.google.com/spreadsheets/d/${cloud.spreadsheetId}` : null,
      color: "bg-green-600",
      icon: "📊",
      desc: cloud.spreadsheetId ? "Folha de Cálculo Ativa" : "Pendente de Criação (Fale com Agente)"
    },
    {
      name: "Google Calendar",
      label: t('openCalendar'),
      url: cloud.calendarId ? `https://calendar.google.com/calendar/u/0/r` : null,
      color: "bg-blue-600",
      icon: "📅",
      desc: cloud.calendarId ? "Calendário de Reservas OK" : "Pendente de Criação"
    }
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-black tracking-tighter">{t('cloudHub')}</h2>
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${cloud.spreadsheetId ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
            {cloud.spreadsheetId ? t('cloudSync') : "Sincronização Desativada"}
          </p>
        </div>
      </div>

      <div className="p-8 bg-slate-100 dark:bg-slate-800 rounded-[2.5rem] border dark:border-slate-700">
         <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Configuração Técnica (Obrigatório)</p>
         <div className="flex gap-4">
            <input 
              type="text" 
              placeholder="Google Client ID" 
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="flex-1 bg-white dark:bg-slate-900 p-4 rounded-xl text-xs font-mono outline-none border-2 border-transparent focus:border-blue-600 transition-all"
            />
            <button onClick={saveConfig} className="bg-slate-900 text-white px-6 py-4 rounded-xl font-black text-[10px] uppercase">Salvar</button>
         </div>
         <p className="text-[8px] text-slate-400 mt-2 italic">Obtenha o ID em console.cloud.google.com</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {services.map((service) => (
          <div
            key={service.name}
            className={`group relative bg-white dark:bg-slate-900 rounded-[2.5rem] border dark:border-slate-800 p-8 transition-all ${service.url ? 'hover:border-blue-500 hover:shadow-xl' : 'opacity-60 grayscale'}`}
          >
            <div className="flex items-start gap-6 relative z-10">
              <div className={`w-16 h-16 ${service.color} rounded-2xl flex items-center justify-center text-3xl shadow-lg`}>
                {service.icon}
              </div>
              <div className="flex-1">
                <h3 className="font-black text-lg mb-1">{service.name}</h3>
                <p className="text-xs text-slate-400 font-medium mb-4">{service.desc}</p>
                {service.url ? (
                  <a href={service.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-blue-600 font-black text-[10px] uppercase tracking-wider hover:translate-x-2 transition-transform">
                    {service.label} <span>→</span>
                  </a>
                ) : (
                  <span className="text-[9px] font-black text-slate-300 uppercase italic">Aguardando Assistente...</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
