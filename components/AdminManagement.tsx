import React, { useState, useEffect } from 'react';
import { db } from '../services/mockDatabase';
import { CarDetails, ReservationData, ServiceItem, MaintenanceRecord, AppPhase, CompanySettings, DriverRole } from '../types';
import { CloudHub } from './CloudHub';
import { DiagnosticDashboard } from './DiagnosticDashboard';
import CameraCapture from './CameraCapture';
import { analyzeRegistrationCertificate } from '../services/geminiService';

interface AdminManagementProps {
  onBack: () => void;
  lang: string;
  initialAutoScan?: boolean;
}

type AdminTab = 'overview' | 'reservations' | 'fleet' | 'roles' | 'services' | 'settings' | 'system';

const StatCard = ({ label, value, icon, color }: { label: string; value: string | number; icon: string; color: string }) => (
  <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border-2 border-slate-300 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
    <div className="flex justify-between items-start mb-4">
      <div className={`w-12 h-12 rounded-2xl bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-2xl`}>
        {icon}
      </div>
      <div className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest bg-slate-300 dark:bg-slate-700 text-slate-900 dark:text-slate-100`}>
        Live
      </div>
    </div>
    <p className="text-[10px] font-black text-slate-950 dark:text-slate-100 uppercase tracking-widest mb-1">{label}</p>
    <p className={`text-4xl font-black tracking-tighter ${color}`}>{value}</p>
  </div>
);

const InputField = ({ label, value, onChange, type = 'text', placeholder = '' }: { label: string; value: string | number; onChange: (v: string) => void; type?: string; placeholder?: string }) => (
  <div className="space-y-1 w-full text-left">
    <label className="text-[10px] font-black uppercase text-slate-950 dark:text-slate-100 ml-4 tracking-widest">{label}</label>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full p-5 rounded-2xl bg-white dark:bg-slate-800 border-2 border-slate-500 dark:border-slate-700 focus:border-blue-700 dark:focus:border-blue-500 transition-all font-bold outline-none text-slate-950 dark:text-white shadow-sm"
    />
  </div>
);

const TextAreaField = ({ label, value, onChange, placeholder = '' }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) => (
  <div className="space-y-1 w-full text-left">
    <label className="text-[10px] font-black uppercase text-slate-950 dark:text-slate-100 ml-4 tracking-widest">{label}</label>
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={3}
      className="w-full p-5 rounded-2xl bg-white dark:bg-slate-800 border-2 border-slate-500 dark:border-slate-700 focus:border-blue-700 dark:focus:border-blue-500 transition-all font-bold outline-none text-slate-950 dark:text-white resize-none shadow-sm"
    />
  </div>
);

const ToggleField = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
  <button 
    type="button"
    onClick={() => onChange(!checked)}
    className="flex items-center justify-between w-full p-5 bg-white dark:bg-slate-800 rounded-2xl border-2 border-slate-400 dark:border-slate-700 hover:border-blue-700 transition-all shadow-sm"
  >
    <span className="text-xs font-black uppercase tracking-widest text-slate-950 dark:text-slate-100">{label}</span>
    <div className={`w-12 h-6 rounded-full transition-colors relative ${checked ? 'bg-blue-700' : 'bg-slate-500 dark:bg-slate-600'}`}>
       <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${checked ? 'translate-x-7' : 'translate-x-1'}`}></div>
    </div>
  </button>
);

