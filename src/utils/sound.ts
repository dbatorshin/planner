/**
 * Sound Engine & Notification manager for Planner
 * Features natural morning birdsong & acoustic instrumental stereo tracks (44.1kHz Stereo MP3).
 */
import type { SoundTrackId } from '../types';

export interface SoundTrackInfo {
  id: SoundTrackId;
  title: string;
  subtitle: string;
  icon: string;
}

export const SOUND_TRACKS: SoundTrackInfo[] = [
  {
    id: 'morning_sunrise',
    title: 'Восход солнца',
    subtitle: 'Акустическая гитара + утренние птицы, стерео',
    icon: '🌅',
  },
  {
    id: 'june_songbirds',
    title: 'Пение птиц на рассвете',
    subtitle: 'Живые лесные певчие птицы, стерео',
    icon: '🐦',
  },
  {
    id: 'spring_day_forest',
    title: 'Весенний лес',
    subtitle: 'Лесные птицы у ручья и шелест листвы, стерео',
    icon: '🍃',
  },
];

class SoundEngine {
  private ctx: AudioContext | null = null;
  private currentAudio: HTMLAudioElement | null = null;

  private initContext() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  /**
   * Resolves absolute audio path accounting for Vite base path
   */
  private getSoundPath(trackId: SoundTrackId): string {
    const base = (typeof window !== 'undefined' && (import.meta as any).env?.BASE_URL) || '/';
    const cleanBase = base.endsWith('/') ? base : `${base}/`;
    return `${cleanBase}sounds/${trackId}.mp3`;
  }

  /**
   * Plays the selected natural stereo audio track
   */
  public playTaskFinishedAlarm(trackId: SoundTrackId = 'morning_sunrise') {
    this.stopAlarm();

    try {
      if (typeof Audio !== 'undefined') {
        const primaryPath = this.getSoundPath(trackId);
        const audio = new Audio(primaryPath);
        audio.volume = 1.0;
        this.currentAudio = audio;

        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            console.warn('Audio play from primary path failed, trying relative path:', err);
            const fallbackAudio = new Audio(`./sounds/${trackId}.mp3`);
            fallbackAudio.volume = 1.0;
            this.currentAudio = fallbackAudio;
            fallbackAudio.play().catch(() => {
              this.playProceduralNatureHarp();
            });
          });
        }
      } else {
        this.playProceduralNatureHarp();
      }
    } catch {
      this.playProceduralNatureHarp();
    }

    // Vibration pattern if supported
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([150, 100, 200, 100, 300]);
      } catch {}
    }
  }

  /**
   * Preview a specific soundtrack (e.g. from Settings)
   */
  public previewSound(trackId: SoundTrackId) {
    this.playTaskFinishedAlarm(trackId);
  }

  /**
   * Stops currently playing alarm audio
   */
  public stopAlarm() {
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
      } catch {}
      this.currentAudio = null;
    }
  }

  /**
   * Procedural Web Audio fallback: Soft gentle acoustic harp arpeggio
   */
  private playProceduralNatureHarp() {
    try {
      this.initContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      // Soft musical arpeggio in C Major 9
      const harpNotes = [
        { freq: 261.63, delay: 0.1 },  // C4
        { freq: 329.63, delay: 0.35 }, // E4
        { freq: 392.00, delay: 0.6 },  // G4
        { freq: 493.88, delay: 0.85 }, // B4
        { freq: 587.33, delay: 1.1 },  // D5
        { freq: 523.25, delay: 1.6 },  // C5
        { freq: 659.25, delay: 1.85 }, // E5
        { freq: 783.99, delay: 2.1 },  // G5
        { freq: 1046.5, delay: 2.4 },  // C6 chime
      ];

      harpNotes.forEach((n) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(n.freq, now + n.delay);

        gain.gain.setValueAtTime(0, now + n.delay);
        gain.gain.linearRampToValueAtTime(0.25, now + n.delay + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + n.delay + 1.8);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now + n.delay);
        osc.stop(now + n.delay + 1.85);
      });
    } catch {}
  }

  /**
   * Soft click / feedback for start, pause and resume
   */
  public playClick(type: 'start' | 'pause' | 'resume' | 'complete' = 'start') {
    try {
      this.initContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      if (type === 'start') {
        osc.frequency.setValueAtTime(350, now);
        osc.frequency.exponentialRampToValueAtTime(600, now + 0.16);
      } else if (type === 'pause') {
        osc.frequency.setValueAtTime(480, now);
        osc.frequency.exponentialRampToValueAtTime(320, now + 0.14);
      } else if (type === 'resume') {
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(540, now + 0.16);
      } else {
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.2);
      }

      osc.type = 'sine';
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.22);
    } catch {}
  }
}

export const sound = new SoundEngine();

/**
 * Request notification permission from browser
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  if (Notification.permission === 'granted') {
    return true;
  }
  if (Notification.permission !== 'denied') {
    const res = await Notification.requestPermission();
    return res === 'granted';
  }
  return false;
}

/**
 * Triggers a desktop/OS push notification if allowed
 */
export function sendSystemNotification(title: string, options?: NotificationOptions) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    try {
      new Notification(title, {
        icon: './icon-192.png',
        badge: './favicon.svg',
        ...options,
      });
    } catch (e) {
      console.warn('Could not display system notification:', e);
    }
  }
}
