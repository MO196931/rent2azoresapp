
export enum AppPhase {
  WELCOME = 'WELCOME',
  LOCATIONS = 'LOCATIONS',
  ACCOMMODATION = 'ACCOMMODATION',
  DETAILS = 'DETAILS',
  VEHICLE_CHECKIN = 'VEHICLE_CHECKIN',
  CONTRACT_SIGNATURE = 'CONTRACT_SIGNATURE',
  COMPLETED = 'COMPLETED',
  ADMIN_DASHBOARD = 'ADMIN_DASHBOARD'
}

export interface DriverInfo {
  name: string;
  email: string;
  phone: string;
  nif?: string;
  idNumber?: string;
  licenseNumber?: string;
  licenseExpiry?: string;
  docFront?: string;
  docBack?: string;
  licenseFront?: string;
  licenseBack?: string;
}

export interface VehicleCheckinData {
  odometerPhoto?: string;
  odometerValue?: number;
  fuelLevel?: string;
  damagePhotos: string[];
  isCompleteLater?: boolean;
  interiorFront?: string;
  exteriorFront?: string;
  exteriorBack?: string;
  observations?: string;
}

export interface ReservationData {
  id?: string;
  status?: 'draft' | 'confirmed' | 'completed' | 'cancelled';
  startDate?: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
  pickupLocation?: string;
  dropoffLocation?: string;
  accommodationName?: string;
  accommodationAddress?: string;
  accommodationPlaceId?: string;
  mainDriver: DriverInfo;
  additionalDrivers: DriverInfo[];
  selectedCarId?: string;
  selectedExtras: string[];
  selectedInsuranceId?: string;
  checkin?: VehicleCheckinData;
  signature?: string;
  createdAt?: string;
}

export type CarStatus = 'available' | 'rented' | 'maintenance' | 'cleaning';

export interface CarDetails {
  id: string;
  brand: string;
  model: string;
  licensePlate: string;
  vin: string;
  category: string;
  price: string;
  image: string;
  specs: string;
  status: CarStatus;
  currentOdometer: number;
  fuelLevel: string;
}

export interface MaintenanceRecord {
  id: string;
  carId: string;
  date: string;
  type: 'Preventiva' | 'Corretiva' | 'IPO' | 'Pneus' | 'Limpeza';
  odometer: number;
  cost: number;
  description: string;
}

export interface CompanySettings {
  name: string;
  address: string;
  nif: string;
  email: string;
}

export interface AppNotification {
  id: string;
  type: 'email' | 'push' | 'sms' | 'system' | 'whatsapp';
  title: string;
  message: string;
  timestamp: number;
}

export type ModuleName = 'AI_CORE' | 'AUDIO_SUBSYSTEM' | 'NETWORK' | 'DATABASE' | 'USER_INTERFACE';

export interface SystemLog {
  id: string;
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'fatal';
  component: string;
  message: string;
  resolved: boolean;
}

export interface ModuleHealth {
  name: ModuleName;
  status: 'healthy' | 'degraded' | 'failing';
  latency: number;
  errorCount: number;
}

// Added HealingAction interface to fix missing member error
export interface HealingAction {
  id: string;
  module: ModuleName;
  action: string;
  success: boolean;
  resultMessage: string;
  timestamp: number;
}

// Added LearningMetric interface to fix missing member error
export interface LearningMetric {
  topic: string;
  timestamp: number;
  improvement: number;
}

export interface HealthReport {
  lastCheck: string;
  status: 'healthy' | 'degraded';
  issues: string[];
  stabilityScore: number;
  modules: ModuleHealth[];
  // Updated to use HealingAction interface
  recentHeals: HealingAction[];
}

export interface ServiceItem {
  id: string;
  name: string;
  price: number;
  priceModel: 'fixed' | 'daily';
  type: 'insurance' | 'extra' | 'fee';
  description: string;
  coverageDetails?: string;
}

export interface GoogleCalendar {
  id: string;
  summary: string;
  primary?: boolean;
  // Added description to fix property not existing error
  description?: string;
}
