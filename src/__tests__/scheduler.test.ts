import { describe, it, expect } from 'vitest';
import { cascadeSchedule } from '../context/PlannerContext';
import { mergeAppData } from '../services/supabase';
import type { TaskTemplate, DayTaskOverride, TaskProgressState, AppData } from '../types';

describe('Scheduler and Cascade Logic', () => {
  const baseTasks: TaskTemplate[] = [
    {
      id: 'task-coding',
      title: 'Кодинг',
      startTime: '09:00',
      endTime: '13:00', // 4 hours = 240 min
      category: 'Работа',
      color: '#eab308',
      daysOfWeek: [1, 2, 3, 4, 5],
      order: 0,
      alarmEnabled: true,
      createdAt: '2026-11-20T10:00:00Z',
    },
    {
      id: 'task-music',
      title: 'Музыка',
      startTime: '13:00',
      endTime: '15:00', // 2 hours = 120 min
      category: 'Хобби',
      color: '#3b82f6',
      daysOfWeek: [1, 2, 3, 4, 5],
      order: 1,
      alarmEnabled: true,
      createdAt: '2026-11-20T10:00:00Z',
    },
    {
      id: 'task-sport',
      title: 'Спорт',
      startTime: '15:00',
      endTime: '16:00', // 1 hour = 60 min
      category: 'Здоровье',
      color: '#10b981',
      daysOfWeek: [1, 2, 3, 4, 5],
      order: 2,
      alarmEnabled: true,
      createdAt: '2026-11-20T10:00:00Z',
    },
  ];

  it('cascades idle tasks sequentially when anchor task starts late', () => {
    // Coding starts at 16:00 and ends at 20:00 (4 hours)
    const overrides: Record<string, DayTaskOverride> = {
      'task-coding': { startTime: '16:00', endTime: '20:00' },
    };

    const cascaded = cascadeSchedule(
      baseTasks,
      overrides,
      [],
      [],
      1, // Monday
      'task-coding',
      '20:00',
      '16:00'
    );

    // Music should start at 20:00 and end at 22:00 (2 hours)
    expect(cascaded['task-music']).toEqual({ startTime: '20:00', endTime: '22:00' });
    // Sport should start at 22:00 and end at 23:00 (1 hour)
    expect(cascaded['task-sport']).toEqual({ startTime: '22:00', endTime: '23:00' });
  });

  it('respects remaining work for paused tasks when cascading', () => {
    // Coding was paused with 30 min worked (210 min remaining)
    // Music is now active: 16:30 to 18:30 (2 hours)
    const overrides: Record<string, DayTaskOverride> = {
      'task-music': { startTime: '16:30', endTime: '18:30' },
      'task-coding': { startTime: '16:00', endTime: '20:00' },
    };

    const progress: Record<string, TaskProgressState> = {
      'task-coding': {
        status: 'paused',
        workedSeconds: 1800, // 30 min
        lastStartedTimestamp: null,
        pausedTimestamp: Date.now(),
        plannedDurationSeconds: 14400, // 240 min
        updatedAt: Date.now(),
      },
    };

    const cascaded = cascadeSchedule(
      baseTasks,
      overrides,
      [],
      [],
      1,
      'task-music',
      '18:30',
      '16:30',
      progress
    );

    // Coding has 210 min remaining.
    // Remaining work starts at 18:30 and finishes at 18:30 + 210m = 22:00.
    // Virtual start time with 30m worked = 18:30 - 30m = 18:00.
    // Total window = 18:00 to 22:00 (240 min = full duration).
    expect(cascaded['task-coding']).toEqual({ startTime: '18:00', endTime: '22:00' });

    // Sport should start right when Coding finishes at 22:00 and end at 23:00
    expect(cascaded['task-sport']).toEqual({ startTime: '22:00', endTime: '23:00' });
  });

  it('handles midnight wrap cleanly without clamping', () => {
    // Coding starts at 22:00 and ends at 02:00 (4 hours)
    const overrides: Record<string, DayTaskOverride> = {
      'task-coding': { startTime: '22:00', endTime: '02:00' },
    };

    const cascaded = cascadeSchedule(
      baseTasks,
      overrides,
      [],
      [],
      1,
      'task-coding',
      '02:00',
      '22:00'
    );

    // Music should start at 02:00 and end at 04:00
    expect(cascaded['task-music']).toEqual({ startTime: '02:00', endTime: '04:00' });
    // Sport should start at 04:00 and end at 05:00
    expect(cascaded['task-sport']).toEqual({ startTime: '04:00', endTime: '05:00' });
  });

  it('guarantees sequential non-overlapping execution across full multitasking workflow', () => {
    // Step 3: When Task B is started at 10:30:
    const step3Overrides: Record<string, DayTaskOverride> = {
      'task-music': { startTime: '10:30', endTime: '12:30' },
    };
    const step3Progress: Record<string, TaskProgressState> = {
      'task-coding': {
        status: 'paused',
        workedSeconds: 1800, // 30m
        lastStartedTimestamp: null,
        pausedTimestamp: Date.now(),
        plannedDurationSeconds: 14400, // 240m
        updatedAt: Date.now(),
      },
      'task-music': {
        status: 'running',
        workedSeconds: 0,
        lastStartedTimestamp: Date.now(),
        pausedTimestamp: null,
        plannedDurationSeconds: 7200, // 120m
        updatedAt: Date.now(),
      },
    };

    const step3Cascaded = cascadeSchedule(
      baseTasks,
      step3Overrides,
      [],
      [],
      1,
      'task-music',
      '12:30',
      '10:30',
      step3Progress
    );

    // Coding finishes at 12:30 + 210m = 16:00. Virtual start: 12:30 - 30m = 12:00.
    expect(step3Cascaded['task-coding']).toEqual({ startTime: '12:00', endTime: '16:00' });
    // Sport finishes at 16:00 + 60m = 17:00
    expect(step3Cascaded['task-sport']).toEqual({ startTime: '16:00', endTime: '17:00' });

    // Step 5: When Task A is resumed at 11:00:
    // Task A worked 30m, remaining 210m -> ends 14:30. Start: 11:00 - 30m = 10:30.
    const step5Overrides: Record<string, DayTaskOverride> = {
      'task-coding': { startTime: '10:30', endTime: '14:30' },
    };
    const step5Progress: Record<string, TaskProgressState> = {
      'task-coding': {
        status: 'running',
        workedSeconds: 1800,
        lastStartedTimestamp: Date.now(),
        pausedTimestamp: null,
        plannedDurationSeconds: 14400,
        updatedAt: Date.now(),
      },
      'task-music': {
        status: 'paused',
        workedSeconds: 1800, // worked 30m
        lastStartedTimestamp: null,
        pausedTimestamp: Date.now(),
        plannedDurationSeconds: 7200, // total 120m, remaining 90m
        updatedAt: Date.now(),
      },
    };

    const step5Cascaded = cascadeSchedule(
      baseTasks,
      step5Overrides,
      [],
      [],
      1,
      'task-coding',
      '14:30',
      '10:30',
      step5Progress
    );

    // Music remaining 90m starts at 14:30 and finishes at 16:00!
    // Virtual start: 14:30 - 30m = 14:00.
    expect(step5Cascaded['task-music']).toEqual({ startTime: '14:00', endTime: '16:00' });
    // Sport starts at 16:00 and finishes at 17:00
    expect(step5Cascaded['task-sport']).toEqual({ startTime: '16:00', endTime: '17:00' });
  });

  it('correctly re-cascades when resetting a task while another task is paused', () => {
    // Coding is paused: 16:08 to 21:53 (remaining 3h 45m)
    // Music was started at 16:14 and paused at 18:02
    // User clicks RESET on Music:
    // Music override is deleted. Coding is the active paused task.
    // Music is idle and must be queued cleanly after Coding finishes (21:53)
    const initialOverrides: Record<string, DayTaskOverride> = {
      'task-coding': { startTime: '16:08', endTime: '21:53' },
      'task-music': { startTime: '16:14', endTime: '18:02' },
    };

    // Simulate resetTask: delete Music override
    const newOverrides = { ...initialOverrides };
    delete newOverrides['task-music'];

    const progress: Record<string, TaskProgressState> = {
      'task-coding': {
        status: 'paused',
        workedSeconds: 3600, // worked 1 hour
        lastStartedTimestamp: null,
        pausedTimestamp: Date.now(),
        plannedDurationSeconds: 14400, // 4 hours
        updatedAt: Date.now(),
      },
      'task-music': {
        status: 'idle',
        workedSeconds: 0,
        lastStartedTimestamp: null,
        pausedTimestamp: null,
        plannedDurationSeconds: 7200, // 2 hours
        updatedAt: Date.now(),
      },
    };

    // Coding is active (paused), actEndTime is '21:53', actStartTime is '16:08'
    const cascaded = cascadeSchedule(
      baseTasks,
      newOverrides,
      [],
      [],
      1,
      'task-coding',
      '21:53',
      '16:08',
      progress
    );

    // Music should start at 21:53 and run for its full 2 hours to 23:53
    expect(cascaded['task-music']).toEqual({ startTime: '21:53', endTime: '23:53' });
    // Sport should follow at 23:53 and run to 00:53
    expect(cascaded['task-sport']).toEqual({ startTime: '23:53', endTime: '00:53' });
  });
});