export const AdminManagement: React.FC<AdminManagementProps> = ({ onBack, lang, initialAutoScan = false }) => {
  const [activeTab, setActiveTab] = useState<AdminTab>(initialAutoScan ? 'system' : 'overview');
  const [fleet, setFleet] = useState<CarDetails[]>([]);
  const [reservations, setReservations] = useState<ReservationData[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [roles, setRoles] = useState<DriverRole[]>([]);
  const [company, setCompany] = useState<CompanySettings>(db.getCompany());
  
  const [editingCar, setEditingCar] = useState<Partial<CarDetails> | null>(null);
  const [editingService, setEditingService] = useState<Partial<ServiceItem> | null>(null);
  const [editingRole, setEditingRole] = useState<Partial<DriverRole> | null>(null);
  const [maintenanceCar, setMaintenanceCar] = useState<CarDetails | null>(null);
  const [editingMaintenance, setEditingMaintenance] = useState<Partial<MaintenanceRecord> | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setFleet(db.getFleet() || []);
    setReservations(db.getReservations() || []);
    setServices(db.getServices() || []);
    setCompany(db.getCompany());
    setRoles(db.getRoles() || []);
  };

  const handleOcr = async (base64: string) => {
    setOcrLoading(true);
    try {
      const cleanBase64 = base64.includes(',') ? base64.split(',')[1] : base64;
      const data = await analyzeRegistrationCertificate(cleanBase64);
      if (data) {
        setEditingCar(prev => ({ ...prev, ...data }));
      }
    } catch (e) {
      console.error("OCR Failed", e);
    } finally {
      setOcrLoading(false);
    }
  };

  const saveCar = () => {
    if (editingCar) {
      db.saveCar(editingCar as CarDetails);
      setEditingCar(null);
      loadData();
    }
  };

  const saveService = () => {
    if (editingService) {
      db.saveService(editingService as ServiceItem);
      setEditingService(null);
      loadData();
    }
  };

  const saveRole = () => {
    if (editingRole) {
      db.saveRole(editingRole as DriverRole);
      setEditingRole(null);
      loadData();
    }
  };

  const tabs: {id: AdminTab, label: string, icon: string}[] = [
    { id: 'overview', label: 'Painel', icon: '📊' },
    { id: 'reservations', label: 'Reservas', icon: '📅' },
    { id: 'fleet', label: 'Frota', icon: '🚗' },
    { id: 'roles', label: 'Papéis', icon: '👤' },
    { id: 'services', label: 'Serviços', icon: '🛡️' },
    { id: 'settings', label: 'Definições', icon: '⚙️' },
    { id: 'system', label: 'Saúde', icon: '🩺' }
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white flex flex-col font-sans overflow-x-hidden">
      {/* SIDEBAR / MOBILE NAV */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t-2 border-slate-300 dark:border-slate-800 p-2 flex justify-around items-center z-[80] md:top-0 md:bottom-auto md:flex-col md:w-24 md:h-screen md:border-t-0 md:border-r-2">
        <button onClick={onBack} className="hidden md:flex p-4 text-blue-800 mb-8 font-black text-2xl">AR</button>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex flex-col items-center gap-1 p-3 rounded-2xl transition-all ${activeTab === tab.id ? 'bg-blue-700 text-white shadow-lg' : 'text-slate-700 dark:text-slate-400 hover:bg-slate-300 dark:hover:bg-slate-800'}`}
          >
            <span className="text-xl">{tab.icon}</span>
            <span className="text-[8px] font-black uppercase tracking-widest md:hidden">{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 md:ml-24 p-6 md:p-12 pb-24 md:pb-12">
        <header className="flex justify-between items-center mb-12">
           <h1 className="text-5xl font-black tracking-tighter italic uppercase text-slate-950 dark:text-white">{tabs.find(t => t.id === activeTab)?.label}</h1>
           <div className="flex items-center gap-4">
              <span className="px-4 py-2 bg-green-100 dark:bg-green-900/40 text-green-900 dark:text-green-400 rounded-full text-[10px] font-black uppercase tracking-widest border-2 border-green-300 dark:border-green-800">Sincronizado</span>
              <img src={company.logoUrl} alt="Company Logo" className="w-10 h-10 rounded-xl object-contain bg-white p-1 shadow-sm border-2 border-slate-300" />
           </div>
        </header>

        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-in fade-in">
             <StatCard label="Frota Total" value={fleet.length} icon="🚗" color="text-slate-950 dark:text-white" />
             <StatCard label="Reservas Ativas" value={reservations.filter(r => r.status === 'confirmed').length} icon="📅" color="text-blue-800" />
             <StatCard label="Disponibilidade" value={`${Math.round((fleet.filter(c => c.status === 'available').length / (fleet.length || 1)) * 100)}%`} icon="🔋" color="text-green-800 dark:text-green-400" />
             <StatCard label="Faturação Mensal" value="12.450€" icon="💶" color="text-indigo-800 dark:text-indigo-400" />
          </div>
        )}

        {activeTab === 'reservations' && (
          <div className="bg-white dark:bg-slate-900 rounded-[3rem] p-8 border-2 border-slate-300 dark:border-slate-800 overflow-x-auto animate-in slide-in-from-bottom-6 shadow-sm">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b-2 border-slate-300 dark:border-slate-800">
                  <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-950 dark:text-slate-200">Cliente</th>
                  <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-950 dark:text-slate-200">Datas & Horas</th>
                  <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-950 dark:text-slate-200">Viatura</th>
                  <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-950 dark:text-slate-200">Estado</th>
                </tr>
              </thead>
              <tbody>
                {(reservations || []).map(res => (
                  <tr key={res.id} className="border-b border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                    <td className="p-4">
                      <p className="font-bold text-slate-950 dark:text-slate-100">{res.mainDriver.name}</p>
                      <p className="text-[10px] text-slate-900 dark:text-slate-300 font-bold uppercase">{res.mainDriver.email}</p>
                    </td>
                    <td className="p-4">
                      <p className="text-xs font-bold text-slate-950 dark:text-slate-200">{res.startDate} {res.startTime} → {res.endDate} {res.endTime}</p>
                      <p className="text-[10px] text-slate-700 dark:text-slate-400 font-black uppercase tracking-tighter">Reserva Efetuada</p>
                    </td>
                    <td className="p-4">
                       <span className="bg-slate-200 dark:bg-slate-800 px-3 py-1 rounded-full text-[10px] font-black font-mono tracking-tight text-slate-950 dark:text-slate-100 border-2 border-slate-400 dark:border-slate-700">{res.selectedCarId}</span>
                    </td>
                    <td className="p-4">
                       <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${res.status === 'confirmed' ? 'bg-green-100 text-green-900 border-2 border-green-400' : 'bg-slate-200 text-slate-800 border-2 border-slate-400'}`}>
                         {res.status}
                       </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'fleet' && (
          <div className="space-y-8 animate-in fade-in">
            <div className="flex justify-between items-center">
               <p className="text-slate-950 dark:text-slate-200 text-xs font-black uppercase tracking-[0.2em]">{fleet.length} Viaturas Ativas</p>
               <button 
                onClick={() => setEditingCar({ status: 'available', currentOdometer: 0, fuelLevel: '100%' })}
                className="bg-blue-700 text-white px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl hover:bg-blue-800 transition-all"
               >
                 Adicionar Viatura
               </button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
               {(fleet || []).map(car => (
                 <div key={car.id} className="bg-white dark:bg-slate-900 rounded-[3rem] border-2 border-slate-300 dark:border-slate-800 p-8 flex gap-8 group hover:border-blue-700 transition-all shadow-sm">
                    <img src={car.image} className="w-32 h-32 rounded-[2rem] object-cover shadow-2xl border-2 border-slate-200 dark:border-slate-800" alt={car.model} />
                    <div className="flex-1">
                       <div className="flex justify-between items-start mb-2">
                          <h3 className="text-2xl font-black tracking-tighter leading-tight text-slate-950 dark:text-white">{car.brand} {car.model}</h3>
                          <span className="font-mono text-[10px] font-black bg-slate-200 dark:bg-slate-800 text-slate-950 dark:text-slate-100 px-2 py-1 rounded-md border-2 border-slate-400 dark:border-slate-700">{car.licensePlate}</span>
                       </div>
                       <div className="flex gap-2 mb-6">
                          <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${car.status === 'available' ? 'bg-green-100 text-green-900 border-2 border-green-400' : 'bg-red-100 text-red-900 border-2 border-red-400'}`}>
                            {car.status}
                          </span>
                       </div>
                       <div className="flex gap-4">
                          <button onClick={() => setEditingCar(car)} className="flex-1 py-3 bg-slate-200 dark:bg-slate-800 text-slate-950 dark:text-slate-100 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 hover:text-white transition-all border-2 border-slate-400 dark:border-slate-700">Editar</button>
                       </div>
                    </div>
                 </div>
               ))}
            </div>
          </div>
        )}

        {activeTab === 'roles' && (
           <div className="space-y-6 animate-in fade-in">
              <p className="text-slate-950 dark:text-slate-200 text-xs font-black uppercase tracking-[0.2em]">Configuração de Perfis</p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                 {(roles || []).map(role => (
                   <div key={role.id} className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border-2 border-slate-300 dark:border-slate-800 flex flex-col shadow-sm">
                      <h4 className="text-xl font-black mb-2 text-slate-950 dark:text-white">{role.label}</h4>
                      <p className="text-xs text-slate-900 dark:text-slate-200 font-bold mb-6 flex-1 leading-relaxed">{role.description}</p>
                      <div className="flex gap-2 pt-6 border-t-2 border-slate-200 dark:border-slate-800">
                         <button onClick={() => setEditingRole(role)} className="flex-1 text-[9px] font-black uppercase py-2 bg-slate-200 dark:bg-slate-800 text-slate-950 dark:text-slate-100 rounded-lg hover:bg-slate-300 transition-colors border-2 border-slate-400 dark:border-slate-700">Editar</button>
                      </div>
                   </div>
                 ))}
              </div>
           </div>
        )}

        {activeTab === 'services' && (
          <div className="space-y-6 animate-in fade-in">
            <h3 className="text-xl font-black tracking-tight italic text-slate-950 dark:text-white">Serviços & Proteções</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {(services || []).map(service => (
                <div key={service.id} className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border-2 border-slate-300 dark:border-slate-800 relative group shadow-sm">
                  <h4 className="font-black text-lg mb-1 text-slate-950 dark:text-white">{service.name}</h4>
                  <p className="text-[10px] text-blue-800 dark:text-blue-400 font-black uppercase mb-4">{service.price}€ / {service.priceModel === 'daily' ? 'DIA' : 'FIXO'}</p>
                  <p className="text-xs text-slate-900 dark:text-slate-200 font-bold mb-6">{service.description}</p>
                  <button onClick={() => setEditingService(service)} className="w-full py-3 bg-slate-200 dark:bg-slate-800 text-slate-950 dark:text-slate-100 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 hover:text-white transition-all border-2 border-slate-400 dark:border-slate-700">Configurar</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="max-w-2xl bg-white dark:bg-slate-900 p-12 rounded-[3.5rem] border-2 border-slate-400 dark:border-slate-800 animate-in zoom-in-95 shadow-sm">
             <div className="space-y-6">
                <InputField label="Nome Comercial" value={company.name} onChange={v => setCompany({...company, name: v})} />
                <InputField label="Email Corporativo" value={company.email} onChange={v => setCompany({...company, email: v})} />
                <InputField label="Endereço Sede" value={company.address} onChange={v => setCompany({...company, address: v})} />
                <InputField label="NIF / VAT" value={company.nif} onChange={v => setCompany({...company, nif: v})} />
                <button 
                  onClick={() => { db.saveCompany(company); alert("Configurações atualizadas!"); }}
                  className="w-full py-6 bg-blue-700 text-white rounded-[2rem] font-black text-[10px] uppercase tracking-[0.3em] mt-8 hover:bg-blue-800 transition-all shadow-xl"
                >
                  Confirmar Alterações
                </button>
             </div>
          </div>
        )}

        {activeTab === 'system' && <DiagnosticDashboard autoStart={initialAutoScan} />}
      </div>

      {/* MODAL: EDIT CAR */}
      {editingCar && (
        <div className="fixed inset-0 z-[150] bg-slate-950/95 backdrop-blur-xl flex items-center justify-center p-6">
          <div className="bg-white dark:bg-slate-900 w-full max-w-4xl rounded-[4rem] p-12 shadow-2xl relative max-h-[90vh] overflow-y-auto no-scrollbar border-2 border-slate-400 dark:border-slate-800">
             <div className="flex justify-between items-center mb-12">
               <h3 className="text-4xl font-black italic tracking-tighter uppercase text-slate-950 dark:text-white">{editingCar.id ? 'Ficha Técnica' : 'Nova Viatura'}</h3>
               <button onClick={() => setEditingCar(null)} className="p-4 bg-slate-300 dark:bg-slate-800 rounded-full text-xs text-slate-950 dark:text-white hover:bg-slate-400">✕</button>
             </div>
             
             <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
               <div className="space-y-6">
                  <CameraCapture label="Scan Livrete (OCR)" onCapture={(base64) => handleOcr(base64)} />
                  <InputField label="Marca" value={editingCar.brand || ''} onChange={v => setEditingCar({...editingCar, brand: v})} />
                  <InputField label="Modelo" value={editingCar.model || ''} onChange={v => setEditingCar({...editingCar, model: v})} />
                  <InputField label="Matrícula" value={editingCar.licensePlate || ''} onChange={v => setEditingCar({...editingCar, licensePlate: v})} />
               </div>
               <div className="space-y-6">
                  <InputField label="VIN (Chassi)" value={editingCar.vin || ''} onChange={v => setEditingCar({...editingCar, vin: v})} />
                  <InputField label="Preço / Dia" value={editingCar.price || ''} onChange={v => setEditingCar({...editingCar, price: v})} />
                  <div className="pt-6">
                    <button onClick={saveCar} className="w-full py-6 bg-blue-700 text-white rounded-[2rem] font-black text-[10px] uppercase tracking-widest shadow-xl hover:bg-blue-800">Guardar Viatura</button>
                  </div>
               </div>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};
