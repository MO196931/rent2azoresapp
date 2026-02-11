
export enum AppPhase {
  WELCOME = 'WELCOME',
  DETAILS = 'DETAILS',
  VEHICLE_SELECTION = 'VEHICLE_SELECTION',
  INSURANCE_AND_EXTRAS = 'INSURANCE_AND_EXTRAS',
  DOCUMENTS = 'DOCUMENTS',
  PICKUP_INSPECTION = 'PICKUP_INSPECTION',
  GENERAL_TERMS = 'GENERAL_TERMS',
  CONTRACT_SIGNATURE = 'CONTRACT_SIGNATURE',
  COMPLETED = 'COMPLETED',
  ADMIN_LOGIN = 'ADMIN_LOGIN',
  ADMIN_DASHBOARD = 'ADMIN_DASHBOARD'
}

export interface MaintenanceRecord {
  id: string;
  date: string;
  type: 'Preventiva' | 'Corretiva' | 'IPO' | 'Pneus';
  description: string;
  odometer: number;
  cost: number;
}

export interface CarDetails {
  id: string;
  brand?: string;
  model: string;
  licensePlate: string;
  vin?: string;
  category: string;
  price: string;
  image: string;
  specs: string;
  // Campos do Certificado de Matrícula
  regDocFront?: string;
  regDocBack?: string;
  lastIpoDate?: string;
  nextIpoDate?: string;
  maintenanceHistory: MaintenanceRecord[];
}

export interface ReservationData {
  id?: string;
  status?: 'draft' | 'confirmed' | 'completed' | 'cancelled';
  startDate?: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
  driverName?: string;
  email?: string;
  phone?: string;
  nif?: string;
  selectedCar?: string;
  licensePlate?: string;
  transcript: { role: 'user' | 'model'; text: string }[];
  contextInsights?: string;
  additionalDrivers: { name: string; email: string }[];
  selectedExtras: string[];
  selectedInsurance?: string;
  documentsUploaded: boolean;
  odometer?: number;
  fuelLevel?: string;
}

export interface CompanySettings {
  name: string;
  logo?: string;
  address: string;
  nif: string;
  iban: string;
  email: string;
}

export interface ServiceItem {
  id: string;
  name: string;
  price: number;
  priceModel: 'fixed' | 'daily';
  type: 'fee' | 'extra' | 'insurance';
  description: string;
}

// System Monitoring Types
export type ModuleName = 'AI_CORE' | 'AUDIO_SUBSYSTEM' | 'NETWORK' | 'DATABASE' | 'USER_INTERFACE';

export interface ModuleHealth {
  name: ModuleName;
  status: 'healthy' | 'degraded' | 'critical' | 'healing';
  latency: number;
  errorCount: number;
  lastError?: string;
  lastHealTimestamp?: number;
}

export interface SystemLog {
  id: string;
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'fatal';
  component: ModuleName | string;
  message: string;
  stack?: string;
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

export interface LearningMetric {
  metric: string;
  value: number;
  threshold: number;
  adaptationApplied: string;
}

export interface HealthReport {
  lastCheck: string;
  status: 'healthy' | 'degraded' | 'critical';
  issues: string[];
  stabilityScore: number;
  modules: ModuleHealth[];
  recentHeals: HealingAction[];
}

// Google Calendar Integration Type
export interface GoogleCalendar {
  id: string;
  summary: string;
  primary?: boolean;
  description?: string;
}
