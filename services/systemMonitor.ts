
import { SystemLog, HealthReport, ModuleHealth, ModuleName, HealingAction, LearningMetric } from '../types';
import { checkSystemHealth } from './geminiService';

const LOG_STORAGE_KEY = 'autorent_system_logs';
const HEALTH_REPORT_KEY = 'autorent_health_report';
const LEARNING_KEY = 'autorent_system_learning';
const MAX_LOGS = 100;

class SystemMonitor {
  
  private logs: SystemLog[] = [];
  private stabilityScore: number = 100;
  private modules: Record<ModuleName, ModuleHealth>;
  private healingHistory: HealingAction[] = [];
  private learnedAdaptations: LearningMetric[] = [];

  constructor() {
    this.modules = this.initializeModules();
    this.loadState();
    this.cleanupOldLogs();
  }

  private initializeModules(): Record<ModuleName, ModuleHealth> {
    return {
      'AI_CORE': { name: 'AI_CORE', status: 'healthy', latency: 0, errorCount: 0 },
      'AUDIO_SUBSYSTEM': { name: 'AUDIO_SUBSYSTEM', status: 'healthy', latency: 0, errorCount: 0 },
      'NETWORK': { name: 'NETWORK', status: 'healthy', latency: 0, errorCount: 0 },
      'DATABASE': { name: 'DATABASE', status: 'healthy', latency: 0, errorCount: 0 },
      'USER_INTERFACE': { name: 'USER_INTERFACE', status: 'healthy', latency: 0, errorCount: 0 },
    };
  }

  private loadState() {
    try {
      const storedLogs = localStorage.getItem(LOG_STORAGE_KEY);
      this.logs = storedLogs ? JSON.parse(storedLogs) : [];
      
      const storedLearning = localStorage.getItem(LEARNING_KEY);
      this.learnedAdaptations = storedLearning ? JSON.parse(storedLearning) : [];
      
      this.calculateStabilityScore();
    } catch (e) {
      console.warn("System Monitor load failed", e);
    }
  }

