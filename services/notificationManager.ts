
export type NotificationType = 'email' | 'push' | 'sms' | 'system';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: number;
}

class NotificationManager {
  private permission: NotificationPermission = 'default';

  constructor() {
    if ('Notification' in window) {
      this.permission = Notification.permission;
    }
  }

  public async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) return false;
    
    try {
      const permission = await Notification.requestPermission();
      this.permission = permission;
      return permission === 'granted';
    } catch (e) {
      console.error("Notification permission error", e);
      return false;
    }
  }

  public sendNativePush(title: string, body: string) {
    if (this.permission === 'granted') {
      try {
        new Notification(title, {
          body: body,
          icon: 'https://cdn-icons-png.flaticon.com/512/3202/3202926.png', // Generic car icon
          silent: false
        });
      } catch (e) {
        console.warn("Push notification failed", e);
      }
    }
  }

  // Simulates sending an email/sms by logging and returning an object for the UI to display
  public createAlert(type: NotificationType, title: string, message: string): AppNotification {
    // In a real app, this would trigger an API call to SendGrid/Twilio/N8N
    console.log(`[${type.toUpperCase()}] Sending to ${title}: ${message}`);
    
    // If it's a critical update, try to send a native push as well
    if (type === 'push' || type === 'system') {
        this.sendNativePush(title, message);
    }

    return {
      id: Date.now().toString() + Math.random(),
      type,
      title,
      message,
      timestamp: Date.now()
    };
  }
}

export const notificationManager = new NotificationManager();
