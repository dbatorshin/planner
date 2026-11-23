export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

export type SoundTrackId = 'june_songbirds' | 'spring_day_forest' | 'morning_sunrise';

export type ThemeId = 'midnight' | 'gold' | 'emerald';

export interface TaskTemplate {
  id: string;
  title: string;
  description?: string;
  category: string;
  daysOfWeek: DayOfWeek[]; // which days this action repeats
  startTime: string; // HH:mm, e.g. "08:00"
  endTime: string; // HH:mm, e.g. "12:00"
  color: string; // hex color
  alarmEnabled: boolean; // alarm when endTime is reached
  createdAt: string;
  order: number;
}

export interface DayTaskOverride {
  startTime: string; // HH:mm
  endTime: string; // HH:mm
}

export interface TaskProgressState {
  status: 'idle' | 'running' | 'paused' | 'completed';
  workedSeconds: number; // actual seconds spent working
  lastStartedTimestamp: number | null; // epoch ms when current segment started
  pausedTimestamp: number | null; // epoch ms when pause started
  plannedDurationSeconds: number; // total planned seconds (e.g. 14400 for 4 hours)
}

export interface DayLog {
  completedTaskIds: string[]; // task IDs completed for this day
  completedAt: Record<string, string>; // taskId -> ISO timestamp
  overrides: Record<string, DayTaskOverride>; // taskId -> { startTime, endTime }
  progress?: Record<string, TaskProgressState>; // taskId -> live task progress
  excludedTaskIds?: string[]; // task IDs skipped or excluded for this day
}

export interface UserAccount {
  email: string;
  displayName?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  cloudSyncEnabled: boolean;
  lastSyncedAt?: string;
}

export interface AppSettings {
  soundEnabled: boolean;
  notificationsEnabled: boolean;
  autoShiftSubsequent: boolean;
  selectedSoundTrack: SoundTrackId;
  theme: ThemeId;
}

export type ViewMode = 'day' | 'week' | 'month';

export interface AppData {
  version: number;
  account: UserAccount;
  tasks: TaskTemplate[]; // Initially EMPTY array [] as instructed
  deletedTaskIds?: string[];
  categories: string[];
  deletedCategories?: string[];
  history: Record<string, DayLog>; // YYYY-MM-DD -> DayLog
  settings: AppSettings;
}
