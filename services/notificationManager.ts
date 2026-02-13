
export type NotificationType = 'email' | 'push' | 'sms' | 'system' | 'whatsapp';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: number;
}

class NotificationManager {
  private permission: NotificationPermission = 'default';
  private listeners: ((n: AppNotification) => void)[] = [];

  constructor() {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      this.permission = Notification.permission;
    }
  }

  public subscribe(callback: (n: AppNotification) => void) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  public async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) return false;
    try {
      const permission = await Notification.requestPermission();
      this.permission = permission;
      return permission === 'granted';
    } catch (e) {
      return false;
    }
  }

  public createAlert(type: NotificationType, title: string, message: string): AppNotification {
    const note: AppNotification = {
      id: `${Date.now()}-${Math.random()}`,
      type,
      title,
      message,
      timestamp: Date.now()
    };

    if (type === 'whatsapp' || type === 'email') {
      console.log(`[GATEWAY OUT] ${type.toUpperCase()}: ${message}`);
    }

    this.listeners.forEach(l => l(note));
    return note;
  }
}

export const notificationManager = new NotificationManager();
