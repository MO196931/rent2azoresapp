
import { CarDetails, ReservationData, CompanySettings, CarStatus, ServiceItem, MaintenanceRecord } from '../types';

const KEYS = {
  FLEET: 'autorent_db_fleet_v2',
  RESERVATIONS: 'autorent_db_reservations_v2',
  COMPANY: 'autorent_db_company_v2',
  SERVICES: 'autorent_db_services_v2',
  MAINTENANCE: 'autorent_db_maintenance_v2'
};

const INITIAL_FLEET: CarDetails[] = [
  { 
    id: 'c1', brand: 'Fiat', model: 'Panda Hybrid', licensePlate: 'AZ-01-PT', category: 'Económico', 
    price: '45€/dia', image: 'https://images.unsplash.com/photo-1621285853634-713b8dd6b590?auto=format&fit=crop&q=80&w=400', 
    specs: 'Manual, AC, 4 Lugares', status: 'available', vin: 'ZFA1234567890', currentOdometer: 12500, fuelLevel: '100%'
  },
  { 
    id: 'c2', brand: 'Jeep', model: 'Renegade 4xe', licensePlate: 'AZ-02-PT', category: 'SUV/Aventura', 
    price: '95€/dia', image: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&q=80&w=400', 
    specs: 'Híbrido, Automático, 4x4', status: 'available', vin: '1C4JBA1234567', currentOdometer: 8200, fuelLevel: '100%'
  }
];

const INITIAL_SERVICES: ServiceItem[] = [
  { id: 's1', name: 'Seguro Base', price: 0, priceModel: 'fixed', type: 'insurance', description: 'Franquia de 800€', coverageDetails: 'Cobertura de danos próprios limitada.' },
  { id: 's2', name: 'Seguro VIP', price: 25, priceModel: 'daily', type: 'insurance', description: 'Isenção total de franquia', coverageDetails: 'Proteção total sem custos adicionais em caso de sinistro.' },
  { id: 'e1', name: 'Cadeira de Bebé', price: 5, priceModel: 'daily', type: 'extra', description: 'Segurança para os mais pequenos' },
  { id: 'e2', name: 'Condutor Adicional', price: 10, priceModel: 'fixed', type: 'extra', description: 'Permite um segundo condutor' },
  { id: 'f1', name: 'Taxa de Limpeza', price: 15, priceModel: 'fixed', type: 'fee', description: 'Limpeza profunda pós-aluguer' }
];

class MockDatabase {
  constructor() { this.initialize(); }

  private initialize() {
    if (!localStorage.getItem(KEYS.FLEET)) localStorage.setItem(KEYS.FLEET, JSON.stringify(INITIAL_FLEET));
    if (!localStorage.getItem(KEYS.RESERVATIONS)) localStorage.setItem(KEYS.RESERVATIONS, JSON.stringify([]));
    if (!localStorage.getItem(KEYS.SERVICES)) localStorage.setItem(KEYS.SERVICES, JSON.stringify(INITIAL_SERVICES));
    if (!localStorage.getItem(KEYS.MAINTENANCE)) localStorage.setItem(KEYS.MAINTENANCE, JSON.stringify([]));
  }

  private _get<T>(key: string): T[] {
    return JSON.parse(localStorage.getItem(key) || '[]');
  }

  private _save<T extends { id?: string }>(key: string, item: T, prefix: string) {
    const items = this._get<T>(key);
    if (!item.id) {
        item.id = `${prefix}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
        items.push(item);
    } else {
        const index = items.findIndex((i: any) => i.id === item.id);
        if (index >= 0) items[index] = item;
        else items.push(item);
    }
    localStorage.setItem(key, JSON.stringify(items));
    return item;
  }

  private _delete(key: string, id: string) {
    const items = this._get<any>(key).filter((i: any) => i.id !== id);
    localStorage.setItem(key, JSON.stringify(items));
  }

  // --- FLEET ---
  getFleet(): CarDetails[] { return this._get(KEYS.FLEET); }
  saveCar(car: CarDetails) { return this._save(KEYS.FLEET, car, 'CAR'); }
  deleteCar(id: string) { 
    this._delete(KEYS.FLEET, id);
    // Cleanup related maintenance
    const mnt = this._get<MaintenanceRecord>(KEYS.MAINTENANCE).filter(m => m.carId !== id);
    localStorage.setItem(KEYS.MAINTENANCE, JSON.stringify(mnt));
  }
  updateCarStatus(id: string, status: CarStatus) {
    const fleet = this.getFleet();
    const index = fleet.findIndex(c => c.id === id);
    if (index >= 0) {
      fleet[index].status = status;
      localStorage.setItem(KEYS.FLEET, JSON.stringify(fleet));
    }
  }

  // --- MAINTENANCE ---
  getMaintenance(carId?: string): MaintenanceRecord[] {
    const all = this._get<MaintenanceRecord>(KEYS.MAINTENANCE);
    return carId ? all.filter(m => m.carId === carId) : all;
  }
  saveMaintenance(record: MaintenanceRecord) { return this._save(KEYS.MAINTENANCE, record, 'MNT'); }
  deleteMaintenance(id: string) { this._delete(KEYS.MAINTENANCE, id); }

  // --- SERVICES & INSURANCE ---
  getServices(): ServiceItem[] { return this._get(KEYS.SERVICES); }
  getInsurances(): ServiceItem[] { return this.getServices().filter(s => s.type === 'insurance'); }
  getExtras(): ServiceItem[] { return this.getServices().filter(s => s.type !== 'insurance'); }
  saveService(service: ServiceItem) { return this._save(KEYS.SERVICES, service, 'SRV'); }
  deleteService(id: string) { this._delete(KEYS.SERVICES, id); }

  // --- RESERVATIONS ---
  getReservations(): ReservationData[] { return this._get(KEYS.RESERVATIONS); }
  saveReservation(reservation: ReservationData) { return this._save(KEYS.RESERVATIONS, reservation, 'RES'); }
  updateReservationStatus(id: string, status: ReservationData['status']) {
    const items = this.getReservations();
    const index = items.findIndex(r => r.id === id);
    if (index >= 0) {
      items[index].status = status;
      localStorage.setItem(KEYS.RESERVATIONS, JSON.stringify(items));
    }
  }

  getCompany(): CompanySettings { 
    return JSON.parse(localStorage.getItem(KEYS.COMPANY) || JSON.stringify({
      name: 'AutoRent Azores Elite', address: 'Ponta Delgada, Açores', nif: '500123456', email: 'geral@autorentazores.pt'
    }));
  }
}

export const db = new MockDatabase();