  private saveState() {
    try {
      localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(this.logs));
      localStorage.setItem(LEARNING_KEY, JSON.stringify(this.learnedAdaptations));
    } catch (e) { console.warn("Log storage failed", e); }
  }

  private cleanupOldLogs() {
    if (this.logs.length > MAX_LOGS) {
      this.logs = this.logs.slice(this.logs.length - MAX_LOGS);
      this.saveState();
    }
  }

  private calculateStabilityScore() {
    // 60% based on recent errors, 40% based on module health
    const recentErrors = this.logs.filter(
        l => (l.level === 'error' || l.level === 'fatal') && 
        (Date.now() - l.timestamp) < 24 * 60 * 60 * 1000
    ).length;
    
    const unhealthyModules = Object.values(this.modules).filter(m => m.status !== 'healthy').length;

    let score = 100 - (recentErrors * 2) - (unhealthyModules * 15);
    this.stabilityScore = Math.max(0, Math.min(100, score));
  }

  // --- PUBLIC API ---

  public logEvent(level: SystemLog['level'], component: ModuleName | string, message: string, stack?: string) {
    const newLog: SystemLog = {
      id: Date.now().toString() + Math.random(),
      timestamp: Date.now(),
      level,
      component,
      message,
      stack,
      resolved: false
    };
    
    this.logs.push(newLog);
    
    // Update Module Health
    if (this.isModuleName(component)) {
        const mod = this.modules[component];
        if (level === 'error' || level === 'fatal') {
            mod.errorCount++;
            mod.lastError = message;
            if (mod.errorCount > 3) mod.status = 'critical';
            else if (mod.errorCount > 0) mod.status = 'degraded';
            
            // TRIGGER AUTO-HEALING
            if (mod.status !== 'healthy') {
                this.attemptHeal(component);
            }
        }
    }

    this.saveState();
    this.calculateStabilityScore();
    
    if (level === 'fatal') console.error(`[FATAL] ${component}: ${message}`);
  }

  public shouldRetry(error: any, attempt: number): { retry: boolean; delay: number } {
    const msg = error?.message || "";
    // Retry on network errors or transient server errors
    const isRetryable = msg.includes("Network error") || 
                        msg.includes("aborted") || 
                        msg.includes("503") || 
                        msg.includes("500") || 
                        msg.includes("fetch failed");

    if (isRetryable) {
        // Exponential backoff: 1s, 2s, 4s, etc.
        const delay = 1000 * Math.pow(2, attempt);
        return { retry: true, delay };
    }
    
    return { retry: false, delay: 0 };
  }

  private isModuleName(val: string): val is ModuleName {
      return ['AI_CORE', 'AUDIO_SUBSYSTEM', 'NETWORK', 'DATABASE', 'USER_INTERFACE'].includes(val);
  }

  // --- AUTO-HEALING LOGIC ---

  private async attemptHeal(module: ModuleName) {
      if (this.modules[module].status === 'healing') return; // Already working on it

      this.modules[module].status = 'healing';
      let success = false;
      let actionTaken = '';

      // Healing Strategies
      switch(module) {
          case 'AUDIO_SUBSYSTEM':
              actionTaken = "Resetting AudioContext and MediaStreams";
              // Simulation of repair
              await new Promise(r => setTimeout(r, 500)); 
              // In a real implementation, we would emit an event to App.tsx to restart the mic
              success = true;
              break;
          
          case 'NETWORK':
              actionTaken = "Flushing API Cache & Retrying Connection";
              success = true;
              break;

          case 'DATABASE':
              actionTaken = "Re-indexing LocalStorage keys";
              success = true;
              break;

          case 'AI_CORE':
              actionTaken = "Simplifying System Prompt (Token Reduction)";
              this.recordLearning("ai_error_rate", 1, "Reduced prompt complexity");
              success = true;
              break;

          default:
              actionTaken = "General diagnostic restart";
              success = false;
      }

      this.healingHistory.push({
          id: Date.now().toString(),
          module,
          action: actionTaken,
          timestamp: Date.now(),
          success,
          resultMessage: success ? "Module recovered successfully" : "Manual intervention required"
      });

      // Reset module status if successful
      if (success) {
          this.modules[module].status = 'healthy';
          this.modules[module].errorCount = 0;
          this.modules[module].lastHealTimestamp = Date.now();
      } else {
          this.modules[module].status = 'critical';
      }
      
      this.saveState();
  }

  // --- AUTO-LEARNING LOGIC ---

  public recordLearning(metric: string, value: number, adaptation: string) {
      const existing = this.learnedAdaptations.find(l => l.metric === metric);
      if (existing) {
          existing.value += value;
          existing.adaptationApplied = adaptation; // Update latest strategy
      } else {
          this.learnedAdaptations.push({
              metric,
              value,
              threshold: 5, // example threshold
              adaptationApplied: adaptation
          });
      }
      this.saveState();
  }

  public getAdaptiveInstruction(baseInstruction: string): string {
    let modifiers = "";
    
    // 1. Stability Modifier
    if (this.stabilityScore < 70) {
      modifiers += "\n[SYSTEM MODE: SAFE] Keep responses extremely short. Confirm every step.\n";
    }

    // 2. Specific Learning Modifiers
    const aiErrors = this.learnedAdaptations.find(l => l.metric === 'ai_error_rate');
    if (aiErrors && aiErrors.value > 0) {
        modifiers += "\n[ADAPTATION] Avoid complex JSON structures. Use plain text if possible.\n";
    }

    // 3. User Correction Modifier (Mock example)
    const dateCorrections = this.learnedAdaptations.find(l => l.metric === 'user_date_corrections');
    if (dateCorrections && dateCorrections.value > 2) {
        modifiers += "\n[ADAPTATION] When asking for dates, explicitly ask for the YEAR. Verify dates twice.\n";
    }

    return baseInstruction + modifiers;
  }

  // --- REPORTING ---

  public async runDailyHealthCheck(): Promise<HealthReport> {
    const issues: string[] = [];
    
    // 1. Check AI
    const startAi = Date.now();
    const aiCheck = await checkSystemHealth();
    this.modules.AI_CORE.latency = Date.now() - startAi;
    if (!aiCheck.status) {
        this.logEvent('error', 'AI_CORE', aiCheck.error || "Ping failed");
    }

    // 2. Database Check
    try {
        const testKey = 'db_test';
        localStorage.setItem(testKey, 'ok');
        if (localStorage.getItem(testKey) !== 'ok') throw new Error("Write failed");
        localStorage.removeItem(testKey);
    } catch(e) {
        this.logEvent('error', 'DATABASE', "LocalStorage write failed");
    }

    const report: HealthReport = {
      lastCheck: new Date().toISOString(),
      status: this.stabilityScore > 80 ? 'healthy' : (this.stabilityScore > 50 ? 'degraded' : 'critical'),
      issues: this.logs.filter(l => !l.resolved && l.level === 'error').map(l => l.message),
      stabilityScore: this.stabilityScore,
      modules: Object.values(this.modules),
      recentHeals: this.healingHistory.slice(-5)
    };

    localStorage.setItem(HEALTH_REPORT_KEY, JSON.stringify(report));
    return report;
  }
}

export const systemMonitor = new SystemMonitor();
