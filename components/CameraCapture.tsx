
import React, { useRef, useState, useCallback } from 'react';

interface CameraCaptureProps {
  onCapture: (dataUrl: string, type: 'image' | 'video') => void;
  label: string;
  mode?: 'photo' | 'video';
}

const CameraCapture: React.FC<CameraCaptureProps> = ({ onCapture, label, mode = 'photo' }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  
  const [isStreaming, setIsStreaming] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'environment' },
          audio: mode === 'video' 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsStreaming(true);
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      alert("Não foi possível acessar a câmera/microfone.");
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setIsStreaming(false);
      setIsRecording(false);
    }
  };

  const takePhoto = useCallback(() => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg');
        onCapture(dataUrl, 'image');
        stopCamera();
      }
    }
  }, [onCapture]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        onCapture(dataUrl, file.type.startsWith('video') ? 'video' : 'image');
      };
      reader.readAsDataURL(file);
    }
  };

  const startRecording = () => {
      if (videoRef.current && videoRef.current.srcObject) {
          const stream = videoRef.current.srcObject as MediaStream;
          const recorder = new MediaRecorder(stream);
          mediaRecorderRef.current = recorder;
          chunksRef.current = [];

          recorder.ondataavailable = (e) => {
              if (e.data.size > 0) chunksRef.current.push(e.data);
          };

          recorder.onstop = () => {
              const blob = new Blob(chunksRef.current, { type: 'video/webm' });
              const reader = new FileReader();
              reader.readAsDataURL(blob);
              reader.onloadend = () => {
                  const base64 = (reader.result as string);
                  onCapture(base64, 'video');
                  stopCamera();
              };
          };

          recorder.start();
          setIsRecording(true);
          
          let timeLeft = 15;
          setCountdown(timeLeft);
          const timer = setInterval(() => {
              timeLeft -= 1;
              setCountdown(timeLeft);
              if (timeLeft <= 0) {
                  clearInterval(timer);
                  stopRecording();
              }
          }, 1000);
      }
  };

  const stopRecording = () => {
      if (mediaRecorderRef.current && isRecording) {
          mediaRecorderRef.current.stop();
          setIsRecording(false);
      }
  };

  return (
    <div className="mb-6">
      <p className="font-bold text-slate-700 dark:text-slate-300 mb-3 text-xs uppercase tracking-wide">{label}</p>
      <div className="relative bg-slate-100 dark:bg-black rounded-2xl overflow-hidden aspect-video flex flex-col items-center justify-center shadow-inner border-2 border-slate-200 dark:border-slate-800">
        {!isStreaming && (
           <div className="flex flex-col gap-3 items-center">
             <button 
               onClick={startCamera} 
               className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl flex items-center gap-3 font-bold transition-all shadow-lg active:scale-95"
             >
               <span className="text-xl">{mode === 'photo' ? '📷' : '📹'}</span>
               <span className="text-sm">Usar Câmara</span>
             </button>
             <button 
               onClick={() => fileInputRef.current?.click()}
               className="bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-6 py-3 rounded-xl flex items-center gap-3 font-bold transition-all border dark:border-slate-700 text-sm shadow-sm active:scale-95"
             >
               <span>📁</span>
               <span>Upload Ficheiro</span>
             </button>
             <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                className="hidden" 
                accept={mode === 'photo' ? 'image/*' : 'video/*,image/*'}
             />
           </div>
        )}
        <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            muted={mode === 'photo'}
            className={`w-full h-full object-cover ${!isStreaming ? 'hidden' : ''}`} 
        />
        <canvas ref={canvasRef} className="hidden" />
        
        {isStreaming && (
            <div className="absolute bottom-6 left-0 right-0 flex flex-col items-center gap-3">
                 {mode === 'photo' ? (
                     <button 
                        onClick={takePhoto} 
                        className="w-16 h-16 bg-white rounded-full border-4 border-slate-200 shadow-2xl hover:scale-110 active:scale-95 transition-transform"
                     ></button>
                 ) : (
                     <button 
                        onClick={isRecording ? stopRecording : startRecording}
                        className={`w-16 h-16 rounded-full border-4 border-white shadow-2xl flex items-center justify-center transition-all ${isRecording ? 'bg-red-600 scale-110 animate-pulse' : 'bg-red-500 hover:scale-105'}`}
                     >
                         {isRecording && <div className="w-6 h-6 bg-white rounded-sm"></div>}
                     </button>
                 )}
                 {isRecording && <span className="text-white font-mono font-bold bg-red-600 px-3 py-1 rounded-full text-xs shadow-md">{countdown}s</span>}
            </div>
        )}
        
        {isStreaming && (
            <button onClick={stopCamera} className="absolute top-4 right-4 bg-black/60 text-white p-2 rounded-full hover:bg-black/80 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        )}
      </div>
    </div>
  );
};

export default CameraCapture;
