
import { CarDetails, ReservationData, CompanySettings } from '../types';

const KEYS = {
  FLEET: 'autorent_db_fleet',
  RESERVATIONS: 'autorent_db_reservations',
  COMPANY: 'autorent_db_company'
};

const INITIAL_FLEET: CarDetails[] = [
  { 
    id: 'c1', brand: 'Fiat', model: 'Panda Hybrid', licensePlate: 'AZ-01-PT', category: 'Económico', 
    price: '45€/dia', image: 'https://images.unsplash.com/photo-1621285853634-713b8dd6b590?auto=format&fit=crop&q=80&w=400', 
    specs: 'Manual, AC, 4 Lugares', maintenanceHistory: [] 
  },
  { 
    id: 'c2', brand: 'Jeep', model: 'Renegade 4xe', licensePlate: 'AZ-02-PT', category: 'SUV/Aventura', 
    price: '95€/dia', image: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&q=80&w=400', 
    specs: 'Híbrido, Automático, 4x4', maintenanceHistory: [] 
  }
];

class MockDatabase {
  constructor() { this.initialize(); }

  private initialize() {
    if (!localStorage.getItem(KEYS.FLEET)) localStorage.setItem(KEYS.FLEET, JSON.stringify(INITIAL_FLEET));
    if (!localStorage.getItem(KEYS.RESERVATIONS)) localStorage.setItem(KEYS.RESERVATIONS, JSON.stringify([]));
  }

  getFleet(): CarDetails[] { return JSON.parse(localStorage.getItem(KEYS.FLEET) || '[]'); }
  getReservations(): ReservationData[] { return JSON.parse(localStorage.getItem(KEYS.RESERVATIONS) || '[]'); }
  
  saveReservation(reservation: ReservationData) {
    const reservations = this.getReservations();
    const index = reservations.findIndex(r => r.id === reservation.id);
    if (index >= 0) reservations[index] = reservation;
    else {
      reservation.id = 'RES-' + Math.random().toString(36).substr(2, 6).toUpperCase();
      reservations.push(reservation);
    }
    localStorage.setItem(KEYS.RESERVATIONS, JSON.stringify(reservations));
  }

  getCompany(): CompanySettings { 
    return JSON.parse(localStorage.getItem(KEYS.COMPANY) || JSON.stringify({
      name: 'AutoRent Azores Elite', address: 'Ponta Delgada', nif: '500123', email: 'geral@autorent.pt'
    }));
  }
}

export const db = new MockDatabase();
