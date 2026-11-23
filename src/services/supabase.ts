import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AppData, TaskTemplate, DayLog } from '../types';

let cachedClient: SupabaseClient | null = null;
let currentUrl: string | null = null;
let currentKey: string | null = null;

export function getSupabaseClient(url?: string, key?: string): SupabaseClient | null {
  const envUrl = (import.meta as any).env?.VITE_SUPABASE_URL;
  const envKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;

  const targetUrl = url || envUrl;
  const targetKey = key || envKey;

  if (!targetUrl || !targetKey) {
    return null;
  }

  if (cachedClient && currentUrl === targetUrl && currentKey === targetKey) {
    return cachedClient;
  }

  try {
    cachedClient = createClient(targetUrl, targetKey);
    currentUrl = targetUrl;
    currentKey = targetKey;
    return cachedClient;
  } catch (err) {
    console.error('Error initializing Supabase client:', err);
    return null;
  }
}

export function parseTimestamp(ts?: string | null): number {
  if (!ts) return 0;
  const time = new Date(ts).getTime();
  return isNaN(time) ? 0 : time;
}

/**
 * Returns the partition key for user_routines table in Supabase
 * e.g. "user@example.com#planner" so it shares the same Supabase database seamlessly with Ежедневки!
 */
export function getPlannerCloudEmail(email: string): string {
  const clean = (email || 'default@planner.app').trim();
  if (clean.endsWith('#planner')) return clean;
  return `${clean}#planner`;
}

/**
 * Safe Conflict-Free (LWW) merge of remote and local application state
 */
export function mergeAppData(remote: AppData, local: AppData): AppData {
  const allDeletedTaskIds = new Set([
    ...(remote.deletedTaskIds || []),
    ...(local.deletedTaskIds || []),
  ]);

  const allDeletedCats = new Set([
    ...(remote.deletedCategories || []),
    ...(local.deletedCategories || []),
  ]);

  // Merge tasks: include non-deleted tasks
  const taskMap = new Map<string, TaskTemplate>();
  (remote.tasks || []).forEach((t) => {
    if (!allDeletedTaskIds.has(t.id)) {
      taskMap.set(t.id, t);
    }
  });
  (local.tasks || []).forEach((t) => {
    if (!allDeletedTaskIds.has(t.id)) {
      taskMap.set(t.id, t);
    }
  });

  // Merge categories
  const localCats = Array.isArray(local.categories) ? local.categories : [];
  const remoteCats = Array.isArray(remote.categories) ? remote.categories : [];
  const mergedCatsSet = new Set<string>();
  localCats.forEach((c) => {
    if (!allDeletedCats.has(c)) mergedCatsSet.add(c);
  });
  remoteCats.forEach((c) => {
    if (!allDeletedCats.has(c)) mergedCatsSet.add(c);
  });
  const mergedCategories = Array.from(mergedCatsSet);

  // Merge day history
  const allDates = new Set([
    ...Object.keys(remote.history || {}),
    ...Object.keys(local.history || {}),
  ]);
  const mergedHistory: Record<string, DayLog> = {};

  allDates.forEach((dateStr) => {
    const rLog = remote.history?.[dateStr];
    const lLog = local.history?.[dateStr];

    if (!rLog) {
      mergedHistory[dateStr] = lLog!;
      return;
    }
    if (!lLog) {
      mergedHistory[dateStr] = rLog;
      return;
    }

    const allCompleted = new Set([
      ...(rLog.completedTaskIds || []),
      ...(lLog.completedTaskIds || []),
    ]);

    const allExcluded = new Set([
      ...(rLog.excludedTaskIds || []),
      ...(lLog.excludedTaskIds || []),
    ]);

    // ---- LWW (Last-Write-Wins) merge of task progress across devices ----
    // For each task, pick whichever device has the MOST RECENT activity timestamp.
    // This ensures that "pause on phone" is not overwritten by "still running on desktop".
    const getProgressTimestamp = (p?: { status?: string; lastStartedTimestamp?: number | null; pausedTimestamp?: number | null }): number => {
      if (!p) return 0;
      if (p.status === 'paused' || p.status === 'completed') return p.pausedTimestamp || p.lastStartedTimestamp || 0;
      return p.lastStartedTimestamp || 0;
    };

    const allProgressTaskIds = new Set([
      ...Object.keys(rLog.progress || {}),
      ...Object.keys(lLog.progress || {}),
    ]);

    const mergedProgress: Record<string, import('../types').TaskProgressState> = {};
    allProgressTaskIds.forEach((taskId) => {
      const rProg = (rLog.progress || {})[taskId];
      const lProg = (lLog.progress || {})[taskId];
      if (!rProg) { mergedProgress[taskId] = lProg; return; }
      if (!lProg) { mergedProgress[taskId] = rProg; return; }

      // If one side is 'completed', always prefer completed
      if (lProg.status === 'completed') { mergedProgress[taskId] = lProg; return; }
      if (rProg.status === 'completed') { mergedProgress[taskId] = rProg; return; }

      // Otherwise pick the most recently changed record (Last-Write-Wins)
      const tLocal = getProgressTimestamp(lProg);
      const tRemote = getProgressTimestamp(rProg);
      mergedProgress[taskId] = tLocal >= tRemote ? lProg : rProg;
    });
    // -----------------------------------------------------------------------

    mergedHistory[dateStr] = {
      completedTaskIds: Array.from(allCompleted).filter((id) => !allDeletedTaskIds.has(id)),
      excludedTaskIds: Array.from(allExcluded).filter((id) => !allDeletedTaskIds.has(id)),
      completedAt: {
        ...(rLog.completedAt || {}),
        ...(lLog.completedAt || {}),
      },
      overrides: {
        ...(rLog.overrides || {}),
        ...(lLog.overrides || {}),
      },
      progress: mergedProgress,
    };
  });

  return {
    ...local,
    tasks: Array.from(taskMap.values()),
    deletedTaskIds: Array.from(allDeletedTaskIds),
    categories: mergedCategories,
    deletedCategories: Array.from(allDeletedCats),
    history: mergedHistory,
  };
}

