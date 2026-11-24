import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { format, isToday } from 'date-fns';
import type {
  AppData,
  TaskTemplate,
  DayOfWeek,
  DayLog,
  DayTaskOverride,
  TaskProgressState,
  UserAccount,
  ViewMode,
  ThemeId,
} from '../types';
import { storage } from '../services/storage';
import {
  pushToCloud,
  fetchFromCloud,
  syncWithCloud,
  mergeAppData,
} from '../services/supabase';
import {
  timeToMinutes,
  minutesToTime,
  addMinutesToTime,
  getDurationMinutes,
  getCurrentTimeString,
  formatDuration,
} from '../utils/time';
import { sound, sendSystemNotification } from '../utils/sound';
import { haptic } from '../utils/haptics';
import { fireConfetti } from '../utils/confetti';

export interface EffectiveTask extends TaskTemplate {
  effectiveStartTime: string;
  effectiveEndTime: string;
  effectiveDurationMinutes: number;
  basePlannedDurationMinutes: number; // Original intended work duration (e.g. 4h 0m)
  isOverridden: boolean;
  isCompleted: boolean;
  completedAt?: string;
  // Live run state
  status: 'idle' | 'running' | 'paused' | 'completed';
  workedSeconds: number;
  remainingSeconds: number; // Planned duration - actual worked seconds
  pausedElapsedSeconds: number; // Seconds spent in current pause
  plannedDurationSeconds: number;
}

interface PlannerContextType {
  appData: AppData;
  selectedDate: Date;
  selectedDateStr: string;
  isCurrentToday: boolean;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  setSelectedDate: (date: Date) => void;
  goToToday: () => void;
  activeTasks: EffectiveTask[];
  completedTasks: EffectiveTask[];
  allScheduledTasks: EffectiveTask[];
  currentRunningTask: EffectiveTask | null;
  dayCompletionRate: number;
  totalScheduledMinutes: number;
  completedScheduledMinutes: number;
  // Task operations
  createTask: (data: Omit<TaskTemplate, 'id' | 'createdAt' | 'order'>) => void;
  updateTask: (
    taskId: string,
    data: Partial<TaskTemplate>,
    applyToFutureDays: boolean,
    autoShiftSubsequentToday?: boolean
  ) => void;
  deleteTaskPermanently: (taskId: string) => void;
  skipTaskForDay: (taskId: string) => void;
  restoreSkippedTask: (taskId: string) => void;
  skippedTasks: EffectiveTask[];
  // Auto-sync start, pause, resume, reset & complete
  startTask: (taskId: string) => void;
  pauseTask: (taskId: string) => void;
  resumeTask: (taskId: string) => void;
  resetTask: (taskId: string) => void;
  completeTask: (taskId: string) => void;
  restoreTask: (taskId: string) => void;
  reorderTasks: (newTasks: TaskTemplate[]) => void;
  categories: string[];
  addCategory: (category: string) => void;
  deleteCategory: (category: string) => void;
  // Cloud Sync & Account
  isSyncing: boolean;
  syncStatus: 'synced' | 'syncing' | 'error' | 'idle';
  triggerSync: (
    overrideUrl?: string,
    overrideKey?: string,
    overrideAccount?: Partial<UserAccount>
  ) => Promise<{ success: boolean; message?: string }>;
  updateAccount: (updates: Partial<UserAccount>) => void;
  // Alarm
  currentAlarmTask: EffectiveTask | null;
  dismissAlarm: () => void;
  updateSettings: (newSettings: Partial<AppData['settings']>) => void;
  currentTheme: ThemeId;
  setTheme: (theme: ThemeId) => void;
  toastMessage: string | null;
  showToast: (msg: string) => void;
}

const PlannerContext = createContext<PlannerContextType | undefined>(undefined);

/**
 * Automatically cascades subsequent scheduled tasks chronologically so that:
 * 1. No tasks overlap or conflict.
 * 2. Paused and pending tasks are queued seamlessly after the active task finishes.
 * 3. Later tasks (e.g. evening tasks) keep their planned schedule unless pushed forward.
 * 4. Overnight / midnight crossing tasks wrap cleanly without clamping to 23:59.
 */
export function cascadeSchedule(
  tasks: TaskTemplate[],
  overrides: Record<string, DayTaskOverride>,
  completedTaskIds: string[],
  excludedTaskIds: string[],
  dayOfWeek: DayOfWeek,
  anchorTaskId: string,
  anchorEndTime: string,
  anchorStartTime?: string,
  progress?: Record<string, TaskProgressState>
): Record<string, DayTaskOverride> {
  const newOverrides: Record<string, DayTaskOverride> = { ...overrides };
  const anchorEndMin = timeToMinutes(anchorEndTime);
  const anchorStartMin = anchorStartTime ? timeToMinutes(anchorStartTime) : anchorEndMin;

  // If anchor task ends past midnight, chronological end on today's timeline is 1440 + anchorEndMin
  let runningEndMin = anchorEndMin < anchorStartMin ? 1440 + anchorEndMin : anchorEndMin;

  // All other tasks for today that are not completed, not excluded, and not the anchor task
  const otherTasks = tasks.filter(
    (t) =>
      t.id !== anchorTaskId &&
      t.daysOfWeek.includes(dayOfWeek) &&
      !completedTaskIds.includes(t.id) &&
      !excludedTaskIds.includes(t.id)
  );

  // Sort by template start time to preserve the user's intended chronological order
  otherTasks.sort((a, b) => {
    const diff = timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
    return diff !== 0 ? diff : (a.order || 0) - (b.order || 0);
  });

  for (const t of otherTasks) {
    const ov = newOverrides[t.id];
    const prog = progress?.[t.id];
    const curStart = ov?.startTime || t.startTime;
    const curEnd = ov?.endTime || t.endTime;
    const baseDurMin = getDurationMinutes(t.startTime, t.endTime);
    const scheduledDurMin = getDurationMinutes(curStart, curEnd);

    // If task has progress, use its planned and worked seconds to determine required remaining time
    const plannedSec = prog?.plannedDurationSeconds || (scheduledDurMin * 60) || (baseDurMin * 60);
    const workedSec = prog?.workedSeconds || 0;
    const remainingSec = Math.max(0, plannedSec - workedSec);
    const remainingMin = Math.max(1, Math.ceil(remainingSec / 60));
    const workedMin = Math.floor(workedSec / 60);

    const templateStartMin = timeToMinutes(t.startTime);

    // Earliest time the remaining portion of this task can start
    const startOfRemainingMin = Math.max(runningEndMin, templateStartMin);
    const finishMin = startOfRemainingMin + remainingMin;

    // Full scheduled window encompasses worked time plus remaining time so total window equals planned duration
    const newStartMin = startOfRemainingMin - workedMin;
    const newEndMin = finishMin;

    newOverrides[t.id] = {
      startTime: minutesToTime(newStartMin, false),
      endTime: minutesToTime(newEndMin, false),
    };
    runningEndMin = finishMin;
  }

  return newOverrides;
}

