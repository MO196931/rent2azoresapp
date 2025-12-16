export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

export async function decodeAudioData(
  data: Uint8Array | ArrayBuffer,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1
): Promise<AudioBuffer> {
  let dataInt16: Int16Array;
  if (data instanceof Uint8Array) {
      dataInt16 = new Int16Array(data.buffer, data.byteOffset, data.byteLength / 2);
  } else {
      dataInt16 = new Int16Array(data);
  }

  const frameCount = dataInt16.length / numChannels;
  const outputBuffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = outputBuffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return outputBuffer;
}

export function createPcmBlob(data: Float32Array, sampleRate: number = 16000): { data: string; mimeType: string } {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    // Clamp values to [-1, 1] before scaling
    const s = Math.max(-1, Math.min(1, data[i]));
    int16[i] = s * 32767;
  }
  return {
    data: arrayBufferToBase64(int16.buffer),
    mimeType: `audio/pcm;rate=${sampleRate}`,
  };
}