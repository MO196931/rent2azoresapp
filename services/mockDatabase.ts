
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

class MockDatabase {
  constructor() { this.initialize(); }

  private initialize() {
    if (!localStorage.getItem(KEYS.FLEET)) localStorage.setItem(KEYS.FLEET, JSON.stringify(INITIAL_FLEET));
    if (!localStorage.getItem(KEYS.RESERVATIONS)) localStorage.setItem(KEYS.RESERVATIONS, JSON.stringify([]));
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

  getFleet(): CarDetails[] { return this._get(KEYS.FLEET); }
  getReservations(): ReservationData[] { return this._get(KEYS.RESERVATIONS); }
  saveReservation(reservation: ReservationData) { return this._save(KEYS.RESERVATIONS, reservation, 'RES'); }
  
  getCompany(): CompanySettings { 
    return {
      name: 'AutoRent Azores Elite', address: 'Ponta Delgada, Açores', nif: '500123456', email: 'geral@autorentazores.pt'
    };
  }

  getMaintenance(carId?: string): MaintenanceRecord[] {
    const all = this._get<MaintenanceRecord>(KEYS.MAINTENANCE);
    return carId ? all.filter(m => m.carId === carId) : all;
  }
  
  saveMaintenance(rec: MaintenanceRecord) { return this._save(KEYS.MAINTENANCE, rec, 'MNT'); }
  deleteMaintenance(id: string) {
    const items = this._get<any>(KEYS.MAINTENANCE).filter((i: any) => i.id !== id);
    localStorage.setItem(KEYS.MAINTENANCE, JSON.stringify(items));
  }
  
  getServices() { return this._get<ServiceItem>(KEYS.SERVICES); }
  saveService(srv: ServiceItem) { return this._save(KEYS.SERVICES, srv, 'SRV'); }
  deleteService(id: string) {
    const items = this._get<any>(KEYS.SERVICES).filter((i: any) => i.id !== id);
    localStorage.setItem(KEYS.SERVICES, JSON.stringify(items));
  }
  
  deleteCar(id: string) {
    const items = this._get<any>(KEYS.FLEET).filter((i: any) => i.id !== id);
    localStorage.setItem(KEYS.FLEET, JSON.stringify(items));
  }
  
  saveCar(car: CarDetails) { return this._save(KEYS.FLEET, car, 'CAR'); }
  
  updateReservationStatus(id: string, status: ReservationData['status']) {
    const items = this.getReservations();
    const index = items.findIndex(r => r.id === id);
    if (index >= 0) {
      items[index].status = status;
      localStorage.setItem(KEYS.RESERVATIONS, JSON.stringify(items));
    }
  }
}

export const db = new MockDatabase();
