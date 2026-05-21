import { useCallback, useRef } from "react";

// Gera um beep de alerta usando Web Audio API (sem necessidade de arquivo externo)
function createAlertSound(ctx: AudioContext): void {
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(880, ctx.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);

  gainNode.gain.setValueAtTime(0.4, ctx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

  oscillator.start(ctx.currentTime);
  oscillator.stop(ctx.currentTime + 0.5);

  // Segundo beep
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.connect(gain2);
  gain2.connect(ctx.destination);
  osc2.type = "sine";
  osc2.frequency.setValueAtTime(880, ctx.currentTime + 0.6);
  osc2.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.9);
  gain2.gain.setValueAtTime(0.4, ctx.currentTime + 0.6);
  gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.1);
  osc2.start(ctx.currentTime + 0.6);
  osc2.stop(ctx.currentTime + 1.1);
}

export function useAlertSound() {
  const audioCtxRef = useRef<AudioContext | null>(null);

  const playAlert = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") {
        ctx.resume().then(() => createAlertSound(ctx));
      } else {
        createAlertSound(ctx);
      }
    } catch (e) {
      console.warn("[AlertSound] Could not play alert:", e);
    }
  }, []);

  return { playAlert };
}
