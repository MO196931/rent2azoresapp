import React, { useRef, useState, useEffect } from 'react';

interface SignaturePadProps {
  onSave: (dataUrl: string) => void;
}

const SignaturePad: React.FC<SignaturePadProps> = ({ onSave }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  // Resize canvas on window resize to maintain responsiveness
  const updateCanvasSize = () => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (canvas && container) {
      // Get the display size from the container's CSS
      const displayWidth = container.clientWidth;
      const displayHeight = container.clientHeight;

      // Check if resolution needs update to avoid clearing content unnecessarily
      if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
          // Save current content
          const dataUrl = hasSignature ? canvas.toDataURL() : null;
          
          // Set actual resolution to match display size (1:1 mapping)
          canvas.width = displayWidth;
          canvas.height = displayHeight;
          
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.strokeStyle = '#000'; // Black ink handles better for PDF documents
            ctx.lineWidth = 3; 
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            
            // Restore content if it existed
            if (dataUrl) {
                const img = new Image();
                img.src = dataUrl;
                img.onload = () => ctx.drawImage(img, 0, 0);
            }
          }
      }
    }
  };

  useEffect(() => {
    window.addEventListener('resize', updateCanvasSize);
    // Slight delay to ensure layout is computed
    setTimeout(updateCanvasSize, 100); 
    return () => window.removeEventListener('resize', updateCanvasSize);
  }, [hasSignature]);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;
    
    if ('touches' in e) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else {
        clientX = (e as React.MouseEvent).clientX;
        clientY = (e as React.MouseEvent).clientY;
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    const pos = getPos(e);
    const ctx = canvasRef.current?.getContext('2d');
    ctx?.beginPath();
    ctx?.moveTo(pos.x, pos.y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    
    // Prevent default to stop scrolling on mobile while signing
    // This is handled by CSS touch-action: none, but good to keep in mind
    
    const pos = getPos(e);
    const ctx = canvasRef.current?.getContext('2d');
    ctx?.lineTo(pos.x, pos.y);
    ctx?.stroke();
    if (!hasSignature) setHasSignature(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        setHasSignature(false);
    }
  };

  const save = () => {
    if (canvasRef.current && hasSignature) {
      onSave(canvasRef.current.toDataURL());
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 w-full max-w-md mx-auto transition-colors duration-300">
      <div className="mb-4 flex justify-between items-end">
          <h3 className="text-sm font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
            Área de Assinatura
          </h3>
      </div>
      
      {/* 
         Fixed height container (h-48 = 192px). 
         We force bg-white even in dark mode to mimic paper, as the ink is black.
         Border colors adjusted for visibility against dark background.
      */}
      <div 
        ref={containerRef} 
        className="h-48 w-full bg-white rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 touch-none overflow-hidden relative cursor-crosshair hover:border-blue-500 transition-colors"
      >
        {!hasSignature && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-slate-400 text-2xl font-handwriting select-none opacity-80">
                    Assine aqui
                </span>
            </div>
        )}
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="block w-full h-full"
        />
      </div>
      
      <div className="mt-6 flex gap-4">
        <button 
            onClick={clear} 
            className="flex-1 px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-white rounded-lg font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors text-sm border border-slate-200 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-400"
        >
            Limpar
        </button>
        <button 
            onClick={save} 
            disabled={!hasSignature}
            className="flex-[2] px-4 py-3 bg-blue-600 text-white rounded-lg font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700 shadow-lg transition-all text-sm flex justify-center items-center gap-2 transform active:scale-95 focus:outline-none focus:ring-4 focus:ring-blue-300"
        >
            <span>✅</span> Confirmar Assinatura
        </button>
      </div>
    </div>
  );
};

export default SignaturePad;