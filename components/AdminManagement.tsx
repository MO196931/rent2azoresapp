
import React, { useState, useEffect } from 'react';
import { db } from '../services/mockDatabase';
import { CarDetails, ReservationData, ServiceItem, MaintenanceRecord, AppPhase } from '../types';
import { CloudHub } from './CloudHub';
import { DiagnosticDashboard } from './DiagnosticDashboard';
import CameraCapture from './CameraCapture';
import { analyzeRegistrationCertificate } from '../services/geminiService';

interface AdminManagementProps {
  onBack: () => void;
  lang: string;
}

type AdminTab = 'overview' | 'reservations' | 'fleet' | 'services' | 'system';

export const AdminManagement: React.FC<AdminManagementProps> = ({ onBack, lang }) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [fleet, setFleet] = useState<CarDetails[]>([]);
  const [reservations, setReservations] = useState<ReservationData[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  
  // Modals / Editors
  const [editingCar, setEditingCar] = useState<Partial<CarDetails> | null>(null);
  const [editingService, setEditingService] = useState<Partial<ServiceItem> | null>(null);
  const [maintenanceCar, setMaintenanceCar] = useState<CarDetails | null>(null);
  const [editingMaintenance, setEditingMaintenance] = useState<Partial<MaintenanceRecord> | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);

  const loadData = () => {
    setFleet(db.getFleet());
    setReservations(db.getReservations());
    setServices(db.getServices());
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveCar = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingCar) {
      db.saveCar(editingCar as CarDetails);
      setEditingCar(null);
      loadData();
    }
  };

  const handleSaveService = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingService) {
      db.saveService(editingService as ServiceItem);
      setEditingService(null);
      loadData();
    }
  };

  const handleSaveMaintenance = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingMaintenance && maintenanceCar) {
      db.saveMaintenance({ ...editingMaintenance, carId: maintenanceCar.id } as MaintenanceRecord);
      setEditingMaintenance(null);
      loadData();
    }
  };

  const handleOcr = async (front: string, back?: string) => {
    setOcrLoading(true);
    const data = await analyzeRegistrationCertificate(front.split(',')[1], back?.split(',')[1]);
    if (data) {
      setEditingCar(prev => ({ ...prev, ...data }));
    }
    setOcrLoading(false);
  };

  const stats = {
    totalRevenue: reservations.filter(r => r.status === 'confirmed' || r.status === 'completed').length * 150,
    activeRentals: reservations.filter(r => r.status === 'confirmed').length,
    fleetReady: fleet.filter(c => c.status === 'available').length,
    pendingMaintenance: fleet.filter(c => c.status === 'maintenance').length
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-10 animate-in fade-in duration-500 overflow-y-auto no-scrollbar">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12">
        <div>
          <h1 className="text-4xl font-black tracking-tighter text-slate-900 dark:text-white">Admin Hub Elite</h1>
          <p className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.3em]">Fleet & Logistics Management</p>
        </div>
        <button onClick={onBack} className="bg-slate-900 text-white px-8 py-3 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-black active:scale-95 transition-all">
          Exit Panel
        </button>
      </header>

      {/* TABS NAVIGATION */}
      <nav className="flex gap-2 p-1.5 bg-slate-200/50 dark:bg-slate-900/50 rounded-[2rem] w-fit mb-10 overflow-x-auto no-scrollbar">
        {(['overview', 'reservations', 'fleet', 'services', 'system'] as AdminTab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-8 py-4 rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-white dark:bg-slate-800 text-blue-600 shadow-xl' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
          >
            {tab}
          </button>
        ))}
      </nav>

      <main className="pb-20">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-in slide-in-from-bottom-4 duration-500">
            <StatCard label="Estimated Revenue" value={`${stats.totalRevenue}€`} icon="💰" color="text-green-600" />
            <StatCard label="Active Rentals" value={stats.activeRentals} icon="🚗" color="text-blue-600" />
            <StatCard label="Available Fleet" value={stats.fleetReady} icon="✅" color="text-blue-500" />
            <StatCard label="Maintenance Needed" value={stats.pendingMaintenance} icon="🔧" color="text-amber-500" />
            
            <div className="lg:col-span-4 grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                <div className="bg-white dark:bg-slate-900 p-8 rounded-[3rem] shadow-sm border dark:border-slate-800">
                   <h3 className="font-black text-xs uppercase tracking-widest mb-6">Recent Fleet Activity</h3>
                   <div className="space-y-4">
                     {db.getMaintenance().slice(-4).reverse().map(m => (
                         <div key={m.id} className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl">
                             <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-xl flex items-center justify-center text-xl">🔧</div>
                             <div className="flex-1">
                                <p className="font-bold text-sm">{m.type} - {fleet.find(c => c.id === m.carId)?.brand} {fleet.find(c => c.id === m.carId)?.model}</p>
                                <p className="text-[10px] text-slate-400">{m.date} • {m.description}</p>
                             </div>
                             <span className="text-sm font-black text-amber-600">-{m.cost}€</span>
                         </div>
                     ))}
                   </div>
                </div>
                <CloudHub t={(k) => k} />
            </div>
          </div>
        )}

        {activeTab === 'fleet' && (
          <div className="space-y-10 animate-in slide-in-from-right-4 duration-500">
            <div className="flex justify-between items-end">
               <div>
                  <h3 className="text-2xl font-black tracking-tighter">Fleet Inventory</h3>
                  <p className="text-slate-400 text-[10px] font-bold uppercase">Manage vehicles and run OCR diagnostics</p>
               </div>
               <button onClick={() => setEditingCar({ status: 'available', currentOdometer: 0, fuelLevel: '100%' })} className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-blue-700 shadow-lg shadow-blue-500/20 active:scale-95 transition-all">
                  + Add Vehicle (OCR)
               </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {fleet.map(car => (
                <div key={car.id} className="bg-white dark:bg-slate-900 rounded-[3rem] shadow-sm border dark:border-slate-800 overflow-hidden group hover:border-blue-500 transition-all flex flex-col">
                  <div className="relative h-56 overflow-hidden">
                     <img src={car.image || 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&q=80&w=600'} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000" alt={car.model} />
                     <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
                     <div className="absolute bottom-6 left-6 text-white">
                        <p className="font-black text-2xl tracking-tighter leading-none">{car.brand} {car.model}</p>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80 mt-1">{car.licensePlate}</p>
                     </div>
                     <div className={`absolute top-6 right-6 px-4 py-1 rounded-full text-[9px] font-black uppercase shadow-xl ${car.status === 'available' ? 'bg-green-500 text-white' : car.status === 'maintenance' ? 'bg-amber-500 text-white' : 'bg-blue-500 text-white'}`}>
                       {car.status}
                     </div>
                  </div>
                  <div className="p-8 flex-1 flex flex-col justify-between space-y-6">
                    <div className="grid grid-cols-2 gap-4 text-[10px] font-black uppercase tracking-widest text-slate-400">
                       <div className="space-y-1">
                           <p>Odometer</p>
                           <p className="text-slate-900 dark:text-white text-sm">{car.currentOdometer} KM</p>
                       </div>
                       <div className="space-y-1">
                           <p>Fuel Level</p>
                           <p className="text-slate-900 dark:text-white text-sm">{car.fuelLevel}</p>
                       </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                       <button onClick={() => setEditingCar(car)} className="py-3 bg-slate-100 dark:bg-slate-800 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all">Edit Info</button>
                       <button onClick={() => setMaintenanceCar(car)} className="py-3 bg-amber-100 text-amber-600 dark:bg-amber-900/30 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-amber-600 hover:text-white transition-all">Logs</button>
                       <button onClick={() => { if(confirm("Delete this vehicle?")) { db.deleteCar(car.id); loadData(); } }} className="col-span-2 py-3 text-red-500 font-black text-[10px] uppercase tracking-widest hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors rounded-xl border border-red-100 dark:border-red-900/20">Remove from Fleet</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'services' && (
          <div className="space-y-12 animate-in slide-in-from-right-4 duration-500">
            <div className="flex justify-between items-end">
               <div>
                  <h3 className="text-2xl font-black tracking-tighter">Services & Insurance</h3>
                  <p className="text-slate-400 text-[10px] font-bold uppercase">Pricing models and product catalog</p>
               </div>
               <button onClick={() => setEditingService({ type: 'extra', priceModel: 'daily', price: 0 })} className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95 transition-all">
                  + Add New Item
               </button>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* INSURANCE TABLE */}
                <div className="bg-white dark:bg-slate-900 rounded-[3rem] border dark:border-slate-800 overflow-hidden shadow-sm">
                  <div className="p-8 border-b dark:border-slate-800 flex justify-between items-center bg-blue-50/50 dark:bg-blue-900/10">
                    <h3 className="font-black text-xs uppercase tracking-widest text-blue-600">Insurance Policies</h3>
                  </div>
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 dark:bg-slate-800/50 border-b dark:border-slate-800">
                      <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        <th className="px-8 py-4">Coverage</th>
                        <th className="px-8 py-4">Price</th>
                        <th className="px-8 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y dark:divide-slate-800">
                      {services.filter(s => s.type === 'insurance').map(srv => (
                        <tr key={srv.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                          <td className="px-8 py-6">
                            <p className="font-bold text-sm text-slate-900 dark:text-white">{srv.name}</p>
                            <p className="text-[10px] text-slate-400 max-w-xs">{srv.description}</p>
                          </td>
                          <td className="px-8 py-6">
                            <p className="font-black text-blue-600">{srv.price}€</p>
                            <p className="text-[9px] font-black uppercase text-slate-400">{srv.priceModel}</p>
                          </td>
                          <td className="px-8 py-6 text-right">
                            <div className="flex gap-2 justify-end">
                               <button onClick={() => setEditingService(srv)} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-blue-600 hover:text-white transition-all text-xs">✎</button>
                               <button onClick={() => { if(confirm("Delete this insurance?")) { db.deleteService(srv.id); loadData(); } }} className="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-600 hover:text-white transition-all text-xs">✕</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* EXTRAS TABLE */}
                <div className="bg-white dark:bg-slate-900 rounded-[3rem] border dark:border-slate-800 overflow-hidden shadow-sm">
                  <div className="p-8 border-b dark:border-slate-800 flex justify-between items-center bg-green-50/50 dark:bg-green-900/10">
                    <h3 className="font-black text-xs uppercase tracking-widest text-green-600">Extras & Fees</h3>
                  </div>
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 dark:bg-slate-800/50 border-b dark:border-slate-800">
                      <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        <th className="px-8 py-4">Service</th>
                        <th className="px-8 py-4">Price</th>
                        <th className="px-8 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y dark:divide-slate-800">
                      {services.filter(s => s.type !== 'insurance').map(srv => (
                        <tr key={srv.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                          <td className="px-8 py-6">
                            <p className="font-bold text-sm text-slate-900 dark:text-white">{srv.name}</p>
                            <p className="text-[10px] text-slate-400">{srv.description}</p>
                          </td>
                          <td className="px-8 py-6">
                            <p className="font-black text-green-600">{srv.price}€</p>
                            <p className="text-[9px] font-black uppercase text-slate-400">{srv.priceModel}</p>
                          </td>
                          <td className="px-8 py-6 text-right">
                            <div className="flex gap-2 justify-end">
                               <button onClick={() => setEditingService(srv)} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-blue-600 hover:text-white transition-all text-xs">✎</button>
                               <button onClick={() => { if(confirm("Delete this service?")) { db.deleteService(srv.id); loadData(); } }} className="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-600 hover:text-white transition-all text-xs">✕</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
            </div>
          </div>
        )}

        {activeTab === 'reservations' && (
          <div className="bg-white dark:bg-slate-900 rounded-[3rem] shadow-sm border dark:border-slate-800 overflow-hidden animate-in slide-in-from-right-4 duration-500">
            <div className="p-8 border-b dark:border-slate-800 flex justify-between items-center">
               <h3 className="font-black text-xs uppercase tracking-widest">Reservation Pipeline</h3>
               <span className="bg-blue-100 text-blue-600 dark:bg-blue-900/30 px-4 py-1.5 rounded-full text-[10px] font-black uppercase">{reservations.length} Active</span>
            </div>
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/50">
                  <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    <th className="px-8 py-4">Client / ID</th>
                    <th className="px-8 py-4">Car Details</th>
                    <th className="px-8 py-4">Dates</th>
                    <th className="px-8 py-4">Status</th>
                    <th className="px-8 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-slate-800">
                  {reservations.map(r => (
                    <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-8 py-6">
                        {/* Fix: Access r.mainDriver.name instead of r.driverName */}
                        <p className="font-bold text-sm text-slate-900 dark:text-white">{r.mainDriver.name}</p>
                        <p className="text-[10px] text-slate-400 font-mono">{r.id}</p>
                      </td>
                      <td className="px-8 py-6">
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                            {fleet.find(c => c.id === r.selectedCarId)?.brand} {fleet.find(c => c.id === r.selectedCarId)?.model || 'Pending Selection'}
                        </p>
                      </td>
                      <td className="px-8 py-6">
                        <p className="text-[10px] font-black uppercase text-slate-500">{r.startDate} to {r.endDate}</p>
                      </td>
                      <td className="px-8 py-6">
                         <span className={`px-4 py-1 rounded-full text-[9px] font-black uppercase ${r.status === 'confirmed' ? 'bg-green-100 text-green-600 dark:bg-green-900/30' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>
                            {r.status}
                         </span>
                      </td>
                      <td className="px-8 py-6 text-right">
                         <div className="flex gap-2 justify-end">
                            <button onClick={() => { db.updateReservationStatus(r.id!, 'confirmed'); loadData(); }} className="p-2 bg-green-100 text-green-600 rounded-lg hover:bg-green-600 hover:text-white transition-all text-xs">✓</button>
                            <button onClick={() => { db.updateReservationStatus(r.id!, 'cancelled'); loadData(); }} className="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-600 hover:text-white transition-all text-xs">✕</button>
                         </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'system' && <DiagnosticDashboard />}
      </main>

      {/* --- CAR EDITOR MODAL (OCR POWERED) --- */}
      {editingCar && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[110] flex items-center justify-center p-4 md:p-6 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 w-full max-w-5xl rounded-[3rem] p-8 md:p-12 shadow-2xl animate-in zoom-in duration-300 relative">
            <button onClick={() => setEditingCar(null)} className="absolute top-8 right-8 text-2xl opacity-50 hover:opacity-100 transition-opacity">✕</button>
            
            <div className="mb-10">
               <h4 className="text-4xl font-black tracking-tighter">Fleet Asset Manager</h4>
               <p className="text-slate-400 font-black uppercase text-[10px] tracking-[0.3em]">Vehicle Registration & Identity Diagnostic</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-12">
               {/* LEFT SIDE: OCR & MEDIA */}
               <div className="lg:col-span-2 space-y-8">
                  <div className="p-8 bg-blue-50/50 dark:bg-blue-900/10 rounded-[2.5rem] border border-dashed border-blue-200 dark:border-blue-800 text-center">
                     <p className="text-xs font-black uppercase tracking-widest text-blue-600 mb-6 flex items-center justify-center gap-2">
                         <span className="text-lg">🤖</span> AI Smart Scan
                     </p>
                     <div className="space-y-4">
                        <CameraCapture label="Registration Certificate (Front)" onCapture={(img) => handleOcr(img)} />
                        {ocrLoading && (
                            <div className="flex flex-col items-center gap-3 p-6 bg-blue-600 text-white rounded-2xl animate-pulse">
                                <span className="text-2xl animate-spin">⚙️</span>
                                <span className="text-[10px] font-black uppercase tracking-widest">Gemini Analyzing Document...</span>
                            </div>
                        )}
                        {!ocrLoading && (
                            <p className="text-[10px] text-slate-400 font-medium">Scan the document to auto-fill all technical specifications below.</p>
                        )}
                     </div>
                  </div>
                  <InputField label="Visual Identity (Image URL)" value={editingCar.image || ''} onChange={(v: string) => setEditingCar({...editingCar, image: v})} placeholder="External CDN link for the car image" />
               </div>

               {/* RIGHT SIDE: DATA FORM */}
               <form onSubmit={handleSaveCar} className="lg:col-span-3 space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                     <InputField label="Manufacturer / Brand" value={editingCar.brand || ''} onChange={(v: string) => setEditingCar({...editingCar, brand: v})} />
                     <InputField label="Vehicle Model" value={editingCar.model || ''} onChange={(v: string) => setEditingCar({...editingCar, model: v})} />
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                     <InputField label="License Plate" value={editingCar.licensePlate || ''} onChange={(v: string) => setEditingCar({...editingCar, licensePlate: v})} />
                     <InputField label="Chassis (VIN)" value={editingCar.vin || ''} onChange={(v: string) => setEditingCar({...editingCar, vin: v})} />
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                     <InputField label="Category / Segment" value={editingCar.category || ''} onChange={(v: string) => setEditingCar({...editingCar, category: v})} />
                     <InputField label="Daily Rate (€)" value={editingCar.price || ''} onChange={(v: string) => setEditingCar({...editingCar, price: v})} />
                  </div>
                  <InputField label="Technical Specifications" value={editingCar.specs || ''} onChange={(v: string) => setEditingCar({...editingCar, specs: v})} placeholder="e.g. Hybrid, Auto, 4x4, 5 Seats" />
                  
                  <div className="grid grid-cols-2 gap-6 pt-6">
                      <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase text-slate-400 ml-4">Deployment Status</label>
                          <select 
                            className="w-full p-5 rounded-2xl bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-blue-600 transition-all font-bold outline-none appearance-none"
                            value={editingCar.status}
                            onChange={(e) => setEditingCar({...editingCar, status: e.target.value as any})}
                          >
                              <option value="available">Active / Available</option>
                              <option value="rented">In Service / Rented</option>
                              <option value="maintenance">Under Repair / Maintenance</option>
                              <option value="cleaning">Cleaning Protocol</option>
                          </select>
                      </div>
                      <InputField label="Current Mileage (KM)" value={String(editingCar.currentOdometer || 0)} onChange={(v: string) => setEditingCar({...editingCar, currentOdometer: Number(v)})} type="number" />
                  </div>

                  <div className="flex gap-4 pt-10">
                     <button type="submit" className="flex-1 bg-blue-600 text-white py-6 rounded-3xl font-black uppercase text-xs tracking-widest shadow-2xl shadow-blue-500/40 hover:bg-blue-700 active:scale-95 transition-all">Synchronize Asset</button>
                     <button type="button" onClick={() => setEditingCar(null)} className="flex-1 bg-slate-100 dark:bg-slate-800 py-6 rounded-3xl font-black uppercase text-xs tracking-widest hover:bg-slate-200 transition-all">Cancel</button>
                  </div>
               </form>
            </div>
          </div>
        </div>
      )}

      {/* --- SERVICE EDITOR MODAL --- */}
      {editingService && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[110] flex items-center justify-center p-6">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-[3rem] p-12 shadow-2xl relative">
            <button onClick={() => setEditingService(null)} className="absolute top-8 right-8 opacity-50 hover:opacity-100">✕</button>
            <h4 className="text-3xl font-black tracking-tighter mb-10">Offer Configurator</h4>
            <form onSubmit={handleSaveService} className="space-y-6">
               <InputField label="Service Identity" value={editingService.name || ''} onChange={(v: string) => setEditingService({...editingService, name: v})} />
               <InputField label="Short Description" value={editingService.description || ''} onChange={(v: string) => setEditingService({...editingService, description: v})} />
               
               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                     <label className="text-[10px] font-black uppercase text-slate-400 ml-4">Classification</label>
                     <select className="w-full p-5 bg-slate-50 dark:bg-slate-800 rounded-2xl font-bold outline-none" value={editingService.type} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEditingService({...editingService, type: e.target.value as any})}>
                        <option value="insurance">Insurance Policy</option>
                        <option value="extra">Optional Extra</option>
                        <option value="fee">Operational Fee</option>
                     </select>
                  </div>
                  <InputField label="Base Unit Cost (€)" value={String(editingService.price || 0)} onChange={(v: string) => setEditingService({...editingService, price: Number(v)})} type="number" />
               </div>

               <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 ml-4">Pricing Model</label>
                  <div className="flex gap-2">
                      {(['fixed', 'daily'] as const).map(model => (
                          <button 
                            key={model}
                            type="button"
                            onClick={() => setEditingService({...editingService, priceModel: model})}
                            className={`flex-1 py-4 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${editingService.priceModel === model ? 'bg-slate-900 text-white shadow-xl' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}
                          >
                              {model === 'fixed' ? 'One-time Fee' : 'Per Day Rate'}
                          </button>
                      ))}
                  </div>
               </div>

               {editingService.type === 'insurance' && (
                   <div className="space-y-1">
                       <label className="text-[10px] font-black uppercase text-slate-400 ml-4">Coverage Intelligence</label>
                       <textarea 
                         className="w-full p-5 bg-slate-50 dark:bg-slate-800 rounded-2xl font-bold outline-none h-24"
                         value={editingService.coverageDetails || ''}
                         onChange={(e) => setEditingService({...editingService, coverageDetails: e.target.value})}
                         placeholder="Specific insurance fine print..."
                       />
                   </div>
               )}

               <button className="w-full bg-blue-600 text-white py-6 rounded-3xl font-black uppercase text-xs shadow-2xl shadow-blue-500/30 mt-6 active:scale-95 transition-all">Update Product</button>
            </form>
          </div>
        </div>
      )}

      {/* --- MAINTENANCE & LOGS MODAL --- */}
      {maintenanceCar && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[110] flex items-center justify-center p-4 md:p-6 overflow-y-auto">
           <div className="bg-white dark:bg-slate-900 w-full max-w-4xl rounded-[3rem] p-8 md:p-12 shadow-2xl relative">
              <button onClick={() => setMaintenanceCar(null)} className="absolute top-8 right-8 text-2xl opacity-50">✕</button>
              <h4 className="text-3xl font-black tracking-tighter mb-2">Fleet Logs: {maintenanceCar.brand} {maintenanceCar.model}</h4>
              <p className="text-slate-400 font-black uppercase text-[10px] tracking-widest mb-10">Normalized Maintenance History & Incident Control</p>
              
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-12">
                  <div className="lg:col-span-3 space-y-4">
                     <h5 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Historical Records</h5>
                     <div className="space-y-3 max-h-[400px] overflow-y-auto pr-4 no-scrollbar">
                        {db.getMaintenance(maintenanceCar.id).length === 0 ? (
                           <div className="text-center py-20 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-dashed border-slate-200 dark:border-slate-700">
                               <p className="text-4xl mb-2">💎</p>
                               <p className="text-[10px] font-black uppercase text-slate-400">Pristine Asset Condition</p>
                           </div>
                        ) : (
                           db.getMaintenance(maintenanceCar.id).reverse().map(rec => (
                              <div key={rec.id} className="p-6 bg-slate-50 dark:bg-slate-800 rounded-3xl flex justify-between items-center group hover:bg-white dark:hover:bg-slate-700 transition-all border border-transparent hover:border-blue-200 dark:hover:border-blue-800">
                                 <div className="flex gap-4">
                                    <div className="w-12 h-12 bg-white dark:bg-slate-900 rounded-2xl flex items-center justify-center shadow-sm">
                                        <span className="text-xl">🛠️</span>
                                    </div>
                                    <div>
                                       <p className="font-bold text-sm text-slate-900 dark:text-white">{rec.type}</p>
                                       <p className="text-[10px] text-slate-400 font-medium">{rec.date} • {rec.odometer} KM</p>
                                       <p className="text-[10px] text-slate-500 mt-1 italic">{rec.description}</p>
                                    </div>
                                 </div>
                                 <div className="text-right">
                                    <p className="font-black text-blue-600">{rec.cost}€</p>
                                    <button onClick={() => db.deleteMaintenance(rec.id)} className="text-[9px] font-black uppercase text-red-500 hover:underline mt-2 opacity-0 group-hover:opacity-100 transition-opacity">Void</button>
                                 </div>
                              </div>
                           ))
                        )}
                     </div>
                  </div>

                  <div className="lg:col-span-2 space-y-6">
                      <h5 className="text-xs font-black uppercase tracking-widest text-blue-600 mb-4">New Entry Diagnostic</h5>
                      <form onSubmit={handleSaveMaintenance} className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-[2.5rem] border dark:border-slate-800 space-y-4">
                         <InputField label="Report Date" type="date" value={editingMaintenance?.date || ''} onChange={(v: string) => setEditingMaintenance({...editingMaintenance, date: v})} />
                         <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase text-slate-400 ml-4">Intervention Type</label>
                            <select 
                                className="w-full p-4 bg-white dark:bg-slate-900 rounded-xl font-bold outline-none"
                                value={editingMaintenance?.type || 'Preventiva'}
                                onChange={(e) => setEditingMaintenance({...editingMaintenance, type: e.target.value as any})}
                            >
                                <option value="Preventiva">Preventive Check</option>
                                <option value="Corretiva">Corrective Repair</option>
                                <option value="IPO">Legal Inspection (IPO)</option>
                                <option value="Pneus">Tires / Alignment</option>
                                <option value="Limpeza">Sanitization / Detailing</option>
                            </select>
                         </div>
                         <div className="grid grid-cols-2 gap-3">
                            <InputField label="KM At Report" value={String(editingMaintenance?.odometer || 0)} onChange={(v: string) => setEditingMaintenance({...editingMaintenance, odometer: Number(v)})} type="number" />
                            <InputField label="Unit Cost (€)" value={String(editingMaintenance?.cost || 0)} onChange={(v: string) => setEditingMaintenance({...editingMaintenance, cost: Number(v)})} type="number" />
                         </div>
                         <textarea 
                            placeholder="Intervention technical details..."
                            className="w-full p-4 bg-white dark:bg-slate-900 rounded-xl font-bold outline-none h-24 text-sm"
                            value={editingMaintenance?.description || ''}
                            onChange={(e) => setEditingMaintenance({...editingMaintenance, description: e.target.value})}
                         />
                         <button type="submit" className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black uppercase text-xs tracking-widest active:scale-95 transition-all">Append To Fleet Log</button>
                      </form>
                  </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

const InputField = ({ label, value, onChange, type = "text", placeholder }: any) => (
  <div className="space-y-1">
    <label className="text-[10px] font-black uppercase text-slate-400 ml-4 tracking-tighter">{label}</label>
    <input 
      type={type} 
      className="w-full p-5 rounded-2xl bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-blue-600 transition-all font-bold outline-none text-slate-900 dark:text-white placeholder:text-slate-300" 
      value={value} 
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder || `Enter ${label.toLowerCase()}...`}
    />
  </div>
);

const StatCard = ({ label, value, icon, color }: any) => (
  <div className="bg-white dark:bg-slate-900 p-8 rounded-[3rem] shadow-sm border dark:border-slate-800 group hover:border-blue-500 transition-all overflow-hidden relative">
    <div className={`absolute -bottom-10 -right-10 text-8xl opacity-[0.03] group-hover:scale-110 transition-transform duration-1000`}>{icon}</div>
    <div className="flex justify-between items-start mb-4 relative z-10">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
      <span className="text-2xl group-hover:rotate-12 transition-transform">{icon}</span>
    </div>
    <div className={`text-5xl font-black ${color} tracking-tighter relative z-10`}>{value}</div>
  </div>
);
