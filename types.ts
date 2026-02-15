
export enum AppPhase {
  WELCOME = 'WELCOME',
  DETAILS = 'DETAILS',
  CONTRACT_SIGNATURE = 'CONTRACT_SIGNATURE',
  COMPLETED = 'COMPLETED',
  ADMIN_DASHBOARD = 'ADMIN_DASHBOARD',
  DIAGNOSTIC = 'DIAGNOSTIC'
}

export interface DriverInfo {
  name: string;
  email: string;
  phone: string;
  idNumber?: string;
  licenseNumber?: string;
}

export interface VehicleCheckinData {
  interiorPhotos: string[];
  exteriorPhotos: string[];
  damagePhotos: string[];
  odometerPhoto?: string;
}

export interface ReservationData {
  id?: string;
  status: 'draft' | 'confirmed' | 'active' | 'completed' | 'cancelled';
  startDate?: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
  pickupLocation?: string;
  selectedCarId?: string;
  mainDriver: DriverInfo;
  additionalDrivers: DriverInfo[];
  selectedExtras: string[];
  selectedInsuranceId?: string;
  checkin: VehicleCheckinData;
  signature?: string;
  createdAt?: string;
}

export interface CarDetails {
  id: string;
  brand: string;
  model: string;
  licensePlate: string;
  category: string;
  price: string;
  image: string;
  status: CarStatus;
  specs?: string;
  vin?: string;
  currentOdometer?: number;
  fuelLevel?: string;
}

export type CarStatus = 'available' | 'rented' | 'maintenance' | 'cleaning';

export interface AppNotification {
  id: string;
  type: 'email' | 'push' | 'sms' | 'system' | 'whatsapp';
  title: string;
  message: string;
  timestamp: number;
}

export interface CompanySettings {
  name: string;
  address: string;
  nif: string;
  email: string;
  logoUrl: string;
}

export interface DriverRole {
  id: string;
  label: string;
  description: string;
  canSignContract: boolean;
  requiresId: boolean;
  isSystemRole: boolean;
}

export interface ServiceItem {
  id: string;
  name: string;
  price: number;
  priceModel: 'daily' | 'fixed';
  description: string;
}

export interface MaintenanceRecord {
  id: string;
  carId: string;
  date: string;
  type: string;
  description: string;
}

export interface SystemLog {
  id: string;
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'fatal';
  component: string;
  message: string;
  resolved: boolean;
}

export interface HealthReport {
  lastCheck: string;
  status: 'healthy' | 'degraded' | 'critical';
  issues: string[];
  stabilityScore: number;
  modules: ModuleHealth[];
  recentHeals: HealingAction[];
  permissions: any;
  environment: {
    online: boolean;
    memory: number;
    storageUsage: {
      used: number;
      total: number;
      percentage: number;
    };
    batteryLevel?: number;
    isCharging?: boolean;
  };
}

export interface ModuleHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'critical';
  latency: number;
  errorCount: number;
  lastTestMessage?: string;
}

export interface HealingAction {
  id: string;
  module: ModuleName;
  action: string;
  timestamp: number;
  success: boolean;
  resultMessage: string;
}

export type ModuleName = 'AI_CORE' | 'AUDIO_SUBSYSTEM' | 'NETWORK' | 'DATABASE' | 'USER_INTERFACE' | 'HARDWARE_LAYER';

export type SupportedLang = 'pt' | 'en' | 'es' | 'fr';

export interface GoogleCalendar {
  id: string;
  summary: string;
  description?: string;
  primary?: boolean;
}
