import React from 'react';

interface TooltipProps {
  text: string;
  children: React.ReactNode;
  className?: string;
  position?: 'top' | 'bottom';
}

const Tooltip: React.FC<TooltipProps> = ({ text, children, className = '', position = 'top' }) => {
  return (
    <div className={`group relative flex flex-col items-center ${className}`}>
      {children}
      {/* 
         Dynamic positioning:
         - Top: bottom-full mb-2
         - Bottom: top-full mt-2
         z-index 9999 ensures visibility over sticky headers and modals 
      */}
      <div className={`absolute ${position === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'} hidden flex-col items-center group-hover:flex w-max max-w-[200px] z-[9999] pointer-events-none animate-fade-in`}>
        
        {/* Arrow for Bottom Position (Points Up) */}
        {position === 'bottom' && (
            <div className="w-3 h-3 -mb-1.5 rotate-45 bg-slate-900 border-t border-l border-slate-600 z-[9998]"></div>
        )}

        {/* The Text Bubble */}
        <span className="relative z-[9999] p-2 text-xs font-bold leading-tight text-white bg-slate-900 rounded-lg shadow-[0_0_15px_rgba(0,0,0,0.5)] border border-slate-600 text-center whitespace-normal drop-shadow-lg">
          {text}
        </span>

        {/* Arrow for Top Position (Points Down) */}
        {position === 'top' && (
            <div className="w-3 h-3 -mt-1.5 rotate-45 bg-slate-900 border-b border-r border-slate-600 z-[9998]"></div>
        )}
      </div>
    </div>
  );
};

export default Tooltip;