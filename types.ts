
export enum AppPhase {
  WELCOME = 'WELCOME',
  DETAILS = 'DETAILS', // Dates, Times
  DOCUMENTS = 'DOCUMENTS', // ID, License upload
  VEHICLE_SELECTION = 'VEHICLE_SELECTION',
  PICKUP_INSPECTION = 'PICKUP_INSPECTION', // Photos, Odometer, Damage
  CONTRACT_SIGNATURE = 'CONTRACT_SIGNATURE',
  CONTRACT_PREVIEW = 'CONTRACT_PREVIEW', // New Phase
  COMPLETED = 'COMPLETED',
  ADMIN_LOGIN = 'ADMIN_LOGIN',
  ADMIN_DASHBOARD = 'ADMIN_DASHBOARD'
}

export type ModuleName = 'AI_CORE' | 'AUDIO_SUBSYSTEM' | 'NETWORK' | 'DATABASE' | 'USER_INTERFACE';

export interface ModuleHealth {
  name: ModuleName;
  status: 'healthy' | 'degraded' | 'critical' | 'healing';
  latency: number; // ms
  errorCount: number;
  lastHealTimestamp?: number;
  lastError?: string;
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
  metric: string; // e.g., "date_correction_rate"
  value: number;
  threshold: number;
  adaptationApplied: string; // Description of prompt change
}

export interface KnowledgeDocument {
  id: string;
  name: string;
  type: string;
  content: string; // The extracted text
  timestamp: string;
  size?: number;
}

export interface DiagnosticResult {
  id: string;
  name: string;
  status: 'pending' | 'success' | 'failure' | 'warning';
  message: string;
  timestamp: number;
}

export interface SystemLog {
  id: string;
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'fatal';
  component: string;
  message: string;
  stack?: string;
  resolved: boolean;
}

export interface HealthReport {
  lastCheck: string; // Date string
  status: 'healthy' | 'degraded' | 'critical';
  issues: string[];
  stabilityScore: number; // 0 to 100
  modules: ModuleHealth[];
  recentHeals: HealingAction[];
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'staff';
  password?: string; // In a real app, this would be hashed
  active: boolean;
}

export interface ServiceItem {
  id: string;
  name: string;
  price: number;
  priceModel: 'daily' | 'fixed'; // 'daily' = per day, 'fixed' = one time fee
  type: 'insurance' | 'fee' | 'extra';
  description: string;
}

export interface CompanyProfile {
  name: string;
  nif: string;
  address: string;
  license: string;
  email: string;
  phone?: string;
  logo?: string; // Base64 string
  representative?: string; // Legal representative name
  googleClientId?: string; // NEW
  googleApiKey?: string; // NEW
}

export interface SecondaryDriver {
  id: string; // unique internal id
  name: string;
  email?: string;
  
  // Extracted Data
  ccNumber?: string;
  nif?: string;
  birthDate?: string;
  licenseNumber?: string;
  licenseIssueDate?: string;
  docExpiry?: string; // Generic expiry tracking
  
  // Upload State
  ccFrontUploaded?: boolean;
  ccBackUploaded?: boolean;
  dlFrontUploaded?: boolean;
  dlBackUploaded?: boolean;
}

export interface ChatMessage {
  role: 'user' | 'model' | 'system';
  text: string;
}

export interface UploadedFile {
  name: string;
  timestamp: number;
}

export interface ReservationData {
  id?: string; // Added ID for DB management
  status?: 'draft' | 'confirmed' | 'completed' | 'cancelled';
  startDate?: string;
  startTime?: string;
  endDate?: string;
  returnDate?: string; // New field as requested
  endTime?: string;
  pickupLocation?: string;
  returnLocation?: string;
  hotelAddress?: string;
  hotelName?: string; // New: Auto-filled via Google Maps
  hotelPhone?: string; // New: Auto-filled via Google Maps
  hotelDirectionsLink?: string; // New: Auto-filled via Google Maps
  flightNumber?: string;
  
  driverName?: string;
  email?: string;
  phone?: string;
  
  // Age and License Duration Fields
  birthDate?: string; // YYYY-MM-DD
  driverAge?: number; // Calculated age
  drivingLicenseIssueDate?: string; // YYYY-MM-DD (Data de emissão)
  drivingLicenseYears?: number; // Calculated years of experience
  
  // Document Details
  nif?: string; // Tax ID
  ccNumber?: string; // Citizen Card Number
  ccExpiry?: string; // YYYY-MM-DD
  drivingLicenseNumber?: string;
  dlExpiry?: string; // YYYY-MM-DD
  mainDriverDocExpiry?: string; // License Expiry Date (Generic legacy)
  
