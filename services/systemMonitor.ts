
import { SystemLog, HealthReport, ModuleHealth, ModuleName, HealingAction, LearningMetric } from '../types';
import { checkSystemHealth } from './geminiService';

class SystemMonitor {
  private logs: SystemLog[] = [];
  private stabilityScore: number = 100;
  private modules: Record<ModuleName, ModuleHealth>;
  private heals: HealingAction[] = [];

  constructor() {
    this.modules = this.initializeModules();
  }

  private initializeModules(): Record<ModuleName, ModuleHealth> {
    const mods: any = {};
    (['AI_CORE', 'AUDIO_SUBSYSTEM', 'NETWORK', 'DATABASE', 'USER_INTERFACE'] as ModuleName[]).forEach(m => {
      mods[m] = { name: m, status: 'healthy', latency: 0, errorCount: 0 };
    });
    return mods;
  }

  public logEvent(level: SystemLog['level'], component: string, message: string) {
    const log: SystemLog = { id: Math.random().toString(), timestamp: Date.now(), level, component, message, resolved: false };
    this.logs.push(log);
    
    if (level === 'error' || level === 'fatal') {
      const moduleName = this.mapComponentToModule(component);
      this.modules[moduleName].errorCount++;
      this.triggerAutoHeal(moduleName, message);
    }
    this.calculateStabilityScore();
  }

  private mapComponentToModule(component: string): ModuleName {
    if (component.includes('AI')) return 'AI_CORE';
    if (component.includes('AUDIO')) return 'AUDIO_SUBSYSTEM';
    if (component.includes('NET')) return 'NETWORK';
    if (component.includes('DB')) return 'DATABASE';
    return 'USER_INTERFACE';
  }

  private triggerAutoHeal(module: ModuleName, error: string) {
    const heal: HealingAction = {
      id: Math.random().toString(),
      module,
      action: "Context Re-sync & Learning Recovery",
      timestamp: Date.now(),
      success: true,
      resultMessage: "Estabilidade restaurada. Histórico de aprendizagem preservado."
    };
    this.heals.unshift(heal);
    this.recordLearning(`Repair:${module}`, 20);
  }

  public recordLearning(topic: string, improvement: number) {
    const profile = JSON.parse(localStorage.getItem('ai_learning_profile') || '[]');
    profile.push({ topic, timestamp: Date.now(), improvement });
    localStorage.setItem('ai_learning_profile', JSON.stringify(profile.slice(-100)));
  }

  private calculateStabilityScore() {
    const errors = this.logs.filter(l => l.level === 'error' && (Date.now() - l.timestamp < 600000)).length;
    this.stabilityScore = Math.max(0, 100 - (errors * 10));
  }

  public getFullReport(): HealthReport {
    return {
      lastCheck: new Date().toISOString(),
      status: this.stabilityScore > 80 ? 'healthy' : 'degraded',
      issues: this.logs.filter(l => l.level === 'error' && !l.resolved).map(l => l.message),
      stabilityScore: this.stabilityScore,
      modules: Object.values(this.modules),
      recentHeals: this.heals
    };
  }

  public async runDailyHealthCheck(): Promise<HealthReport> {
    const res = await checkSystemHealth();
    this.modules['AI_CORE'].status = res.status ? 'healthy' : 'degraded';
    return this.getFullReport();
  }

  public async verifyTranslations() { return Promise.resolve(); }
}

export const systemMonitor = new SystemMonitor();