describe('Cloud Sync LWW Merge and Override Retention', () => {
  const dummyLocal: AppData = {
    version: 1,
    tasks: [
      {
        id: 'task-coding',
        title: 'Кодинг',
        startTime: '09:00',
        endTime: '13:00',
        category: 'Работа',
        color: '#eab308',
        daysOfWeek: [1, 2, 3, 4, 5],
        order: 0,
        alarmEnabled: true,
        createdAt: '2026-11-20T10:00:00Z',
      },
      {
        id: 'task-music',
        title: 'Музыка',
        startTime: '13:00',
        endTime: '15:00',
        category: 'Хобби',
        color: '#3b82f6',
        daysOfWeek: [1, 2, 3, 4, 5],
        order: 1,
        alarmEnabled: true,
        createdAt: '2026-11-20T10:00:00Z',
      },
    ],
    categories: ['Работа', 'Хобби'],
    deletedTaskIds: [],
    deletedCategories: [],
    account: {
      email: 'user@test.com',
      cloudSyncEnabled: true,
      supabaseUrl: 'https://test.supabase.co',
      supabaseAnonKey: 'key',
    },
    settings: {
      theme: 'midnight',
      vibrationEnabled: true,
      soundEnabled: true,
      compactView: false,
      autoShiftSubsequent: true,
      notificationsEnabled: true,
      selectedSoundTrack: 'june_songbirds',
    } as any,
    history: {},
  };

  it('does NOT resurrect remote override when local reset task to idle', () => {
    const dateStr = '2026-11-24';
    const remoteTime = 1000;
    const localResetTime = 2000;

    const remoteData: AppData = {
      ...dummyLocal,
      history: {
        [dateStr]: {
          completedTaskIds: [],
          completedAt: {},
          overrides: {
            'task-music': { startTime: '16:14', endTime: '18:02' },
          },
          progress: {
            'task-music': {
              status: 'paused',
              workedSeconds: 1000,
              lastStartedTimestamp: null,
              pausedTimestamp: remoteTime,
              plannedDurationSeconds: 7200,
              updatedAt: remoteTime,
            },
          },
        },
      },
    };

    const localData: AppData = {
      ...dummyLocal,
      history: {
        [dateStr]: {
          completedTaskIds: [],
          completedAt: {},
          overrides: {
            // override for task-music is deleted locally!
          },
          progress: {
            'task-music': {
              status: 'idle',
              workedSeconds: 0,
              lastStartedTimestamp: null,
              pausedTimestamp: null,
              plannedDurationSeconds: 7200,
              updatedAt: localResetTime,
            },
          },
        },
      },
    };

    const merged = mergeAppData(remoteData, localData);

    // Winner progress must be local idle
    expect(merged.history[dateStr].progress?.['task-music']?.status).toBe('idle');
    // Obsolete remote override MUST NOT be resurrected!
    expect(merged.history[dateStr].overrides?.['task-music']).toBeUndefined();
  });

  it('does NOT resurrect local override when remote reset task to idle', () => {
    const dateStr = '2026-11-24';
    const localTime = 1000;
    const remoteResetTime = 2000;

    const localData: AppData = {
      ...dummyLocal,
      history: {
        [dateStr]: {
          completedTaskIds: [],
          completedAt: {},
          overrides: {
            'task-music': { startTime: '16:14', endTime: '18:02' },
          },
          progress: {
            'task-music': {
              status: 'paused',
              workedSeconds: 1000,
              lastStartedTimestamp: null,
              pausedTimestamp: localTime,
              plannedDurationSeconds: 7200,
              updatedAt: localTime,
            },
          },
        },
      },
    };

    const remoteData: AppData = {
      ...dummyLocal,
      history: {
        [dateStr]: {
          completedTaskIds: [],
          completedAt: {},
          overrides: {},
          progress: {
            'task-music': {
              status: 'idle',
              workedSeconds: 0,
              lastStartedTimestamp: null,
              pausedTimestamp: null,
              plannedDurationSeconds: 7200,
              updatedAt: remoteResetTime,
            },
          },
        },
      },
    };

    const merged = mergeAppData(remoteData, localData);

    // Winner progress must be remote idle
    expect(merged.history[dateStr].progress?.['task-music']?.status).toBe('idle');
    // Obsolete local override MUST NOT be resurrected!
    expect(merged.history[dateStr].overrides?.['task-music']).toBeUndefined();
  });

  it('cascades cleanly when restoring a completed task while another task is running', () => {
    // Coding is running: 14:00 to 18:00 (4 hours)
    // Music was previously completed and now restored to plan
    // Sport is also pending
    const baseTasksLocal: TaskTemplate[] = [
      {
        id: 'task-coding',
        title: 'Кодинг',
        startTime: '09:00',
        endTime: '13:00',
        category: 'Работа',
        color: '#eab308',
        daysOfWeek: [1, 2, 3, 4, 5],
        order: 0,
        alarmEnabled: true,
        createdAt: '2026-11-20T10:00:00Z',
      },
      {
        id: 'task-music',
        title: 'Музыка',
        startTime: '13:00',
        endTime: '15:00', // 2 hours
        category: 'Хобби',
        color: '#3b82f6',
        daysOfWeek: [1, 2, 3, 4, 5],
        order: 1,
        alarmEnabled: true,
        createdAt: '2026-11-20T10:00:00Z',
      },
      {
        id: 'task-sport',
        title: 'Спорт',
        startTime: '15:00',
        endTime: '16:00', // 1 hour
        category: 'Здоровье',
        color: '#10b981',
        daysOfWeek: [1, 2, 3, 4, 5],
        order: 2,
        alarmEnabled: true,
        createdAt: '2026-11-20T10:00:00Z',
      },
    ];

    const currentOverrides: Record<string, DayTaskOverride> = {
      'task-coding': { startTime: '14:00', endTime: '18:00' },
      // task-music override deleted upon restore
    };

    const progress: Record<string, TaskProgressState> = {
      'task-coding': {
        status: 'running',
        workedSeconds: 0,
        lastStartedTimestamp: Date.now(),
        pausedTimestamp: null,
        plannedDurationSeconds: 14400,
        updatedAt: Date.now(),
      },
      'task-music': {
        status: 'idle',
        workedSeconds: 0,
        lastStartedTimestamp: null,
        pausedTimestamp: null,
        plannedDurationSeconds: 7200,
        updatedAt: Date.now(),
      },
    };

    const cascaded = cascadeSchedule(
      baseTasksLocal,
      currentOverrides,
      [], // music is no longer in completedTaskIds
      [],
      1,
      'task-coding',
      '18:00',
      '14:00',
      progress
    );

    // Restored task-music should be scheduled right after coding at 18:00 to 20:00
    expect(cascaded['task-music']).toEqual({ startTime: '18:00', endTime: '20:00' });
    // Sport should follow at 20:00 to 21:00
    expect(cascaded['task-sport']).toEqual({ startTime: '20:00', endTime: '21:00' });
  });

  it('excludes skipped tasks from cascade schedule', () => {
    const baseTasksLocal: TaskTemplate[] = [
      {
        id: 'task-coding',
        title: 'Кодинг',
        startTime: '09:00',
        endTime: '13:00',
        category: 'Работа',
        color: '#eab308',
        daysOfWeek: [1, 2, 3, 4, 5],
        order: 0,
        alarmEnabled: true,
        createdAt: '2026-11-20T10:00:00Z',
      },
      {
        id: 'task-music',
        title: 'Музыка',
        startTime: '13:00',
        endTime: '15:00',
        category: 'Хобби',
        color: '#3b82f6',
        daysOfWeek: [1, 2, 3, 4, 5],
        order: 1,
        alarmEnabled: true,
        createdAt: '2026-11-20T10:00:00Z',
      },
      {
        id: 'task-sport',
        title: 'Спорт',
        startTime: '15:00',
        endTime: '16:00',
        category: 'Здоровье',
        color: '#10b981',
        daysOfWeek: [1, 2, 3, 4, 5],
        order: 2,
        alarmEnabled: true,
        createdAt: '2026-11-20T10:00:00Z',
      },
    ];

    const currentOverrides: Record<string, DayTaskOverride> = {
      'task-coding': { startTime: '14:00', endTime: '18:00' },
    };

    // Music is skipped for today in excludedTaskIds
    const cascaded = cascadeSchedule(
      baseTasksLocal,
      currentOverrides,
      [],
      ['task-music'],
      1,
      'task-coding',
      '18:00',
      '14:00'
    );

    // Music should NOT be in cascaded overrides
    expect(cascaded['task-music']).toBeUndefined();
    // Sport should jump straight after coding: 18:00 to 19:00
    expect(cascaded['task-sport']).toEqual({ startTime: '18:00', endTime: '19:00' });
  });
});
