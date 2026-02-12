
import React from 'react';
import { db } from '../services/mockDatabase';

interface CloudHubProps {
  t: (key: string) => string;
}

export const CloudHub: React.FC<CloudHubProps> = ({ t }) => {
  const settings = db.getCompany();
  
  // IDs fictícios que seriam configurados no setup real da empresa
  const spreadsheetId = "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms";
  const calendarId = "primary";
  const driveFolderId = "1u_Y8u0S8Xh-8rYlE-I_V2gYF9p0T6OaB";

  const services = [
    {
      name: "Google Sheets",
      label: t('openSheets'),
      url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
      color: "bg-green-600",
      icon: "📊",
      desc: "Base de Dados de Clientes e Reservas"
    },
    {
      name: "Google Calendar",
      label: t('openCalendar'),
      url: `https://calendar.google.com/calendar/u/0/r`,
      color: "bg-blue-600",
      icon: "📅",
      desc: "Gestão de Entregas e Devoluções"
    },
    {
      name: "Google Drive",
      label: t('openDrive'),
      url: `https://drive.google.com/drive/u/0/folders/${driveFolderId}`,
      color: "bg-amber-500",
      icon: "📂",
      desc: "Contratos PDF Assinados e Documentos"
    },
    {
      name: "Google Docs",
      label: t('openDocs'),
      url: "https://docs.google.com/document/u/0/",
      color: "bg-blue-400",
      icon: "📄",
      desc: "Modelos de Termos e Condições"
    }
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-700">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-black tracking-tighter">{t('cloudHub')}</h2>
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            {t('cloudSync')}
          </p>
        </div>
        <div className="text-[10px] font-mono bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full border dark:border-slate-700">
          ENV: PRODUCTION
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {services.map((service) => (
          <a
            key={service.name}
            href={service.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative bg-white dark:bg-slate-900 rounded-[2.5rem] border dark:border-slate-800 p-8 transition-all hover:border-blue-500/50 hover:shadow-2xl hover:shadow-blue-500/10 active:scale-95 overflow-hidden"
          >
            <div className={`absolute top-0 right-0 w-32 h-32 ${service.color} opacity-[0.03] rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-700`}></div>
            
            <div className="flex items-start gap-6 relative z-10">
              <div className={`w-16 h-16 ${service.color} rounded-2xl flex items-center justify-center text-3xl shadow-lg shadow-${service.color}/20 group-hover:rotate-6 transition-transform`}>
                {service.icon}
              </div>
              <div className="flex-1">
                <h3 className="font-black text-lg mb-1">{service.name}</h3>
                <p className="text-xs text-slate-400 font-medium mb-4">{service.desc}</p>
                <div className="inline-flex items-center gap-2 text-blue-600 font-black text-[10px] uppercase tracking-wider group-hover:translate-x-2 transition-transform">
                  {service.label} <span>→</span>
                </div>
              </div>
            </div>
          </a>
        ))}
      </div>

      <div className="bg-slate-900 text-white p-10 rounded-[3rem] border border-white/10 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10 text-6xl">🤖</div>
        <h4 className="font-black text-xl mb-4 italic">"I've optimized the directory structure in your Google Drive. All July contracts are now in the '2024/July' subfolder."</h4>
        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">— Admin AI Assistant</p>
      </div>
    </div>
  );
};
