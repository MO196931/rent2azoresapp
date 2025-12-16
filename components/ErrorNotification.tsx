import React from 'react';

interface ErrorNotificationProps {
  message: string;
  isFatal?: boolean;
  onRetry: () => void;
  onDismiss: () => void;
  onContactSupport: () => void;
}

const ErrorNotification: React.FC<ErrorNotificationProps> = ({ message, isFatal, onRetry, onDismiss, onContactSupport }) => {
  return (
    <div className={`fixed bottom-6 right-6 max-w-md w-full bg-white dark:bg-slate-800 border-l-4 shadow-2xl rounded-r-lg z-[60] animate-[slideIn_0.3s_ease-out] overflow-hidden ${isFatal ? 'border-red-600' : 'border-amber-500'}`}>
      <div className="p-5 flex items-start gap-4">
        <div className={`shrink-0 ${isFatal ? 'text-red-600' : 'text-amber-500'}`}>
          {isFatal ? (
             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
               <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
             </svg>
          ) : (
             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
               <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
             </svg>
          )}
        </div>
        <div className="flex-1">
          <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
            {isFatal ? 'Erro Crítico do Sistema' : 'Atenção Necessária'}
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
            {message}
          </p>
          <div className="flex flex-wrap gap-2">
            <button 
              onClick={onRetry}
              className={`px-4 py-2 text-xs font-bold rounded text-white shadow-sm transition-transform active:scale-95 ${isFatal ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'}`}
            >
              Tentar Novamente
            </button>
            
            <button 
              onClick={onContactSupport}
              className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 text-xs font-bold rounded transition-colors"
            >
              Contactar Suporte
            </button>

            {!isFatal && (
              <button 
                onClick={onDismiss}
                className="px-3 py-2 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-xs font-semibold underline decoration-dotted"
              >
                Ignorar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ErrorNotification;