  // Document Images (Base64)
  ccFrontImage?: string;
  ccBackImage?: string;
  dlFrontImage?: string;
  dlBackImage?: string;
  
  secondaryDrivers?: SecondaryDriver[];
  
  selectedCar?: string;
  licensePlate?: string;
  selectedInsurance?: string;
  
  // Extras & Fees
  babySeat?: boolean;
  cleaningOption?: 'self' | 'paid'; // 'paid' = 10 euros
  outOfHoursFee?: boolean; // 15 euros (before 8am or after midnight)
  
  // Marketing & Operations
  referralSource?: string; // How did they find us?
  returnEmployeeAgreement?: boolean; // Agree to bring employee back to base?

  // System & Integration
  documentsUploaded: boolean;
  uploadedFiles?: UploadedFile[]; // List of uploaded filenames
  odometer?: number;
  fuelLevel?: string;
  signature?: string; // Base64 signature
  damageReport?: string[];
  damagePhotos?: string[]; // Array of Base64 strings for vehicle damage evidence
  
  n8nSyncStatus?: 'pending' | 'synced' | 'error';
  googleCalendarEventId?: string; // To link reservation to calendar event
  
  // Learning & Feedback
  feedbackRating?: number; // 1 to 5
  clientSuggestions?: string[]; // List of suggestions extracted from convo
  
  transcript: ChatMessage[];
}

export interface InsuranceOption {
  name: string;
  price: string;
  description: string;
}

export interface GoogleCalendar {
  id: string;
  summary: string;
  primary?: boolean;
  description?: string;
}

export interface CarDetails {
  id: string;
  model: string;
  licensePlate: string;
  category: string;
  price: string; // Base price for display
  image: string;
  specs: string; // Content representing "documents" (insurance, manual, etc.)
  insuranceDetails: string; // New field for specific insurance info
  insuranceOptions: InsuranceOption[];
  vin?: string; // Vehicle Identification Number
  
  // Document Management
  insurancePolicyNumber?: string;
  insuranceExpiry?: string; // YYYY-MM-DD
  iucExpiry?: string; // YYYY-MM-DD
  inspectionExpiry?: string; // YYYY-MM-DD (IPO)
  
  googleCalendarId?: string; // The ID of the calendar associated with this car
  status?: 'available' | 'rented' | 'maintenance';
}

// Initial Data Seeds
export const FLEET_DATA: CarDetails[] = [
  // Mitsubishis (Space Star / A00) - Base 39€
  { 
    id: '1', 
    model: 'Mitsubishi Space Star', 
    licensePlate: 'AQ-26-CG',
    category: 'Económico', 
    price: '39€/dia', 
    image: 'https://picsum.photos/300/200?random=101',
    specs: 'Gasolina. 5 Portas.',
    insuranceDetails: 'Franquia Base: 1200€. Cobertura de terceiros incluída.',
    insurancePolicyNumber: '206922527',
    insuranceExpiry: '2025-07-01',
    inspectionExpiry: '2025-05-15',
    iucExpiry: '2025-06-30',
    insuranceOptions: [
      { name: 'Básico (Terceiros)', price: 'Incluído', description: 'Franquia 0€ (apenas terceiros).' },
      { name: 'Danos Próprios (Com Franquia)', price: '+16€/dia', description: 'Cliente suporta a franquia em caso de dano.' },
      { name: 'Total (Sem Franquia)', price: '+20€/dia', description: 'Risco da franquia assumido pela AutoRent.' }
    ]
  },
  { 
    id: '6', 
    model: 'Toyota Yaris (Manual)', 
    licensePlate: 'AS-16-BI',
    category: 'Compacto', 
    price: '49€/dia', 
    image: 'https://picsum.photos/300/200?random=106',
    specs: 'Híbrido. GPS Incluído.',
    insuranceDetails: 'Franquia Base: 1500€. Inclui Assistência em Viagem 24h.',
    insuranceExpiry: '2025-07-01',
    insuranceOptions: [
      { name: 'Básico (Terceiros)', price: 'Incluído', description: 'Proteção contra terceiros.' },
      { name: 'Danos Próprios (Com Franquia)', price: '+16€/dia', description: 'Cliente suporta a franquia.' },
      { name: 'Danos Próprios Totais (Sem Franquia)', price: '+20€/dia', description: 'Risco da franquia assumido pela AutoRent.' }
    ]
  }
];

export const INSURANCE_POLICY_TEXT = `Apólice Nº. 206922527... (texto omitido para brevidade)`;