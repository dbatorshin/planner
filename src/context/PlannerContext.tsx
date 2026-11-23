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
  triggerSync: (overrideUrl?: string, overrideKey?: string) => Promise<{ success: boolean; message?: string }>;
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

  // Cloud Sync: Automatic Debounced Push to Supabase on local user mutation (500ms)
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
    }, 600);

    return () => clearTimeout(timeout);
  }, [appData]);

  // Manual / Auto Trigger Sync
  const triggerSync = useCallback(
    async (overrideUrl?: string, overrideKey?: string): Promise<{ success: boolean; message?: string }> => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return { success: false, message: 'Офлайн режим: изменения сохранены локально.' };
      }
      setIsSyncing(true);
      setSyncStatus('syncing');
      try {
        const currentData = latestAppDataRef.current;
        const targetUrl = overrideUrl || currentData.account.supabaseUrl;
        const targetKey = overrideKey || currentData.account.supabaseAnonKey;

        const res = await syncWithCloud(currentData, targetUrl, targetKey);
        if (res.success && res.data) {
          isUserMutationRef.current = false;
          setAppData(res.data);
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

  // Cloud Sync: Pull remote changes on visibility change (smartphone screen unlock / browser focus / online)
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
        if (res.success && res.data) {
          setAppData(res.data);
          setSyncStatus('synced');
        }
      } catch {}
    };

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

    // Periodic pull every 12 seconds when online
    const interval = setInterval(pullRemote, 12000);

    return () => {
      window.removeEventListener('focus', pullRemote);
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibility);
      clearInterval(interval);
    };
  }, [appData?.account?.cloudSyncEnabled, appData?.account?.supabaseUrl, appData?.account?.supabaseAnonKey, appData?.account?.email, isSyncing, triggerSync]);

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

            setAppData((prev) => {
              const updated: AppData = {
                ...prev,
                account: {
                  ...(prev.account || { email: targetEmail, displayName: 'Пользователь', cloudSyncEnabled: true }),
                  supabaseUrl: targetUrl,
                  supabaseAnonKey: targetKey,
                  cloudSyncEnabled: true,
                  email: targetEmail,
                },
              };
              storage.save(updated);
              return updated;
            });

            showToast('Синхронизация настроена в 1 клик!');
            setTimeout(() => {
              triggerSync(targetUrl, targetKey);
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
    setAppData((prev) => ({
      ...prev,
      account: {
        ...prev.account,
        ...updates,
      },
    }));
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
      t.daysOfWeek.includes(dayOfWeek)
    );

    const now = clockTick;

    const enriched = matchingTemplates.map((t) => {
      const override = currentDayLog.overrides?.[t.id];
      const prog = currentDayLog.progress?.[t.id];
      const isCompleted = currentDayLog.completedTaskIds?.includes(t.id) || false;
      const completedAt = currentDayLog.completedAt?.[t.id];

      const effectiveStartTime = override?.startTime || t.startTime;
      const effectiveEndTime = override?.endTime || t.endTime;
      const effectiveDurationMinutes = getDurationMinutes(effectiveStartTime, effectiveEndTime);

      // Base planned duration strictly from template (e.g. 08:00–12:00 -> 240 mins)
      // Pauses shift the clock schedule window, but DO NOT increase the work quota!
      const basePlannedDurationMinutes = getDurationMinutes(t.startTime, t.endTime);
      const plannedDurationSeconds =
        prog?.plannedDurationSeconds || basePlannedDurationMinutes * 60;

      let status: 'idle' | 'running' | 'paused' | 'completed' = 'idle';
      let workedSeconds = prog?.workedSeconds || 0;
      let pausedElapsedSeconds = 0;

      if (isCompleted) {
        status = 'completed';
      } else if (prog?.status === 'running') {
        status = 'running';
        if (prog.lastStartedTimestamp) {
          const currentStretch = Math.max(0, (now - prog.lastStartedTimestamp) / 1000);
          workedSeconds += currentStretch;
        }
      } else if (prog?.status === 'paused') {
        status = 'paused';
        if (prog.pausedTimestamp) {
          pausedElapsedSeconds = Math.max(0, (now - prog.pausedTimestamp) / 1000);
        }
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

  const activeTasks = useMemo(
    () => allScheduledTasks.filter((t) => !t.isCompleted),
    [allScheduledTasks]
  );

  const completedTasks = useMemo(
    () => allScheduledTasks.filter((t) => t.isCompleted),
    [allScheduledTasks]
  );

  const currentRunningTask = useMemo(
    () => activeTasks.find((t) => t.status === 'running' || t.status === 'paused') || null,
    [activeTasks]
  );

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
            body: `Запланированное время (${formatDuration(task.basePlannedDurationMinutes)}) полностью отработано!`,
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

        // Update task definition (title, category, color, days, time, alarm)
        const updatedTasks = prev.tasks.map((t) => {
          if (t.id === taskId) {
            return { ...t, ...data };
          }
          return t;
        });

        const newHistory = { ...prev.history };
        const dayLog = newHistory[selectedDateStr] || {
          completedTaskIds: [],
          completedAt: {},
          overrides: {},
          progress: {},
        };

        if (!applyToFutureDays) {
          const newStart = data.startTime || oldTask.startTime;
          const newEnd = data.endTime || oldTask.endTime;

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
              .filter((t) => t.daysOfWeek.includes(dayOfWeek) && t.id !== taskId)
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

          newHistory[selectedDateStr] = {
            ...dayLog,
            overrides: newOverrides,
          };

          // CRITICAL FIX: ALWAYS return tasks: updatedTasks so title and edits are permanently saved!
          return {
            ...prev,
            tasks: updatedTasks,
            history: newHistory,
          };
        } else {
          const newOverrides = { ...(dayLog.overrides || {}) };
          delete newOverrides[taskId];

          newHistory[selectedDateStr] = {
            ...dayLog,
            overrides: newOverrides,
          };

          return {
            ...prev,
            tasks: updatedTasks,
            history: newHistory,
          };
        }
      });

      haptic.medium();
      showToast('Изменения задачи сохранены!');
    },
    [selectedDateStr, dayOfWeek, showToast]
  );

  // START TASK: Automatic sync with reality!
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

        // Base planned duration in minutes (e.g. 08:00 - 12:00 = 240 mins)
        const basePlannedDurationMin = getDurationMinutes(
          targetTask.startTime,
          targetTask.endTime
        );

        const realNowStr = getCurrentTimeString();
        const oldStartMin = timeToMinutes(currentScheduledStart);
        const nowMin = timeToMinutes(realNowStr);
        const deltaMinutes = nowMin - oldStartMin;

        const newOverrides: Record<string, DayTaskOverride> = {
          ...(dayLog.overrides || {}),
        };

        // If starting at a different time, snap start to now and preserve planned duration
        let newStartTime = currentScheduledStart;
        let newEndTime = currentScheduledEnd;

        if (deltaMinutes !== 0) {
          newStartTime = realNowStr;
          newEndTime = addMinutesToTime(realNowStr, basePlannedDurationMin);
          newOverrides[taskId] = {
            startTime: newStartTime,
            endTime: newEndTime,
          };

          // Auto-shift all subsequent tasks scheduled today by the same delta!
          const otherTasks = prev.tasks
            .filter((t) => t.daysOfWeek.includes(dayOfWeek) && t.id !== taskId)
            .map((t) => {
              const ov = newOverrides[t.id];
              return {
                id: t.id,
                origStart: timeToMinutes(ov?.startTime || t.startTime),
                origEnd: timeToMinutes(ov?.endTime || t.endTime),
              };
            })
            .filter((t) => t.origStart >= oldStartMin);

          for (const sub of otherTasks) {
            newOverrides[sub.id] = {
              startTime: minutesToTime(sub.origStart + deltaMinutes),
              endTime: minutesToTime(sub.origEnd + deltaMinutes),
            };
          }
        }

        const existingProgress = dayLog.progress?.[taskId];
        const newProgress: Record<string, TaskProgressState> = {
          ...(dayLog.progress || {}),
          [taskId]: {
            status: 'running',
            workedSeconds: existingProgress?.workedSeconds || 0,
            lastStartedTimestamp: Date.now(),
            pausedTimestamp: null,
            plannedDurationSeconds: basePlannedDurationMin * 60,
          },
        };

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

  // RESUME TASK: Resumes countdown and automatically extends end time & shifts all subsequent tasks by pause duration!
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
        if (!prog || prog.status !== 'paused' || !prog.pausedTimestamp) return prev;

        const now = Date.now();
        const pauseSeconds = Math.max(1, (now - prog.pausedTimestamp) / 1000);
        const pauseMinutes = Math.max(1, Math.round(pauseSeconds / 60));

        const curStart = dayLog.overrides?.[taskId]?.startTime || targetTask.startTime;
        const curEnd = dayLog.overrides?.[taskId]?.endTime || targetTask.endTime;
        const newEnd = addMinutesToTime(curEnd, pauseMinutes);

        const newOverrides: Record<string, DayTaskOverride> = {
          ...(dayLog.overrides || {}),
          [taskId]: {
            startTime: curStart,
            endTime: newEnd,
          },
        };

        // Shift subsequent tasks by pause minutes
        const taskStartMin = timeToMinutes(curStart);
        const subsequent = prev.tasks
          .filter((t) => t.daysOfWeek.includes(dayOfWeek) && t.id !== taskId)
          .map((t) => {
            const ov = newOverrides[t.id];
            return {
              id: t.id,
              origStart: timeToMinutes(ov?.startTime || t.startTime),
              origEnd: timeToMinutes(ov?.endTime || t.endTime),
            };
          })
          .filter((t) => t.origStart >= taskStartMin);

        for (const sub of subsequent) {
          newOverrides[sub.id] = {
            startTime: minutesToTime(sub.origStart + pauseMinutes),
            endTime: minutesToTime(sub.origEnd + pauseMinutes),
          };
        }

        const newProgress: Record<string, TaskProgressState> = {
          ...(dayLog.progress || {}),
          [taskId]: {
            ...prog,
            status: 'running',
            lastStartedTimestamp: now,
            pausedTimestamp: null,
          },
        };

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

        const newOverrides = { ...(dayLog.overrides || {}) };
        delete newOverrides[taskId];

        const basePlannedDurationMin = getDurationMinutes(
          targetTask.startTime,
          targetTask.endTime
        );

        const newProgress: Record<string, TaskProgressState> = {
          ...(dayLog.progress || {}),
          [taskId]: {
            status: 'idle',
            workedSeconds: 0,
            lastStartedTimestamp: null,
            pausedTimestamp: null,
            plannedDurationSeconds: basePlannedDurationMin * 60,
          },
        };

        newHistory[selectedDateStr] = {
          ...dayLog,
          overrides: newOverrides,
          progress: newProgress,
        };

        return { ...prev, history: newHistory };
      });

      firedAlarmsRef.current.delete(taskId);
      showToast('Таймер сброшен к началу');
    },
    [selectedDateStr, showToast]
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
        const basePlannedDurationMin = targetTask
          ? getDurationMinutes(targetTask.startTime, targetTask.endTime)
          : 0;

        const newHistory = { ...prev.history };
        const dayLog = newHistory[selectedDateStr];
        if (!dayLog) return prev;

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
        };

        newHistory[selectedDateStr] = {
          ...dayLog,
          completedTaskIds: newCompleted,
          completedAt: newCompletedAt,
          progress: newProgress,
        };

        return { ...prev, history: newHistory };
      });

      showToast('Задача возвращена в план');
    },
    [selectedDateStr, showToast]
  );

  // DELETE TASK PERMANENTLY
  const deleteTaskPermanently = useCallback(
    (taskId: string) => {
      haptic.medium();
      isUserMutationRef.current = true;

      setAppData((prev) => {
        const filteredTasks = prev.tasks.filter((t) => t.id !== taskId);
        const newHistory = { ...prev.history };

        for (const date in newHistory) {
          const log = newHistory[date];
          if (
            log.overrides?.[taskId] ||
            log.completedTaskIds?.includes(taskId) ||
            log.progress?.[taskId]
          ) {
            const newOverrides = { ...(log.overrides || {}) };
            delete newOverrides[taskId];
            const newCompleted = (log.completedTaskIds || []).filter((id) => id !== taskId);
            const newProgress = { ...(log.progress || {}) };
            delete newProgress[taskId];

            newHistory[date] = {
              ...log,
              overrides: newOverrides,
              completedTaskIds: newCompleted,
              progress: newProgress,
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
