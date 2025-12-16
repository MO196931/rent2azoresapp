
import React, { useEffect, useState } from 'react';
import { AppNotification } from '../services/notificationManager';

interface ToastSystemProps {
  notifications: AppNotification[];
  onRemove: (id: string) => void;
}

const ToastSystem: React.FC<ToastSystemProps> = ({ notifications, onRemove }) => {
  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-3 pointer-events-none">
      {notifications.map((note) => (
        <ToastItem key={note.id} note={note} onRemove={onRemove} />
      ))}
    </div>
  );
};

const ToastItem: React.FC<{ note: AppNotification; onRemove: (id: string) => void }> = ({ note, onRemove }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Trigger enter animation
    requestAnimationFrame(() => setIsVisible(true));

    // Auto dismiss after 5 seconds
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => onRemove(note.id), 300); // Wait for exit animation
    }, 5000);

    return () => clearTimeout(timer);
  }, [note.id, onRemove]);

  const getIcon = () => {
    switch (note.type) {
      case 'email': return '📧';
      case 'sms': return '💬';
      case 'push': return '🔔';
      case 'system': return '⚙️';
      default: return 'ℹ️';
    }
  };

  const getColors = () => {
    switch (note.type) {
      case 'email': return 'bg-blue-600 border-blue-500';
      case 'sms': return 'bg-green-600 border-green-500';
      case 'push': return 'bg-indigo-600 border-indigo-500';
      case 'system': return 'bg-slate-700 border-slate-600';
      default: return 'bg-slate-800 border-slate-700';
    }
  };

  return (
    <div 
      className={`
        pointer-events-auto w-80 p-4 rounded-xl shadow-2xl border flex items-start gap-3 text-white transition-all duration-300 transform
        ${getColors()}
        ${isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}
      `}
    >
      <div className="text-2xl">{getIcon()}</div>
      <div className="flex-1">
        <h4 className="font-bold text-sm mb-1">{note.title}</h4>
        <p className="text-xs text-slate-100 leading-relaxed opacity-90">{note.message}</p>
      </div>
      <button 
        onClick={() => { setIsVisible(false); setTimeout(() => onRemove(note.id), 300); }}
        className="text-white/50 hover:text-white"
      >
        ✕
      </button>
    </div>
  );
};

export default ToastSystem;
