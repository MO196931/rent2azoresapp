import React, { useRef, useState, useCallback } from 'react';

interface CameraCaptureProps {
  onCapture: (dataUrl: string, type: 'image' | 'video') => void;
  label: string;
  mode?: 'photo' | 'video';
}

const CameraCapture: React.FC<CameraCaptureProps> = ({ onCapture, label, mode = 'photo' }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
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
                  const base64 = (reader.result as string); // Includes data:video/webm;base64,...
                  onCapture(base64, 'video');
                  stopCamera();
              };
          };

          recorder.start();
          setIsRecording(true);
          
          // Auto-stop after 15 seconds to prevent huge files in browser memory
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
      <p className="font-bold text-slate-700 dark:text-slate-300 mb-3 text-sm uppercase tracking-wide">{label}</p>
      <div className="relative bg-black rounded-2xl overflow-hidden aspect-video flex items-center justify-center shadow-lg border-2 border-slate-800">
        {!isStreaming && (
           <button 
             onClick={startCamera} 
             className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-full flex items-center gap-3 font-bold transition-all shadow-xl hover:scale-105"
           >
             <span className="text-2xl">{mode === 'photo' ? '📷' : '📹'}</span>
             <span>{mode === 'photo' ? 'Abrir Câmara' : 'Gravar Vídeo'}</span>
           </button>
        )}
        <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            muted={mode === 'photo'} // Mute preview if photo to avoid feedback, unmute for video if needed (usually better muted locally)
            className={`w-full h-full object-cover ${!isStreaming ? 'hidden' : ''}`} 
        />
        <canvas ref={canvasRef} className="hidden" />
        
        {isStreaming && (
            <div className="absolute bottom-6 left-0 right-0 flex flex-col items-center gap-3">
                 {mode === 'photo' ? (
                     <button 
                        onClick={takePhoto} 
                        className="w-20 h-20 bg-white rounded-full border-4 border-slate-200 shadow-2xl hover:scale-110 active:scale-95 transition-transform"
                     ></button>
                 ) : (
                     <button 
                        onClick={isRecording ? stopRecording : startRecording}
                        className={`w-20 h-20 rounded-full border-4 border-white shadow-2xl flex items-center justify-center transition-all ${isRecording ? 'bg-red-600 scale-110 animate-pulse' : 'bg-red-500 hover:scale-105'}`}
                     >
                         {isRecording && <div className="w-8 h-8 bg-white rounded-sm"></div>}
                     </button>
                 )}
                 {isRecording && <span className="text-white font-mono font-bold bg-red-600 px-3 py-1 rounded-full text-sm shadow-md">{countdown}s</span>}
            </div>
        )}
        
        {isStreaming && (
            <button onClick={stopCamera} className="absolute top-4 right-4 bg-black/60 text-white p-3 rounded-full hover:bg-black/80 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        )}
      </div>
    </div>
  );
};

export default CameraCapture;