'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type RecorderState = 'idle' | 'recording' | 'transcribing';
const BARS = 24;

/** Grava a voz no navegador e transcreve-a com o Whisper da Groq (/api/transcribe). */
export function useRecorder({ language, onText, onError }: { language: 'pt' | 'en'; onText: (text: string) => void; onError: (message: string) => void }) {
  const [state, setState] = useState<RecorderState>('idle');
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0));
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const cancelled = useRef(false);
  const cleanup = useRef<() => void>(() => {});

  const stopTracks = useCallback(() => { cleanup.current(); cleanup.current = () => {}; }, []);
  useEffect(() => stopTracks, [stopTracks]);

  const start = useCallback(async () => {
    if (state !== 'idle') return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return onError('Este navegador não permite gravar áudio.');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      return onError('Sem acesso ao microfone. Dá permissão nas definições do navegador.');
    }

    // Barras do nível do som, para se ver que está a ouvir.
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    context.createMediaStreamSource(stream).connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const history = Array(BARS).fill(0);
    let frame = 0;
    let last = 0;
    const startedAt = performance.now();
    const tick = (now: number) => {
      if (now - last > 70) {
        last = now;
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
        history.shift();
        history.push(Math.min(1, peak / 64));
        setLevels([...history]);
        setSeconds(Math.floor((now - startedAt) / 1000));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    cleanup.current = () => { cancelAnimationFrame(frame); stream.getTracks().forEach((t) => t.stop()); context.close().catch(() => {}); };

    const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    chunks.current = [];
    cancelled.current = false;
    rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
    rec.onstop = async () => {
      stopTracks();
      setLevels(Array(BARS).fill(0));
      setSeconds(0);
      if (cancelled.current || !chunks.current.length) return setState('idle');
      // Uma gravação de um instante não tem som que se transcreva, e a Groq recusa-a.
      if (performance.now() - startedAt < 700) { onError('Mantém a gravação um pouco mais, pelo menos um segundo.'); return setState('idle'); }
      setState('transcribing');
      try {
        const form = new FormData();
        const type = (rec.mimeType || 'audio/webm').split(';')[0];
        form.append('audio', new Blob(chunks.current, { type }), type === 'audio/mp4' ? 'audio.m4a' : 'audio.webm');
        form.append('language', language);
        const response = await fetch('/api/transcribe', { method: 'POST', body: form });
        const result = (await response.json()) as { text?: string; error?: string };
        if (!response.ok) throw new Error(result.error || 'Não foi possível transcrever.');
        if (result.text) onText(result.text);
        else onError('Não se ouviu nada. Tenta outra vez, mais perto do microfone.');
      } catch (error) {
        onError(error instanceof Error ? error.message : 'Não foi possível transcrever.');
      } finally {
        setState('idle');
      }
    };
    rec.start(250);
    recorder.current = rec;
    setState('recording');
  }, [state, language, onText, onError, stopTracks]);

  const finish = useCallback(() => { if (recorder.current?.state === 'recording') recorder.current.stop(); }, []);
  const cancel = useCallback(() => { cancelled.current = true; finish(); }, [finish]);

  return { state, levels, seconds, start, finish, cancel };
}