export const PlannerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [appData, setAppData] = useState<AppData>(() => storage.load());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [currentAlarmTask, setCurrentAlarmTask] = useState<EffectiveTask | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Cloud Sync state
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'error' | 'idle'>('idle');
  const isUserMutationRef = useRef<boolean>(false);
  const latestAppDataRef = useRef<AppData>(appData);
  useEffect(() => {
    latestAppDataRef.current = appData;
  }, [appData]);

  // High-accuracy 1-second tick to update real-time countdown clock and pause timer
  const [clockTick, setClockTick] = useState<number>(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setClockTick(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Save to storage whenever appData changes
  useEffect(() => {
    storage.save(appData);
  }, [appData]);

  // Current active visual theme ('midnight' | 'gold' | 'emerald')
  const currentTheme: ThemeId = appData.settings?.theme || 'midnight';

  const setTheme = useCallback((newTheme: ThemeId) => {
    isUserMutationRef.current = true;
    setAppData((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        theme: newTheme,
      },
    }));
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', currentTheme);
      document.body.setAttribute('data-theme', currentTheme);
    }
  }, [currentTheme]);

  // Cross-tab broadcast channel for instant multi-tab sync on same device
  useEffect(() => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;
    const channel = new BroadcastChannel('planner_cross_tab');
    channel.onmessage = (e) => {
      if (e.data && e.data.type === 'PLANNER_MUTATION' && e.data.payload) {
        setAppData(e.data.payload);
      }
    };
    return () => channel.close();
  }, []);

  // Toast helper
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  }, []);

  // Cloud Sync: Automatic Debounced Push to Supabase on local user mutation (200ms)
  // Using a short debounce so that pause/resume actions propagate to other devices quickly.
  useEffect(() => {
    if (!isUserMutationRef.current) return;
    if (!appData?.account?.cloudSyncEnabled || !appData?.account?.supabaseUrl || !appData?.account?.supabaseAnonKey) {
      return;
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    const timeout = setTimeout(async () => {
      setIsSyncing(true);
      setSyncStatus('syncing');
      try {
        const currentData = latestAppDataRef.current;
        const res = await pushToCloud(
          currentData,
          currentData.account.supabaseUrl,
          currentData.account.supabaseAnonKey
        );
        if (res.success && res.data) {
          isUserMutationRef.current = false;
          setAppData(res.data);
          setSyncStatus('synced');
        } else {
          setSyncStatus('error');
        }
      } catch {
        setSyncStatus('error');
      } finally {
        setIsSyncing(false);
      }
    }, 200);

    return () => clearTimeout(timeout);
  }, [appData]);

  // Manual / Auto Trigger Sync
  const triggerSync = useCallback(
    async (
      overrideUrl?: string,
      overrideKey?: string,
      overrideAccount?: Partial<UserAccount>
    ): Promise<{ success: boolean; message?: string }> => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return { success: false, message: 'Офлайн режим: изменения сохранены локально.' };
      }
      setIsSyncing(true);
      setSyncStatus('syncing');
      try {
        let currentData = latestAppDataRef.current;
        if (overrideAccount || overrideUrl || overrideKey) {
          currentData = {
            ...currentData,
            account: {
              ...currentData.account,
              ...(overrideAccount || {}),
              ...(overrideUrl ? { supabaseUrl: overrideUrl } : {}),
              ...(overrideKey ? { supabaseAnonKey: overrideKey } : {}),
            },
          };
          latestAppDataRef.current = currentData;
          storage.save(currentData);
        }

        const targetUrl = overrideUrl || currentData.account.supabaseUrl;
        const targetKey = overrideKey || currentData.account.supabaseAnonKey;

        if (!targetUrl || !targetKey) {
          setIsSyncing(false);
          setSyncStatus('idle');
          return { success: false, message: 'Укажите Supabase URL и Anon Key' };
        }

        const res = await syncWithCloud(currentData, targetUrl, targetKey);
        if (res.success && res.data) {
          isUserMutationRef.current = false;
          // Preserve local account keys and settings safely
          const finalData: AppData = {
            ...res.data,
            account: {
              ...res.data.account,
              ...currentData.account,
              supabaseUrl: targetUrl,
              supabaseAnonKey: targetKey,
              cloudSyncEnabled: true,
            },
          };
          latestAppDataRef.current = finalData;
          storage.save(finalData);
          setAppData(finalData);
          setSyncStatus('synced');
          showToast('Облачная синхронизация выполнена успешно!');
          return { success: true };
        } else {
          setSyncStatus('error');
          showToast(res.message || 'Ошибка синхронизации');
          return { success: false, message: res.message };
        }
      } catch (err: any) {
        setSyncStatus('error');
        return { success: false, message: err?.message || 'Ошибка соединения' };
      } finally {
        setIsSyncing(false);
      }
    },
    [showToast]
  );

  // Cloud Sync: Pull remote changes on mount, visibility change (screen unlock / browser focus / online)
  useEffect(() => {
    if (!appData?.account?.cloudSyncEnabled || !appData?.account?.supabaseUrl || !appData?.account?.supabaseAnonKey) {
      return;
    }

    const pullRemote = async () => {
      if (isSyncing) return;
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;

      // If user made offline changes, push them to cloud with merge!
      if (isUserMutationRef.current) {
        triggerSync();
        return;
      }

      try {
        const currentData = latestAppDataRef.current;
        const res = await fetchFromCloud(
          currentData.account.supabaseUrl,
          currentData.account.supabaseAnonKey,
          currentData.account.email
        );

        // Guard: If a user mutation happened while the fetch was in flight, do NOT overwrite with stale data
        if (isUserMutationRef.current) {
          triggerSync();
          return;
        }

        if (res.success && res.data) {
          const freshCurrentData = latestAppDataRef.current;
          const merged = mergeAppData(res.data, freshCurrentData);
          const finalMerged: AppData = {
            ...merged,
            account: {
              ...merged.account,
              ...freshCurrentData.account,
            },
          };
          // Only update local state if remote data actually contains new changes
          if (JSON.stringify(freshCurrentData) !== JSON.stringify(finalMerged)) {
            latestAppDataRef.current = finalMerged;
            storage.save(finalMerged);
            setAppData(finalMerged);
          }
          setSyncStatus('synced');
        }
      } catch {}
    };

    // Immediately pull on mount/activation
    pullRemote();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        pullRemote();
      }
    };

    const handleOnline = () => {
      pullRemote();
    };

    window.addEventListener('focus', pullRemote);
    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibility);

    // Poll every 5 s — fast enough to catch cross-device pause/resume within one poll cycle
    const interval = setInterval(pullRemote, 5000);

    return () => {
      window.removeEventListener('focus', pullRemote);
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibility);
      clearInterval(interval);
    };
  }, [appData?.account?.cloudSyncEnabled, appData?.account?.supabaseUrl, appData?.account?.supabaseAnonKey, appData?.account?.email, isSyncing, triggerSync]);

  // Startup initial sync trigger
  const startupSyncDoneRef = useRef(false);
  useEffect(() => {
    if (startupSyncDoneRef.current) return;
    if (
      appData?.account?.cloudSyncEnabled &&
      appData?.account?.supabaseUrl &&
      appData?.account?.supabaseAnonKey &&
      typeof navigator !== 'undefined' &&
      navigator.onLine
    ) {
      startupSyncDoneRef.current = true;
      triggerSync();
    }
  }, [appData?.account?.cloudSyncEnabled, appData?.account?.supabaseUrl, appData?.account?.supabaseAnonKey, triggerSync]);

  // 1-Click Sync Setup Link listener (e.g. sent from desktop to smartphone via #sync=...)
  useEffect(() => {
    try {
      const hash = window.location.hash;
      if (hash && (hash.includes('sync=') || hash.includes('sync_setup='))) {
        const match = hash.match(/(?:sync|sync_setup)=([^&]+)/);
        if (match && match[1]) {
          const jsonStr = decodeURIComponent(atob(decodeURIComponent(match[1])));
          const cfg = JSON.parse(jsonStr);
          if (cfg && cfg.u && cfg.k) {
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
            const targetUrl = cfg.u.trim();
            const targetKey = cfg.k.trim();
            const targetEmail = (cfg.e || 'user@planner.app').trim();

            const updated: AppData = {
              ...latestAppDataRef.current,
              account: {
                ...(latestAppDataRef.current.account || { email: targetEmail, displayName: 'Пользователь', cloudSyncEnabled: true }),
                supabaseUrl: targetUrl,
                supabaseAnonKey: targetKey,
                cloudSyncEnabled: true,
                email: targetEmail,
              },
            };
            latestAppDataRef.current = updated;
            storage.save(updated);
            setAppData(updated);

            showToast('Синхронизация настроена в 1 клик!');
            setTimeout(() => {
              triggerSync(targetUrl, targetKey, {
                supabaseUrl: targetUrl,
                supabaseAnonKey: targetKey,
                cloudSyncEnabled: true,
                email: targetEmail,
              });
            }, 300);
          }
        }
      }
    } catch (e) {
      console.warn('Could not parse sync setup hash from URL:', e);
    }
  }, [triggerSync, showToast]);

  // Update Account
  const updateAccount = useCallback((updates: Partial<UserAccount>) => {
    isUserMutationRef.current = true;
    setAppData((prev) => {
      const updated: AppData = {
        ...prev,
        account: {
          ...prev.account,
          ...updates,
        },
      };
      latestAppDataRef.current = updated;
      storage.save(updated);
      return updated;
    });
  }, []);

  const selectedDateStr = useMemo(() => format(selectedDate, 'yyyy-MM-dd'), [selectedDate]);
  const isCurrentToday = useMemo(() => isToday(selectedDate), [selectedDate]);
  const dayOfWeek = selectedDate.getDay() as DayOfWeek;

  const currentDayLog: DayLog = useMemo(() => {
    return (
      appData.history[selectedDateStr] || {
        completedTaskIds: [],
        completedAt: {},
        overrides: {},
        progress: {},
      }
    );
  }, [appData.history, selectedDateStr]);

  // Set of task IDs that already fired alarm today
  const firedAlarmsRef = useRef<Set<string>>(new Set());

  // Reset fired alarms on date change
  useEffect(() => {
    firedAlarmsRef.current.clear();
  }, [selectedDateStr]);

  // Compute all scheduled tasks with overrides and live progress (TICK DEPENDENCY IS INCLUDED!)
  const allScheduledTasks: EffectiveTask[] = useMemo(() => {
    const matchingTemplates = appData.tasks.filter((t) =>
      t.daysOfWeek.includes(dayOfWeek) &&
      !(currentDayLog.excludedTaskIds || []).includes(t.id)
    );

    const now = clockTick;

    const enriched = matchingTemplates.map((t) => {
      const override = currentDayLog.overrides?.[t.id];
      const prog = currentDayLog.progress?.[t.id];
      const isCompleted =
        Boolean(currentDayLog.completedTaskIds?.includes(t.id)) && prog?.status !== 'idle';
      const completedAt = currentDayLog.completedAt?.[t.id];

      const effectiveStartTime = override?.startTime || t.startTime;
      const effectiveEndTime = override?.endTime || t.endTime;
      const effectiveDurationMinutes = getDurationMinutes(effectiveStartTime, effectiveEndTime);
      const effectiveDurationSeconds = effectiveDurationMinutes * 60;

      // Base planned duration in seconds: either from live progress, or from the scheduled task duration
      // Guard: work quota cannot exceed the effective window duration allocated on the schedule
      let plannedDurationSeconds = prog?.plannedDurationSeconds ?? effectiveDurationSeconds;
      if (plannedDurationSeconds > effectiveDurationSeconds) {
        plannedDurationSeconds = effectiveDurationSeconds;
      }

      // Base planned duration in minutes shown in cards and summaries
      const basePlannedDurationMinutes = Math.round(plannedDurationSeconds / 60);

      let status: 'idle' | 'running' | 'paused' | 'completed' = 'idle';
      let workedSeconds = 0;
      let pausedElapsedSeconds = 0;

      if (isCompleted || prog?.status === 'completed') {
        status = 'completed';
        workedSeconds = plannedDurationSeconds;
      } else if (prog?.status === 'running') {
        status = 'running';
        workedSeconds = prog.workedSeconds || 0;
        if (prog.lastStartedTimestamp) {
          const currentStretch = Math.max(0, (now - prog.lastStartedTimestamp) / 1000);
          workedSeconds += currentStretch;
        }
      } else if (prog?.status === 'paused') {
        status = 'paused';
        workedSeconds = prog.workedSeconds || 0;
        if (prog.pausedTimestamp) {
          pausedElapsedSeconds = Math.max(0, (now - prog.pausedTimestamp) / 1000);
        }
      } else {
        status = 'idle';
        workedSeconds = 0;
      }

      // Worked seconds cannot exceed planned duration
      if (workedSeconds > plannedDurationSeconds) {
        workedSeconds = plannedDurationSeconds;
      }

      const remainingSeconds = Math.max(0, plannedDurationSeconds - workedSeconds);

      return {
        ...t,
        effectiveStartTime,
        effectiveEndTime,
        effectiveDurationMinutes,
        basePlannedDurationMinutes,
        isOverridden: !!override,
        isCompleted,
        completedAt,
        status,
        workedSeconds,
        remainingSeconds,
        pausedElapsedSeconds,
        plannedDurationSeconds,
      };
    });

    // Sort chronologically by effective start time
    return enriched.sort(
      (a, b) => timeToMinutes(a.effectiveStartTime) - timeToMinutes(b.effectiveStartTime)
    );
  }, [appData.tasks, dayOfWeek, currentDayLog, clockTick]);

  // Tasks skipped/excluded for current selected day
  const skippedTasks: EffectiveTask[] = useMemo(() => {
    const skippedTemplates = appData.tasks.filter(
      (t) =>
        t.daysOfWeek.includes(dayOfWeek) &&
        Boolean(currentDayLog.excludedTaskIds?.includes(t.id))
    );

    return skippedTemplates.map((t) => {
      const override = currentDayLog.overrides?.[t.id];
      const effectiveStartTime = override?.startTime || t.startTime;
      const effectiveEndTime = override?.endTime || t.endTime;
      const effectiveDurationMinutes = getDurationMinutes(effectiveStartTime, effectiveEndTime);
      const basePlannedDurationMinutes = effectiveDurationMinutes;

      return {
        ...t,
        effectiveStartTime,
        effectiveEndTime,
        effectiveDurationMinutes,
        basePlannedDurationMinutes,
        isOverridden: !!override,
        isCompleted: false,
        status: 'idle' as const,
        workedSeconds: 0,
        remainingSeconds: basePlannedDurationMinutes * 60,
        pausedElapsedSeconds: 0,
        plannedDurationSeconds: basePlannedDurationMinutes * 60,
      };
    });
  }, [appData.tasks, dayOfWeek, currentDayLog]);

  const activeTasks = useMemo(
    () => allScheduledTasks.filter((t) => !t.isCompleted),
    [allScheduledTasks]
  );

  const completedTasks = useMemo(
    () => allScheduledTasks.filter((t) => t.isCompleted),
    [allScheduledTasks]
  );

  const currentRunningTask = useMemo(() => {
    // 1. Actively running task always has top priority for the banner
    const running = activeTasks.find((t) => t.status === 'running');
    if (running) return running;

    // 2. If no task is running, check for any paused tasks
    const pausedTasks = activeTasks.filter((t) => t.status === 'paused');
    if (pausedTasks.length === 0) return null;

    // 3. Return the most recently active paused task
    return [...pausedTasks].sort((a, b) => {
      const progA = currentDayLog.progress?.[a.id];
      const progB = currentDayLog.progress?.[b.id];
      const timeA = progA?.pausedTimestamp || progA?.lastStartedTimestamp || 0;
      const timeB = progB?.pausedTimestamp || progB?.lastStartedTimestamp || 0;
      return timeB - timeA;
    })[0];
  }, [activeTasks, currentDayLog]);

  const totalScheduledMinutes = useMemo(() => {
    return allScheduledTasks.reduce((sum, t) => sum + t.basePlannedDurationMinutes, 0);
  }, [allScheduledTasks]);

  const completedScheduledMinutes = useMemo(() => {
    return completedTasks.reduce((sum, t) => sum + t.basePlannedDurationMinutes, 0);
  }, [completedTasks]);

  const dayCompletionRate = useMemo(() => {
    if (allScheduledTasks.length === 0) return 0;
    return Math.round((completedTasks.length / allScheduledTasks.length) * 100);
  }, [allScheduledTasks.length, completedTasks.length]);

  // Alarm monitor: Check if any running task reached remainingSeconds === 0
  useEffect(() => {
    if (!isCurrentToday || !appData.settings.soundEnabled) return;

    for (const task of activeTasks) {
      if (task.status === 'running' && task.remainingSeconds <= 0) {
        if (!firedAlarmsRef.current.has(task.id)) {
          firedAlarmsRef.current.add(task.id);
          setCurrentAlarmTask(task);
          sound.playTaskFinishedAlarm(appData.settings.selectedSoundTrack || 'june_songbirds');
          sendSystemNotification(`Время вышло: «${task.title}»`, {
            body: `Запланированное время ${formatDuration(task.basePlannedDurationMinutes)} полностью отработано!`,
          });
        }
      }
    }
  }, [activeTasks, isCurrentToday, appData.settings.soundEnabled, appData.settings.selectedSoundTrack]);

  const goToToday = useCallback(() => {
    haptic.light();
    setSelectedDate(new Date());
  }, []);

  const updateSettings = useCallback((newSettings: Partial<AppData['settings']>) => {
    isUserMutationRef.current = true;
    setAppData((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        ...newSettings,
      },
    }));
  }, []);

  const addCategory = useCallback((category: string) => {
    const trimmed = category.trim();
    if (!trimmed) return;
    isUserMutationRef.current = true;
    setAppData((prev) => {
      if (prev.categories.includes(trimmed)) return prev;
      return {
        ...prev,
        categories: [...prev.categories, trimmed],
      };
    });
  }, []);

  const deleteCategory = useCallback((catName: string) => {
    isUserMutationRef.current = true;
    setAppData((prev) => ({
      ...prev,
      categories: prev.categories.filter((c) => c !== catName),
      deletedCategories: [...(prev.deletedCategories || []), catName],
    }));
  }, []);

  const createTask = useCallback(
    (data: Omit<TaskTemplate, 'id' | 'createdAt' | 'order'>) => {
      const newTask: TaskTemplate = {
        ...data,
        id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        createdAt: new Date().toISOString(),
        order: appData.tasks.length + 1,
      };

      isUserMutationRef.current = true;
      setAppData((prev) => ({
        ...prev,
        tasks: [...prev.tasks, newTask],
      }));

      haptic.medium();
      showToast(`Задача «${newTask.title}» добавлена: ${newTask.startTime}–${newTask.endTime}`);
    },
    [appData.tasks.length, showToast]
  );

  // UPDATE TASK: BUGFIXED to ALWAYS update title, category, color, etc. in tasks array!
  const updateTask = useCallback(
    (
      taskId: string,
      data: Partial<TaskTemplate>,
      applyToFutureDays: boolean,
      autoShiftSubsequentToday: boolean = true
    ) => {
      isUserMutationRef.current = true;
      setAppData((prev) => {
        const oldTask = prev.tasks.find((t) => t.id === taskId);
        if (!oldTask) return prev;

        const newHistory = { ...prev.history };
        const dayLog = newHistory[selectedDateStr] || {
          completedTaskIds: [],
          completedAt: {},
          overrides: {},
          progress: {},
          excludedTaskIds: [],
        };

        if (!applyToFutureDays) {
          // Scenario 1: Apply time changes only to current day
          // Global fields (title, category, color, daysOfWeek, alarmEnabled) are updated in template,
          // but template's base startTime and endTime are preserved!
          const { startTime: _ignStart, endTime: _ignEnd, ...globalFields } = data;
          const updatedTasks = prev.tasks.map((t) => {
            if (t.id === taskId) {
              return { ...t, ...globalFields };
            }
            return t;
          });

          const newStart = data.startTime || dayLog.overrides?.[taskId]?.startTime || oldTask.startTime;
          const newEnd = data.endTime || dayLog.overrides?.[taskId]?.endTime || oldTask.endTime;

          const oldStartMinutes = timeToMinutes(
            dayLog.overrides?.[taskId]?.startTime || oldTask.startTime
          );
          const newStartMinutes = timeToMinutes(newStart);
          const deltaMinutes = newStartMinutes - oldStartMinutes;

          const newOverrides: Record<string, DayTaskOverride> = {
            ...(dayLog.overrides || {}),
            [taskId]: { startTime: newStart, endTime: newEnd },
          };

          if (autoShiftSubsequentToday && deltaMinutes !== 0) {
            const scheduledToday = updatedTasks
              .filter((t) => t.daysOfWeek.includes(dayOfWeek) && t.id !== taskId && !(dayLog.excludedTaskIds || []).includes(t.id))
              .map((t) => {
                const ov = newOverrides[t.id];
                return {
                  id: t.id,
                  origStart: timeToMinutes(ov?.startTime || t.startTime),
                  origEnd: timeToMinutes(ov?.endTime || t.endTime),
                };
              })
              .filter((t) => t.origStart >= oldStartMinutes);

            for (const sub of scheduledToday) {
              newOverrides[sub.id] = {
                startTime: minutesToTime(sub.origStart + deltaMinutes),
                endTime: minutesToTime(sub.origEnd + deltaMinutes),
              };
            }
          }

          const newProgress = { ...(dayLog.progress || {}) };
          if (data.startTime || data.endTime) {
            const newDurationSec = getDurationMinutes(newStart, newEnd) * 60;
            const curProg = newProgress[taskId];
            if (curProg) {
              const nowMin = timeToMinutes(getCurrentTimeString());
              const newStartMin = timeToMinutes(newStart);
              let newWorked = curProg.workedSeconds;
              let newStatus = curProg.status;
              let newLastStarted = curProg.lastStartedTimestamp;
              let newPaused = curProg.pausedTimestamp;

              if (newStartMin > nowMin) {
                newStatus = 'idle';
                newWorked = 0;
                newLastStarted = null;
                newPaused = null;
              } else {
                const maxAllowedSec = Math.max(0, (nowMin - newStartMin) * 60);
                if (newWorked > maxAllowedSec) {
                  newWorked = maxAllowedSec;
                  if (newStatus === 'running') {
                    newLastStarted = Date.now();
                  }
                }
              }

              if (newWorked > newDurationSec) {
                newWorked = newDurationSec;
              }

              newProgress[taskId] = {
                ...curProg,
                status: newStatus,
                workedSeconds: newWorked,
                lastStartedTimestamp: newLastStarted,
                pausedTimestamp: newPaused,
                plannedDurationSeconds: newDurationSec,
                updatedAt: Date.now(),
              };
            }
          }

          newHistory[selectedDateStr] = {
            ...dayLog,
            overrides: newOverrides,
            progress: newProgress,
          };

          return {
            ...prev,
            tasks: updatedTasks,
            history: newHistory,
          };
        } else {
          // Scenario 2: Apply to all subsequent days (update base template including startTime and endTime)
          const updatedTasks = prev.tasks.map((t) => {
            if (t.id === taskId) {
              return { ...t, ...data };
            }
            return t;
          });

          const newOverrides = { ...(dayLog.overrides || {}) };
          delete newOverrides[taskId];

          const newProgress = { ...(dayLog.progress || {}) };
          if (data.startTime || data.endTime) {
            const finalStart = data.startTime || oldTask.startTime;
            const finalEnd = data.endTime || oldTask.endTime;
            const newDurationSec = getDurationMinutes(finalStart, finalEnd) * 60;
            const curProg = newProgress[taskId];
            if (curProg) {
              const nowMin = timeToMinutes(getCurrentTimeString());
              const finalStartMin = timeToMinutes(finalStart);
              let newWorked = curProg.workedSeconds;
              let newStatus = curProg.status;
              let newLastStarted = curProg.lastStartedTimestamp;
              let newPaused = curProg.pausedTimestamp;

              if (finalStartMin > nowMin) {
                newStatus = 'idle';
                newWorked = 0;
                newLastStarted = null;
                newPaused = null;
              } else {
                const maxAllowedSec = Math.max(0, (nowMin - finalStartMin) * 60);
                if (newWorked > maxAllowedSec) {
                  newWorked = maxAllowedSec;
                  if (newStatus === 'running') {
                    newLastStarted = Date.now();
                  }
                }
              }

              if (newWorked > newDurationSec) {
                newWorked = newDurationSec;
              }

              newProgress[taskId] = {
                ...curProg,
                status: newStatus,
                workedSeconds: newWorked,
                lastStartedTimestamp: newLastStarted,
                pausedTimestamp: newPaused,
                plannedDurationSeconds: newDurationSec,
                updatedAt: Date.now(),
              };
            }
          }

          newHistory[selectedDateStr] = {
            ...dayLog,
            overrides: newOverrides,
            progress: newProgress,
          };

          return {
            ...prev,
            tasks: updatedTasks,
            history: newHistory,
          };
        }
      });

      haptic.medium();
      showToast('Изменения задачи сохранены');
    },
    [selectedDateStr, dayOfWeek, showToast]
  );

  // START TASK: Snaps start time to right now and cascades subsequent tasks without conflicts
  const startTask = useCallback(
    (taskId: string) => {
      sound.playClick('start');
      haptic.medium();
      isUserMutationRef.current = true;

      setAppData((prev) => {
        const targetTask = prev.tasks.find((t) => t.id === taskId);
        if (!targetTask) return prev;

        const newHistory = { ...prev.history };
        const dayLog = newHistory[selectedDateStr] || {
          completedTaskIds: [],
          completedAt: {},
          overrides: {},
          progress: {},
        };

        const currentScheduledStart =
          dayLog.overrides?.[taskId]?.startTime || targetTask.startTime;
        const currentScheduledEnd =
          dayLog.overrides?.[taskId]?.endTime || targetTask.endTime;

        const scheduledDurationMin = getDurationMinutes(
          currentScheduledStart,
          currentScheduledEnd
        );
        const scheduledDurationSec = scheduledDurationMin * 60;

        const realNowStr = getCurrentTimeString();
        const now = Date.now();
        const existingProgress = dayLog.progress?.[taskId];

        const plannedSec = existingProgress?.plannedDurationSeconds || scheduledDurationSec;
        const workedSec = existingProgress?.workedSeconds || 0;
        const remainingSec = Math.max(0, plannedSec - workedSec);
        const remainingMin = Math.max(1, Math.ceil(remainingSec / 60));
        const workedMin = Math.floor(workedSec / 60);

        const newEndTime = addMinutesToTime(realNowStr, remainingMin);
        const newStartTime = addMinutesToTime(realNowStr, -workedMin);

        let newOverrides: Record<string, DayTaskOverride> = {
          ...(dayLog.overrides || {}),
          [taskId]: {
            startTime: newStartTime,
            endTime: newEndTime,
          },
        };

        const newProgress: Record<string, TaskProgressState> = {
          ...(dayLog.progress || {}),
        };

        // Auto-pause any other task currently running so only one task ticks at a time
        for (const otherId in newProgress) {
          if (otherId !== taskId && newProgress[otherId]?.status === 'running') {
            const otherProg = newProgress[otherId];
            const currentStretch = otherProg.lastStartedTimestamp
              ? Math.max(0, (now - otherProg.lastStartedTimestamp) / 1000)
              : 0;
            newProgress[otherId] = {
              ...otherProg,
              status: 'paused',
              workedSeconds: otherProg.workedSeconds + currentStretch,
              lastStartedTimestamp: null,
              pausedTimestamp: now,
              updatedAt: now,
            };
          }
        }

        newProgress[taskId] = {
          status: 'running',
          workedSeconds: workedSec,
          lastStartedTimestamp: now,
          pausedTimestamp: null,
          plannedDurationSeconds: plannedSec,
          updatedAt: now,
        };

        // Cascade all other non-completed tasks to guarantee sequential execution without overlaps
        newOverrides = cascadeSchedule(
          prev.tasks,
          newOverrides,
          dayLog.completedTaskIds || [],
          dayLog.excludedTaskIds || [],
          dayOfWeek,
          taskId,
          newEndTime,
          newStartTime,
          newProgress
        );

        newHistory[selectedDateStr] = {
          ...dayLog,
          overrides: newOverrides,
          progress: newProgress,
        };

        return { ...prev, history: newHistory };
      });

      showToast('Задача начата! Обратный отсчет запущен');
    },
    [selectedDateStr, dayOfWeek, showToast]
  );

  // PAUSE TASK: Freezes the countdown timer
  const pauseTask = useCallback(
    (taskId: string) => {
      sound.playClick('pause');
      haptic.medium();
      isUserMutationRef.current = true;

      setAppData((prev) => {
        const newHistory = { ...prev.history };
        const dayLog = newHistory[selectedDateStr] || {
          completedTaskIds: [],
          completedAt: {},
          overrides: {},
          progress: {},
        };

        const prog = dayLog.progress?.[taskId];
        if (!prog || prog.status !== 'running') return prev;

        const now = Date.now();
        const currentStretch = prog.lastStartedTimestamp
          ? Math.max(0, (now - prog.lastStartedTimestamp) / 1000)
          : 0;

        const newProgress: Record<string, TaskProgressState> = {
          ...(dayLog.progress || {}),
          [taskId]: {
            ...prog,
            status: 'paused',
            workedSeconds: prog.workedSeconds + currentStretch,
            lastStartedTimestamp: null,
            pausedTimestamp: now,
            updatedAt: now,
          },
        };

        newHistory[selectedDateStr] = {
          ...dayLog,
          progress: newProgress,
        };

        return { ...prev, history: newHistory };
      });

      showToast('⏸ Задача на паузе');
    },
    [selectedDateStr, showToast]
  );

  // RESUME TASK: Resumes countdown, adjusts finish time and cascades subsequent tasks without conflicts
  const resumeTask = useCallback(
    (taskId: string) => {
      sound.playClick('resume');
      haptic.medium();
      isUserMutationRef.current = true;

      setAppData((prev) => {
        const targetTask = prev.tasks.find((t) => t.id === taskId);
        if (!targetTask) return prev;

        const newHistory = { ...prev.history };
        const dayLog = newHistory[selectedDateStr] || {
          completedTaskIds: [],
          completedAt: {},
          overrides: {},
          progress: {},
        };

        const prog = dayLog.progress?.[taskId];
        if (!prog || prog.status !== 'paused') return prev;

        const realNowStr = getCurrentTimeString();
        const now = Date.now();

        const curStart = dayLog.overrides?.[taskId]?.startTime || targetTask.startTime;
        const curEnd = dayLog.overrides?.[taskId]?.endTime || targetTask.endTime;
        const scheduledDurationSec = getDurationMinutes(curStart, curEnd) * 60;

        const plannedSec = prog.plannedDurationSeconds || scheduledDurationSec;
        const workedSec = prog.workedSeconds || 0;
        const remainingSec = Math.max(0, plannedSec - workedSec);
        const remainingMin = Math.max(1, Math.ceil(remainingSec / 60));
        const workedMin = Math.floor(workedSec / 60);

        const newEndTime = addMinutesToTime(realNowStr, remainingMin);
        const newStartTime = addMinutesToTime(realNowStr, -workedMin);

        let newOverrides: Record<string, DayTaskOverride> = {
          ...(dayLog.overrides || {}),
          [taskId]: {
            startTime: newStartTime,
            endTime: newEndTime,
          },
        };

        const newProgress: Record<string, TaskProgressState> = {
          ...(dayLog.progress || {}),
        };

        // Auto-pause any other task currently running so only one task ticks at a time
        for (const otherId in newProgress) {
          if (otherId !== taskId && newProgress[otherId]?.status === 'running') {
            const otherProg = newProgress[otherId];
            const currentStretch = otherProg.lastStartedTimestamp
              ? Math.max(0, (now - otherProg.lastStartedTimestamp) / 1000)
              : 0;
            newProgress[otherId] = {
              ...otherProg,
              status: 'paused',
              workedSeconds: otherProg.workedSeconds + currentStretch,
              lastStartedTimestamp: null,
              pausedTimestamp: now,
              updatedAt: now,
            };
          }
        }

        newProgress[taskId] = {
          ...prog,
          status: 'running',
          workedSeconds: workedSec,
          lastStartedTimestamp: now,
          pausedTimestamp: null,
          plannedDurationSeconds: plannedSec,
          updatedAt: now,
        };

        // Cascade all other non-completed tasks to guarantee sequential execution without overlaps
        newOverrides = cascadeSchedule(
          prev.tasks,
          newOverrides,
          dayLog.completedTaskIds || [],
          dayLog.excludedTaskIds || [],
          dayOfWeek,
          taskId,
          newEndTime,
          newStartTime,
          newProgress
        );

        newHistory[selectedDateStr] = {
          ...dayLog,
          overrides: newOverrides,
          progress: newProgress,
        };

        return { ...prev, history: newHistory };
      });

      showToast('▶ Задача продолжена');
    },
    [selectedDateStr, dayOfWeek, showToast]
  );

  // RESET TASK: Resets running/paused task back to idle and restores original planned time
  const resetTask = useCallback(
    (taskId: string) => {
      haptic.light();
      isUserMutationRef.current = true;

      setAppData((prev) => {
        const targetTask = prev.tasks.find((t) => t.id === taskId);
        if (!targetTask) return prev;

        const newHistory = { ...prev.history };
        const dayLog = newHistory[selectedDateStr] || {
          completedTaskIds: [],
          completedAt: {},
          overrides: {},
          progress: {},
        };

        const now = Date.now();
        const baseDurationMin = getDurationMinutes(targetTask.startTime, targetTask.endTime);

        let newOverrides: Record<string, DayTaskOverride> = {
          ...(dayLog.overrides || {}),
        };
        // Clear runtime execution override so task returns to its planned schedule
        delete newOverrides[taskId];

        const newProgress: Record<string, TaskProgressState> = {
          ...(dayLog.progress || {}),
          [taskId]: {
            status: 'idle',
            workedSeconds: 0,
            lastStartedTimestamp: null,
            pausedTimestamp: null,
            plannedDurationSeconds: baseDurationMin * 60,
            updatedAt: now,
          },
        };

        const newCompleted = (dayLog.completedTaskIds || []).filter((id) => id !== taskId);
        const newCompletedAt = { ...(dayLog.completedAt || {}) };
        delete newCompletedAt[taskId];

        // If another task is currently running or paused, cascade remaining tasks after it
        const activeTask = prev.tasks.find(
          (t) => t.id !== taskId && (newProgress[t.id]?.status === 'running' || newProgress[t.id]?.status === 'paused')
        );
        if (activeTask) {
          const actProg = newProgress[activeTask.id];
          const actCurStart = newOverrides[activeTask.id]?.startTime || activeTask.startTime;
          const actCurEnd = newOverrides[activeTask.id]?.endTime || activeTask.endTime;
          const actPlannedSec = actProg?.plannedDurationSeconds || (getDurationMinutes(actCurStart, actCurEnd) * 60);
          const actWorkedSec = actProg?.workedSeconds || 0;
          const actRemainingMin = Math.max(1, Math.ceil((actPlannedSec - actWorkedSec) / 60));
          const actEndTime = actProg?.status === 'running'
            ? addMinutesToTime(getCurrentTimeString(), actRemainingMin)
            : actCurEnd;

          newOverrides = cascadeSchedule(
            prev.tasks,
            newOverrides,
            newCompleted,
            dayLog.excludedTaskIds || [],
            dayOfWeek,
            activeTask.id,
            actEndTime,
            actCurStart,
            newProgress
          );
        }

        newHistory[selectedDateStr] = {
          ...dayLog,
          overrides: newOverrides,
          completedTaskIds: newCompleted,
          completedAt: newCompletedAt,
          progress: newProgress,
        };

        return { ...prev, history: newHistory };
      });

      firedAlarmsRef.current.delete(taskId);
      showToast('Таймер сброшен к началу');
    },
    [selectedDateStr, dayOfWeek, showToast]
  );

  // COMPLETE TASK
  const completeTask = useCallback(
    (taskId: string) => {
      sound.playClick('complete');
      haptic.success();
      fireConfetti();
      isUserMutationRef.current = true;

      if (currentAlarmTask?.id === taskId) {
        setCurrentAlarmTask(null);
      }

      setAppData((prev) => {
        const newHistory = { ...prev.history };
        const dayLog = newHistory[selectedDateStr] || {
          completedTaskIds: [],
          completedAt: {},
          overrides: {},
          progress: {},
        };

        const existingIds = dayLog.completedTaskIds || [];
        if (existingIds.includes(taskId)) return prev;

        const prog = dayLog.progress?.[taskId];
        const newProgress: Record<string, TaskProgressState> = {
          ...(dayLog.progress || {}),
          [taskId]: {
            status: 'completed',
            workedSeconds: prog?.plannedDurationSeconds || 0,
            lastStartedTimestamp: null,
            pausedTimestamp: null,
            plannedDurationSeconds: prog?.plannedDurationSeconds || 0,
            updatedAt: Date.now(),
          },
        };

        newHistory[selectedDateStr] = {
          ...dayLog,
          completedTaskIds: [...existingIds, taskId],
          completedAt: {
            ...(dayLog.completedAt || {}),
            [taskId]: new Date().toISOString(),
          },
          progress: newProgress,
        };

        return { ...prev, history: newHistory };
      });

      showToast('Задача выполнена! Отличный результат!');
    },
    [selectedDateStr, currentAlarmTask, showToast]
  );

  // RESTORE TASK
  const restoreTask = useCallback(
    (taskId: string) => {
      haptic.light();
      isUserMutationRef.current = true;

      setAppData((prev) => {
        const targetTask = prev.tasks.find((t) => t.id === taskId);
        if (!targetTask) return prev;

        const newHistory = { ...prev.history };
        const dayLog = newHistory[selectedDateStr];
        if (!dayLog) return prev;

        const basePlannedDurationMin = getDurationMinutes(targetTask.startTime, targetTask.endTime);
        const now = Date.now();

        let newOverrides: Record<string, DayTaskOverride> = {
          ...(dayLog.overrides || {}),
        };
        // Clear runtime execution override so task returns to its planned schedule
        delete newOverrides[taskId];

        const newCompleted = (dayLog.completedTaskIds || []).filter((id) => id !== taskId);
        const newCompletedAt = { ...(dayLog.completedAt || {}) };
        delete newCompletedAt[taskId];

        const newProgress = { ...(dayLog.progress || {}) };
        newProgress[taskId] = {
          status: 'idle',
          workedSeconds: 0,
          lastStartedTimestamp: null,
          pausedTimestamp: null,
          plannedDurationSeconds: basePlannedDurationMin * 60,
          updatedAt: now,
        };

        // If another task is currently running or paused, cascade remaining tasks after it
        const activeTask = prev.tasks.find(
          (t) => t.id !== taskId && (newProgress[t.id]?.status === 'running' || newProgress[t.id]?.status === 'paused')
        );
        if (activeTask) {
          const actProg = newProgress[activeTask.id];
          const actCurStart = newOverrides[activeTask.id]?.startTime || activeTask.startTime;
          const actCurEnd = newOverrides[activeTask.id]?.endTime || activeTask.endTime;
          const actPlannedSec = actProg?.plannedDurationSeconds || (getDurationMinutes(actCurStart, actCurEnd) * 60);
          const actWorkedSec = actProg?.workedSeconds || 0;
          const actRemainingMin = Math.max(1, Math.ceil((actPlannedSec - actWorkedSec) / 60));
          const actEndTime = actProg?.status === 'running'
            ? addMinutesToTime(getCurrentTimeString(), actRemainingMin)
            : actCurEnd;

          newOverrides = cascadeSchedule(
            prev.tasks,
            newOverrides,
            newCompleted,
            dayLog.excludedTaskIds || [],
            dayOfWeek,
            activeTask.id,
            actEndTime,
            actCurStart,
            newProgress
          );
        }

        newHistory[selectedDateStr] = {
          ...dayLog,
          overrides: newOverrides,
          completedTaskIds: newCompleted,
          completedAt: newCompletedAt,
          progress: newProgress,
        };

        return { ...prev, history: newHistory };
      });

      firedAlarmsRef.current.delete(taskId);
      showToast('Задача возвращена в план');
    },
    [selectedDateStr, dayOfWeek, showToast]
  );

  // DELETE TASK PERMANENTLY
  const deleteTaskPermanently = useCallback(
    (taskId: string) => {
      haptic.medium();
      isUserMutationRef.current = true;

      if (currentAlarmTask?.id === taskId) {
        setCurrentAlarmTask(null);
      }
      firedAlarmsRef.current.delete(taskId);

      setAppData((prev) => {
        const filteredTasks = prev.tasks.filter((t) => t.id !== taskId);
        const newHistory = { ...prev.history };

        for (const date in newHistory) {
          const log = newHistory[date];
          if (
            log.overrides?.[taskId] ||
            log.completedTaskIds?.includes(taskId) ||
            log.progress?.[taskId] ||
            log.excludedTaskIds?.includes(taskId)
          ) {
            const newOverrides = { ...(log.overrides || {}) };
            delete newOverrides[taskId];
            const newCompleted = (log.completedTaskIds || []).filter((id) => id !== taskId);
            const newProgress = { ...(log.progress || {}) };
            delete newProgress[taskId];
            const newExcluded = (log.excludedTaskIds || []).filter((id) => id !== taskId);

            newHistory[date] = {
              ...log,
              overrides: newOverrides,
              completedTaskIds: newCompleted,
              progress: newProgress,
              excludedTaskIds: newExcluded,
            };
          }
        }

        return {
          ...prev,
          tasks: filteredTasks,
          deletedTaskIds: [...(prev.deletedTaskIds || []), taskId],
          history: newHistory,
        };
      });

      showToast('Задача полностью удалена');
    },
    [showToast]
  );

  // SKIP TASK FOR CURRENT DAY ONLY
  const skipTaskForDay = useCallback(
    (taskId: string) => {
      haptic.medium();
      isUserMutationRef.current = true;

      if (currentAlarmTask?.id === taskId) {
        setCurrentAlarmTask(null);
      }
      firedAlarmsRef.current.delete(taskId);
      setAppData((prev) => {
        const newHistory = { ...prev.history };
        const dayLog = newHistory[selectedDateStr] || {
          completedTaskIds: [],
          completedAt: {},
          overrides: {},
          progress: {},
          excludedTaskIds: [],
        };

        const currentExcluded = new Set(dayLog.excludedTaskIds || []);
        currentExcluded.add(taskId);

        // Reset progress if it was running or paused
        const newProgress = { ...(dayLog.progress || {}) };
        if (newProgress[taskId]) {
          newProgress[taskId] = {
            ...newProgress[taskId],
            status: 'idle',
            lastStartedTimestamp: null,
            pausedTimestamp: null,
          };
        }

        newHistory[selectedDateStr] = {
          ...dayLog,
          progress: newProgress,
          excludedTaskIds: Array.from(currentExcluded),
        };

        return {
          ...prev,
          history: newHistory,
        };
      });

      showToast('Задача пропущена на этот день');
    },
    [selectedDateStr, showToast]
  );

  // RESTORE SKIPPED TASK FOR CURRENT DAY
  const restoreSkippedTask = useCallback(
    (taskId: string) => {
      haptic.success();
      isUserMutationRef.current = true;
      setAppData((prev) => {
        const newHistory = { ...prev.history };
        const dayLog = newHistory[selectedDateStr];
        if (!dayLog || !dayLog.excludedTaskIds?.includes(taskId)) return prev;

        const updatedExcluded = (dayLog.excludedTaskIds || []).filter((id) => id !== taskId);

        newHistory[selectedDateStr] = {
          ...dayLog,
          excludedTaskIds: updatedExcluded,
        };

        return {
          ...prev,
          history: newHistory,
        };
      });

      showToast('Задача возвращена в расписание');
    },
    [selectedDateStr, showToast]
  );

  const reorderTasks = useCallback((newTasks: TaskTemplate[]) => {
    isUserMutationRef.current = true;
    setAppData((prev) => ({
      ...prev,
      tasks: newTasks.map((t, idx) => ({ ...t, order: idx + 1 })),
    }));
  }, []);

  const dismissAlarm = useCallback(() => {
    sound.stopAlarm();
    setCurrentAlarmTask(null);
  }, []);

  return (
    <PlannerContext.Provider
      value={{
        appData,
        selectedDate,
        selectedDateStr,
        isCurrentToday,
        viewMode,
        setViewMode,
        setSelectedDate,
        goToToday,
        activeTasks,
        completedTasks,
        allScheduledTasks,
        currentRunningTask,
        dayCompletionRate,
        totalScheduledMinutes,
        completedScheduledMinutes,
        createTask,
        updateTask,
        deleteTaskPermanently,
        skipTaskForDay,
        restoreSkippedTask,
        skippedTasks,
        startTask,
        pauseTask,
        resumeTask,
        resetTask,
        completeTask,
        restoreTask,
        reorderTasks,
        categories: appData.categories,
        addCategory,
        deleteCategory,
        isSyncing,
        syncStatus,
        triggerSync,
        updateAccount,
        currentAlarmTask,
        dismissAlarm,
        updateSettings,
        currentTheme,
        setTheme,
        toastMessage,
        showToast,
      }}
    >
      {children}
    </PlannerContext.Provider>
  );
};

export const usePlanner = () => {
  const context = useContext(PlannerContext);
  if (!context) {
    throw new Error('usePlanner must be used within a PlannerProvider');
  }
  return context;
};
