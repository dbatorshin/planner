import type { AppData, UserAccount } from '../types';

const STORAGE_KEY = 'planner_app_data_v1';

export const DEFAULT_SUPABASE_URL = 'https://zslokbquzrqhgcjsvzoq.supabase.co';
export const DEFAULT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzbG9rYnF1enJxaGdjanN2em9xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ3MzcyNjcsImV4cCI6MjExMDMxMzI2N30.C8xZdBOMqtsMGNlIB1KlptkF-6iXQqib5PG9E8VLlYE';

export function getAutoImportedAccount(): UserAccount {
  const defaultAcc: UserAccount = {
    email: 'user@planner.app',
    displayName: 'Пользователь',
    cloudSyncEnabled: true,
    supabaseUrl: DEFAULT_SUPABASE_URL,
    supabaseAnonKey: DEFAULT_SUPABASE_KEY,
  };

  if (typeof window === 'undefined') return defaultAcc;

  // 1. Check URL hash first (e.g. #sync=base64_json from PC share link)
  try {
    const hash = window.location.hash;
    if (hash && hash.includes('sync=')) {
      const match = hash.match(/sync=([^&]+)/);
      if (match && match[1]) {
        const decoded = JSON.parse(decodeURIComponent(atob(match[1])));
        if (decoded.u && decoded.k) {
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
          return {
            email: decoded.e || defaultAcc.email,
            displayName: (decoded.e ? decoded.e.split('@')[0] : defaultAcc.displayName),
            supabaseUrl: decoded.u,
            supabaseAnonKey: decoded.k,
            cloudSyncEnabled: true,
          };
        }
      }
    }
  } catch (err) {
    console.warn('Failed to parse #sync hash:', err);
  }

  // 2. Check if user has Supabase credentials in "Ежедневки" in this browser's localStorage
  try {
    const activeDailyEmail = localStorage.getItem('daily_routines_active_email');
    if (activeDailyEmail) {
      const dailyDataStr = localStorage.getItem(`daily_routines_data_${activeDailyEmail}`);
      if (dailyDataStr) {
        const dailyData = JSON.parse(dailyDataStr);
        if (dailyData?.account?.supabaseUrl && dailyData?.account?.supabaseAnonKey) {
          return {
            email: dailyData.account.email || activeDailyEmail,
            displayName: dailyData.account.displayName || activeDailyEmail.split('@')[0],
            supabaseUrl: dailyData.account.supabaseUrl,
            supabaseAnonKey: dailyData.account.supabaseAnonKey,
            cloudSyncEnabled: dailyData.account.cloudSyncEnabled ?? true,
          };
        }
      }
    }
  } catch {}

  return defaultAcc;
}

export const INITIAL_APP_DATA: AppData = {
  version: 1,
  account: getAutoImportedAccount(),
  tasks: [],
  categories: ['Работа', 'Обучение', 'Контент', 'Спорт', 'Отдых'],
  history: {},
  settings: {
    soundEnabled: true,
    notificationsEnabled: true,
    autoShiftSubsequent: true,
    selectedSoundTrack: 'morning_sunrise',
    theme: 'midnight',
  },
};

export const storage = {
  load(): AppData {
    try {
      const serialized = localStorage.getItem(STORAGE_KEY);
      const autoAcc = getAutoImportedAccount();

      if (!serialized) {
        return {
          ...INITIAL_APP_DATA,
          account: autoAcc,
        };
      }
      const parsed = JSON.parse(serialized);

      const rawUrl = parsed.account?.supabaseUrl?.trim();
      const rawKey = parsed.account?.supabaseAnonKey?.trim();
      const finalUrl = rawUrl || autoAcc.supabaseUrl;
      const finalKey = rawKey || autoAcc.supabaseAnonKey;

      return {
        ...INITIAL_APP_DATA,
        ...parsed,
        account: {
          ...autoAcc,
          ...(parsed.account || {}),
          supabaseUrl: finalUrl,
          supabaseAnonKey: finalKey,
          cloudSyncEnabled: (finalUrl && finalKey)
            ? (parsed.account?.cloudSyncEnabled ?? true)
            : false,
        },
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
        categories: Array.isArray(parsed.categories) && parsed.categories.length > 0
          ? parsed.categories
          : INITIAL_APP_DATA.categories,
        settings: {
          ...INITIAL_APP_DATA.settings,
          ...(parsed.settings || {}),
        },
        history: parsed.history || {},
      };
    } catch (e) {
      console.error('Failed to load Planner data from localStorage:', e);
      return INITIAL_APP_DATA;
    }
  },

  save(data: AppData) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save Planner data to localStorage:', e);
    }
  },

  clear() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
  },

  exportJSON(data: AppData): string {
    return JSON.stringify(data, null, 2);
  },

  importJSON(jsonString: string): AppData | null {
    try {
      const parsed = JSON.parse(jsonString);
      if (parsed && typeof parsed === 'object') {
        const merged: AppData = {
          ...INITIAL_APP_DATA,
          ...parsed,
          tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
          categories: Array.isArray(parsed.categories) ? parsed.categories : INITIAL_APP_DATA.categories,
          history: parsed.history || {},
        };
        this.save(merged);
        return merged;
      }
    } catch (e) {
      console.error('Failed to import JSON data:', e);
    }
    return null;
  },
};
