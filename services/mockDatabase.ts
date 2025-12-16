
import { CarDetails, UserProfile, ServiceItem, ReservationData, FLEET_DATA } from '../types';

// Storage Keys
const KEYS = {
  FLEET: 'autorent_db_fleet',
  USERS: 'autorent_db_users',
  SERVICES: 'autorent_db_services',
  RESERVATIONS: 'autorent_db_reservations',
  TEMPLATES: 'autorent_db_templates'
};

// Default Data
const DEFAULT_USERS: UserProfile[] = [
  { id: '1', name: 'Administrador', email: 'admin@autorent.pt', role: 'admin', active: true, password: 'admin' },
  { id: '2', name: 'Staff Check-in', email: 'staff@autorent.pt', role: 'staff', active: true, password: 'staff' }
];

const DEFAULT_SERVICES: ServiceItem[] = [
  { id: '1', name: 'Limpeza (Pago)', price: 10, priceModel: 'fixed', type: 'fee', description: 'Taxa se o cliente não limpar.' },
  { id: '2', name: 'Fora de Horas', price: 15, priceModel: 'fixed', type: 'fee', description: 'Levantamento antes das 8h ou após 00h.' },
  { id: '3', name: 'Cadeira Bebé', price: 5, priceModel: 'daily', type: 'extra', description: 'Preço por dia.' }
];

class MockDatabase {
  
  constructor() {
    this.initialize();
  }

  private initialize() {
    if (!localStorage.getItem(KEYS.FLEET)) {
      localStorage.setItem(KEYS.FLEET, JSON.stringify(FLEET_DATA));
    }
    if (!localStorage.getItem(KEYS.USERS)) {
      localStorage.setItem(KEYS.USERS, JSON.stringify(DEFAULT_USERS));
    }
    if (!localStorage.getItem(KEYS.SERVICES)) {
      localStorage.setItem(KEYS.SERVICES, JSON.stringify(DEFAULT_SERVICES));
    }
    if (!localStorage.getItem(KEYS.RESERVATIONS)) {
      localStorage.setItem(KEYS.RESERVATIONS, JSON.stringify([]));
    }
  }

  // --- Fleet Management ---
  getFleet(): CarDetails[] {
    return JSON.parse(localStorage.getItem(KEYS.FLEET) || '[]');
  }

  saveFleet(fleet: CarDetails[]) {
    localStorage.setItem(KEYS.FLEET, JSON.stringify(fleet));
  }

  addCar(car: CarDetails) {
    const fleet = this.getFleet();
    fleet.push({ ...car, id: Date.now().toString() });
    this.saveFleet(fleet);
  }

  updateCar(updatedCar: CarDetails) {
    const fleet = this.getFleet().map(c => c.id === updatedCar.id ? updatedCar : c);
    this.saveFleet(fleet);
  }

  deleteCar(id: string) {
    const fleet = this.getFleet().filter(c => c.id !== id);
    this.saveFleet(fleet);
  }

  duplicateCar(id: string) {
      const fleet = this.getFleet();
      const car = fleet.find(c => c.id === id);
      if (car) {
          const newCar = { 
              ...car, 
              id: Date.now().toString(), 
              model: `${car.model} (Cópia)`,
              licensePlate: 'XX-00-XX' // Reset plate
          };
          fleet.push(newCar);
          this.saveFleet(fleet);
      }
  }

  // --- User Management ---
  getUsers(): UserProfile[] {
    return JSON.parse(localStorage.getItem(KEYS.USERS) || '[]');
  }

  saveUsers(users: UserProfile[]) {
    localStorage.setItem(KEYS.USERS, JSON.stringify(users));
  }

  addUser(user: UserProfile) {
    const users = this.getUsers();
    users.push({ ...user, id: Date.now().toString() });
    this.saveUsers(users);
  }

  updateUser(updatedUser: UserProfile) {
    const users = this.getUsers().map(u => u.id === updatedUser.id ? updatedUser : u);
    this.saveUsers(users);
  }

  deleteUser(id: string) {
    const users = this.getUsers().filter(u => u.id !== id);
    this.saveUsers(users);
  }

  duplicateUser(id: string) {
      const users = this.getUsers();
      const user = users.find(u => u.id === id);
      if (user) {
          const newUser = {
              ...user,
              id: Date.now().toString(),
              name: `${user.name} (Cópia)`,
              email: `copy.${Date.now()}@autorent.pt`
          };
          users.push(newUser);
          this.saveUsers(users);
      }
  }

  // --- Services Management ---
  getServices(): ServiceItem[] {
    return JSON.parse(localStorage.getItem(KEYS.SERVICES) || '[]');
  }

  saveServices(services: ServiceItem[]) {
    localStorage.setItem(KEYS.SERVICES, JSON.stringify(services));
  }

  addService(service: ServiceItem) {
      const services = this.getServices();
      services.push({ ...service, id: Date.now().toString() });
      this.saveServices(services);
  }

  updateService(updatedService: ServiceItem) {
      const services = this.getServices().map(s => s.id === updatedService.id ? updatedService : s);
      this.saveServices(services);
  }

  deleteService(id: string) {
      const services = this.getServices().filter(s => s.id !== id);
      this.saveServices(services);
  }

  duplicateService(id: string) {
      const services = this.getServices();
      const s = services.find(i => i.id === id);
      if (s) {
          const newS = { ...s, id: Date.now().toString(), name: `${s.name} (Cópia)` };
          services.push(newS);
          this.saveServices(services);
      }
  }

  // --- Reservation Management ---
  getReservations(): ReservationData[] {
    return JSON.parse(localStorage.getItem(KEYS.RESERVATIONS) || '[]');
  }

  saveReservation(reservation: ReservationData) {
    const reservations = this.getReservations();
    const index = reservations.findIndex(r => r.id === reservation.id);
    
    if (index >= 0) {
      reservations[index] = reservation;
    } else {
      reservation.id = Date.now().toString();
      reservation.status = 'confirmed';
      reservations.push(reservation);
    }
    localStorage.setItem(KEYS.RESERVATIONS, JSON.stringify(reservations));
  }

  // --- Auth ---
  login(password: string): UserProfile | null {
    const users = this.getUsers();
    // Simple password check (In prod use hashing + JWT)
    return users.find(u => u.password === password && u.active) || null;
  }
}

export const db = new MockDatabase();