/**
 * Push local data to Supabase with automatic merge
 */
export async function pushToCloud(
  appData: AppData,
  url?: string,
  key?: string
): Promise<{ success: boolean; data?: AppData; updatedAt?: string; message?: string }> {
  const client = getSupabaseClient(url, key);
  if (!client) return { success: false, message: 'Supabase не настроен' };

  const cloudEmail = getPlannerCloudEmail(appData?.account?.email);
  const now = new Date().toISOString();

  try {
    const { data: remoteRecord } = await client
      .from('user_routines')
      .select('data, updated_at')
      .eq('user_email', cloudEmail)
      .maybeSingle();

    let dataToPush = appData;
    if (remoteRecord && remoteRecord.data) {
      dataToPush = mergeAppData(remoteRecord.data as AppData, appData);
    }

    const { error } = await client.from('user_routines').upsert({
      user_email: cloudEmail,
      data: dataToPush,
      updated_at: now,
    });

    if (error) {
      console.warn('Push error to Supabase:', error);
      return { success: false, message: error.message };
    }
    return { success: true, data: dataToPush, updatedAt: now };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Ошибка отправки' };
  }
}

/**
 * Fast fetch remote data from Supabase
 */
export async function fetchFromCloud(
  url?: string,
  key?: string,
  email = 'user@planner.app'
): Promise<{ success: boolean; data?: AppData; updatedAt?: string }> {
  const client = getSupabaseClient(url, key);
  if (!client) return { success: false };

  const cloudEmail = getPlannerCloudEmail(email);

  try {
    const { data: remoteRecord, error } = await client
      .from('user_routines')
      .select('data, updated_at')
      .eq('user_email', cloudEmail)
      .maybeSingle();

    if (error) {
      return { success: false };
    }

    if (remoteRecord && remoteRecord.data) {
      return {
        success: true,
        data: remoteRecord.data as AppData,
        updatedAt: remoteRecord.updated_at,
      };
    }
    return { success: false };
  } catch {
    return { success: false };
  }
}

/**
 * Manual sync button trigger
 */
export async function syncWithCloud(
  appData: AppData,
  url?: string,
  key?: string
): Promise<{ success: boolean; data?: AppData; updatedAt?: string; message?: string }> {
  const client = getSupabaseClient(url, key);
  if (!client) {
    return {
      success: false,
      message: 'Supabase не настроен: укажите URL и Anon Key в настройках аккаунта',
    };
  }

  const cloudEmail = getPlannerCloudEmail(appData?.account?.email);

  try {
    const { data: remoteRecord } = await client
      .from('user_routines')
      .select('data, updated_at')
      .eq('user_email', cloudEmail)
      .maybeSingle();

    const now = new Date().toISOString();

    if (remoteRecord && remoteRecord.data) {
      const remoteData = remoteRecord.data as AppData;
      const mergedData = mergeAppData(remoteData, appData);

      await client.from('user_routines').upsert({
        user_email: cloudEmail,
        data: mergedData,
        updated_at: now,
      });

      return {
        success: true,
        data: mergedData,
        updatedAt: now,
        message: 'Данные успешно синхронизированы с облаком!',
      };
    } else {
      const { error: upsertError } = await client.from('user_routines').upsert({
        user_email: cloudEmail,
        data: appData,
        updated_at: now,
      });

      if (upsertError) {
        return { success: false, message: `Ошибка сохранения в облако: ${upsertError.message}` };
      }

      return {
        success: true,
        data: appData,
        updatedAt: now,
        message: 'Данные сохранены в облаке!',
      };
    }
  } catch (error: any) {
    return { success: false, message: error?.message || 'Ошибка подключения к облаку' };
  }
}
