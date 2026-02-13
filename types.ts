
export enum AppPhase {
  WELCOME = 'WELCOME',
  DETAILS = 'DETAILS',
  VEHICLE_SELECTION = 'VEHICLE_SELECTION',
  INSURANCE_AND_EXTRAS = 'INSURANCE_AND_EXTRAS',
  VEHICLE_CHECKIN = 'VEHICLE_CHECKIN',
  DOCUMENTS_COLLECTION = 'DOCUMENTS_COLLECTION',
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
  interiorFront?: string;
  interiorBack?: string;
  exteriorFront?: string;
  exteriorBack?: string;
  exteriorLeft?: string;
  exteriorRight?: string;
  damagePhotos: string[];
  observations?: string;
  isCompleteLater?: boolean;
}

export interface ReservationData {
  id?: string;
  status?: 'draft' | 'confirmed' | 'completed' | 'cancelled';
  startDate?: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
  mainDriver: DriverInfo;
  additionalDrivers: DriverInfo[];
  selectedCarId?: string;
  selectedExtras: string[];
  selectedInsuranceId?: string;
  checkin?: VehicleCheckinData;
  signature?: string;
  createdAt?: string;
  learningProfile?: {
    preferredLanguage: string;
    lastInteractionStep: AppPhase;
    userCorrections: number;
  };
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

export interface ServiceItem {
  id: string;
  name: string;
  price: number;
  priceModel: 'fixed' | 'daily';
  type: 'fee' | 'extra' | 'insurance';
  description: string;
  coverageDetails?: string;
}

export interface CompanySettings {
  name: string;
  logo?: string;
  address: string;
  nif: string;
  iban: string;
  email: string;
}

// Added MaintenanceRecord to resolve export errors in mockDatabase and AdminManagement
export interface MaintenanceRecord {
  id: string;
  carId: string;
  date: string;
  type: 'Preventiva' | 'Corretiva' | 'IPO' | 'Pneus' | 'Limpeza';
  odometer: number;
  cost: number;
  description: string;
}

export type ModuleName = 'AI_CORE' | 'AUDIO_SUBSYSTEM' | 'NETWORK' | 'DATABASE' | 'USER_INTERFACE';

export interface ModuleHealth {
  name: ModuleName;
  status: 'healthy' | 'degraded' | 'healing';
  latency: number;
  errorCount: number;
}

export interface SystemLog {
  id: string;
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'fatal';
  component: string;
  message: string;
  resolved: boolean;
}

export interface HealingAction {
  id: string;
  module: ModuleName;
  action: string;
  timestamp: number;
  success: boolean;
  resultMessage: string;
}

export interface HealthReport {
  lastCheck: string;
  status: 'healthy' | 'degraded';
  issues: string[];
  stabilityScore: number;
  modules: ModuleHealth[];
  recentHeals: HealingAction[];
}

export interface LearningMetric {
  topic: string;
  timestamp: number;
  improvement: number;
}

export interface GoogleCalendar {
  id: string;
  summary: string;
  primary?: boolean;
  description?: string;
}
