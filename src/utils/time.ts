/**
 * Time utility functions for Planner
 */

/**
 * Converts "HH:mm" to total minutes from midnight (0..1439)
 */
export function timeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map((v) => parseInt(v, 10) || 0);
  return h * 60 + m;
}

/**
 * Converts total minutes from midnight to "HH:mm" format (wraps around 24 hours, clamps at 23:59 if desired)
 */
export function minutesToTime(minutes: number, clampDay: boolean = true): string {
  let m = minutes;
  if (clampDay) {
    if (m >= 24 * 60) m = 23 * 60 + 59;
    if (m < 0) m = 0;
  } else {
    m = ((m % (24 * 60)) + (24 * 60)) % (24 * 60);
  }
  const hours = Math.floor(m / 60);
  const mins = m % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

/**
 * Adds delta minutes to "HH:mm" string (wraps cleanly around 24 hours)
 */
export function addMinutesToTime(timeStr: string, deltaMinutes: number): string {
  const current = timeToMinutes(timeStr);
  return minutesToTime(current + deltaMinutes, false);
}

/**
 * Returns difference in minutes between end and start
 */
export function getDurationMinutes(startTime: string, endTime: string): number {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (end >= start) {
    return end - start;
  }
  // Crosses midnight
  return 24 * 60 - start + end;
}

/**
 * Formats duration in minutes to human-readable Russian string
 * e.g. 240 -> "4 ч", 150 -> "2 ч 30 мин", 45 -> "45 мин"
 */
export function formatDuration(minutes: number): string {
  if (minutes <= 0) return '0 мин';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0 && mins > 0) {
    return `${hours} ч ${mins} мин`;
  }
  if (hours > 0) {
    return `${hours} ч`;
  }
  return `${mins} мин`;
}

/**
 * Formats time range e.g. "08:00 – 12:00"
 */
export function formatTimeRange(startTime: string, endTime: string): string {
  return `${startTime} – ${endTime}`;
}

/**
 * Returns current local time as "HH:mm"
 */
export function getCurrentTimeString(date: Date = new Date()): string {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Checks if current time is within [startTime, endTime)
 */
export function isCurrentTimeWithin(startTime: string, endTime: string, nowMinutes?: number): boolean {
  const now = nowMinutes !== undefined ? nowMinutes : timeToMinutes(getCurrentTimeString());
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);

  if (end >= start) {
    return now >= start && now < end;
  }
  // Crosses midnight
  return now >= start || now < end;
}

/**
 * Checks if current time has passed endTime
 */
export function hasTimePassed(endTime: string, nowMinutes?: number): boolean {
  const now = nowMinutes !== undefined ? nowMinutes : timeToMinutes(getCurrentTimeString());
  const end = timeToMinutes(endTime);
  return now >= end;
}

/**
 * Formats total seconds to "HH:MM:SS" (e.g. 14400 -> "04:00:00", 3723 -> "01:02:03")
 */
export function formatSecondsToHMS(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

