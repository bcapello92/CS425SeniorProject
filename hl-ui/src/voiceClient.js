import { VOICE_BASE } from "./config";

function voiceHttpBase() {
  return VOICE_BASE || "http://127.0.0.1:8003";
}

function resolveBaseUrl(base) {
  if (/^https?:\/\//i.test(base)) return base;
  const origin =
    typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:5173";
  return new URL(base || "/", origin).toString().replace(/\/$/, "");
}

function voiceWebSocketUrl() {
  const httpBase = resolveBaseUrl(voiceHttpBase());
  const url = new URL(`${httpBase}/ws/voice-stream`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

function floatTo16BitPCM(float32Array) {
  const pcm = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, float32Array[i]));
    pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return new Uint8Array(pcm.buffer);
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return window.btoa(binary);
}

export class VoiceStreamRecorder {
  constructor({ onPartial, onFinal, onError, questionText }) {
    this.onPartial = onPartial;
    this.onFinal = onFinal;
    this.onError = onError;
    this.questionText = questionText || "Voice input";
    this.ws = null;
    this.stream = null;
    this.audioContext = null;
    this.source = null;
    this.processor = null;
    this.started = false;
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.source = this.audioContext.createMediaStreamSource(this.stream);
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

    this.ws = new WebSocket(voiceWebSocketUrl());

    await new Promise((resolve, reject) => {
      const cleanup = () => {
        this.ws?.removeEventListener("open", onOpen);
        this.ws?.removeEventListener("error", onError);
      };

      const onOpen = () => {
        cleanup();
        resolve();
      };
      const onError = (event) => {
        cleanup();
        reject(event);
      };

      this.ws.addEventListener("open", onOpen);
      this.ws.addEventListener("error", onError);
    });

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "partial" && data.recognized_text) {
          this.onPartial?.(data.recognized_text);
        }
        if (data.type === "final_transcript") {
          this.ws?.close();
          this.onFinal?.(data.recognized_text || data.patient_text || "");
        }
        if (data.type === "error") {
          this.ws?.close();
          this.onError?.(data.message || "Voice service error");
        }
      } catch (error) {
        this.onError?.(String(error));
      }
    };

    this.ws.send(
      JSON.stringify({
        type: "start",
        sample_rate: this.audioContext.sampleRate,
        question_text: this.questionText,
      })
    );

    this.processor.onaudioprocess = (event) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.started) return;
      const inputData = event.inputBuffer.getChannelData(0);
      const pcmBytes = floatTo16BitPCM(inputData);
      this.ws.send(
        JSON.stringify({
          type: "chunk",
          audio_base64: bytesToBase64(pcmBytes),
        })
      );
    };

    this.source.connect(this.processor);
    this.processor.connect(this.audioContext.destination);
    this.started = true;
  }

  async stop() {
    if (this.started && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "stop" }));
    }
    this.started = false;
    this.processor?.disconnect();
    this.source?.disconnect();
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
    }
    await this.audioContext?.close();
  }
}

export function voiceFeatureAvailable() {
  return (
    typeof window !== "undefined" &&
    !!window.navigator?.mediaDevices?.getUserMedia &&
    !!window.WebSocket &&
    !!(window.AudioContext || window.webkitAudioContext)
  );
}
