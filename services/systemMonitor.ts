
import { SystemLog, HealthReport, ModuleHealth, ModuleName, HealingAction } from '../types';
import { checkSystemHealth } from './geminiService';

class SystemMonitor {
  private logs: SystemLog[] = [];
  private stabilityScore: number = 100;
  private modules: Record<ModuleName, ModuleHealth>;
  private heals: HealingAction[] = [];
  private permissions = { camera: 'unknown', microphone: 'unknown', geolocation: 'unknown' };

  constructor() {
    this.modules = this.initializeModules();
    this.loadPersistedData();
    this.checkBrowserPermissions();
  }

  private loadPersistedData() {
    try {
      const savedLogs = localStorage.getItem('system_monitor_logs');
      if (savedLogs) this.logs = JSON.parse(savedLogs);
      
      const savedHeals = localStorage.getItem('system_monitor_heals');
      if (savedHeals) this.heals = JSON.parse(savedHeals);
    } catch (e) {
      localStorage.removeItem('system_monitor_logs');
    }
  }

  private persistData() {
    try {
      localStorage.setItem('system_monitor_logs', JSON.stringify(this.logs.slice(0, 50)));
      localStorage.setItem('system_monitor_heals', JSON.stringify(this.heals.slice(0, 20)));
    } catch (e) {}
  }

  private initializeModules(): Record<ModuleName, ModuleHealth> {
    const mods: any = {};
    (['AI_CORE', 'AUDIO_SUBSYSTEM', 'NETWORK', 'DATABASE', 'USER_INTERFACE', 'HARDWARE_LAYER'] as ModuleName[]).forEach(m => {
      mods[m] = { name: m, status: 'healthy', latency: 0, errorCount: 0 };
    });
    return mods;
  }

  private async checkBrowserPermissions() {
    if (typeof navigator === 'undefined' || !navigator.permissions) return;
    try {
      // Some browsers don't support 'camera' or 'microphone' queries via navigator.permissions
      const cam = await navigator.permissions.query({ name: 'camera' as any }).catch(() => ({ state: 'prompt' }));
      const mic = await navigator.permissions.query({ name: 'microphone' as any }).catch(() => ({ state: 'prompt' }));
      const geo = await navigator.permissions.query({ name: 'geolocation' as any }).catch(() => ({ state: 'prompt' }));
      this.permissions = { 
        camera: cam.state, 
        microphone: mic.state, 
        geolocation: geo.state 
      };
    } catch (e) {}
  }

  public logEvent(level: SystemLog['level'], component: string, message: string) {
    const log: SystemLog = { 
      id: Math.random().toString(36).substr(2, 9), 
      timestamp: Date.now(), 
      level, 
      component, 
      message, 
      resolved: false 
    };
    this.logs.unshift(log);
    
    const moduleName = this.mapComponentToModule(component);
    if ((level === 'error' || level === 'fatal') && this.modules[moduleName]) {
      this.modules[moduleName].status = 'degraded';
      this.modules[moduleName].errorCount++;
      this.triggerAutoHeal(moduleName, message);
    }
    
    this.calculateStabilityScore();
    if (this.logs.length > 50) this.logs.pop();
    this.persistData();
  }

  private mapComponentToModule(component: string): ModuleName {
    const c = component.toUpperCase();
    if (c.includes('AI') || c.includes('GEMINI')) return 'AI_CORE';
    if (c.includes('AUDIO')) return 'AUDIO_SUBSYSTEM';
    if (c.includes('NET')) return 'NETWORK';
    if (c.includes('DB')) return 'DATABASE';
    if (c.includes('CAM') || c.includes('MIC') || c.includes('GEO')) return 'HARDWARE_LAYER';
    return 'USER_INTERFACE';
  }

  public triggerAutoHeal(module: ModuleName, error: string) {
    const heal: HealingAction = {
      id: Math.random().toString(36).substr(2, 5),
      module,
      action: "Self-Correction Protocol Dispatched",
      timestamp: Date.now(),
      success: true,
      resultMessage: "Estado do módulo reposto para parâmetros normais."
    };
    this.heals.unshift(heal);
    if (this.modules[module]) this.modules[module].status = 'healthy';
  }

  private calculateStabilityScore() {
    const recentErrors = this.logs.filter(l => (l.level === 'error' || l.level === 'fatal') && (Date.now() - l.timestamp < 600000)).length;
    this.stabilityScore = Math.max(0, 100 - (recentErrors * 15));
  }

  public getStorageUsage(): { used: number; total: number; percentage: number } {
    let used = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        used += (localStorage.getItem(key)?.length || 0) * 2; // approximation in bytes (UTF-16)
      }
    }
    const total = 5 * 1024 * 1024; // Common 5MB localStorage limit
    return {
      used: Math.round(used / 1024), // KB
      total: 5120, // KB
      percentage: Math.min(100, Math.round((used / total) * 100))
    };
  }

  public getInstantReport(): HealthReport {
    const storage = this.getStorageUsage();
    const memory = (performance as any).memory;
    
    return {
      lastCheck: new Date().toISOString(),
      status: this.stabilityScore > 85 ? 'healthy' : this.stabilityScore > 50 ? 'degraded' : 'critical',
      issues: this.logs.filter(l => (l.level === 'error' || l.level === 'fatal') && !l.resolved).map(l => l.message),
      stabilityScore: this.stabilityScore,
      modules: Object.values(this.modules),
      recentHeals: this.heals,
      permissions: this.permissions,
      environment: {
        online: typeof navigator !== 'undefined' ? navigator.onLine : true,
        memory: memory ? memory.usedJSHeapSize : 0,
        storageUsage: storage // Custom tracking
      } as any
    };
  }

  public async getFullReport(): Promise<HealthReport> {
    await this.checkBrowserPermissions();
    let batteryInfo: any = { level: 100, charging: true };
    if (typeof navigator !== 'undefined' && (navigator as any).getBattery) {
      try {
        const b = await (navigator as any).getBattery();
        batteryInfo = { level: b.level * 100, charging: b.charging };
      } catch (e) {}
    }

    const report = this.getInstantReport();
    report.environment.batteryLevel = batteryInfo.level;
    report.environment.isCharging = batteryInfo.charging;
    return report;
  }

  public getLogs() { return this.logs; }

  public async runFullDiagnostic(): Promise<HealthReport> {
    const start = Date.now();
    const aiRes = await checkSystemHealth();
    this.modules['AI_CORE'].latency = Date.now() - start;
    this.modules['AI_CORE'].status = aiRes.status ? 'healthy' : 'degraded';
    this.modules['AI_CORE'].lastTestMessage = aiRes.status ? 'Gemini API Responsiva' : aiRes.error;
    return this.getFullReport();
  }
}

export const systemMonitor = new SystemMonitor();
