import React, { useState, useEffect } from 'react';
import { Plus, Settings, Download, Hourglass, Cloud, RefreshCw, User, Moon, Sun, Leaf } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { usePlanner } from '../context/PlannerContext';
import { haptic } from '../utils/haptics';
import type { ThemeId } from '../types';

interface HeaderProps {
  onOpenNewTask: () => void;
  onOpenSettings: () => void;
  onOpenAccount: () => void;
  installPrompt: any;
  onInstall: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenNewTask,
  onOpenSettings,
  onOpenAccount,
  installPrompt,
  onInstall,
}) => {
  const { selectedDate, appData, isSyncing, triggerSync, currentTheme, setTheme } = usePlanner();
  const [dayCountdown, setDayCountdown] = useState<string>('24:00:00');

  const isCloudConfigured = Boolean(
    appData?.account?.cloudSyncEnabled &&
    appData?.account?.supabaseUrl &&
    appData?.account?.supabaseAnonKey
  );

  // Calculates countdown until end of day (24:00:00 -> 00:00:00)
  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date();
      const secondsPassed =
        now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
      const totalSecondsInDay = 24 * 3600;
      const remainingSeconds = Math.max(0, totalSecondsInDay - secondsPassed);

      const h = Math.floor(remainingSeconds / 3600);
      const m = Math.floor((remainingSeconds % 3600) / 60);
      const s = remainingSeconds % 60;

      const formatted = `${h.toString().padStart(2, '0')}:${m
        .toString()
        .padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

      setDayCountdown(formatted);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleCloudClick = async () => {
    haptic.light();
    if (isCloudConfigured) {
      await triggerSync();
    } else {
      onOpenAccount();
    }
  };

  const handleCycleTheme = () => {
    haptic.medium();
    const themeCycle: ThemeId[] = ['midnight', 'gold', 'emerald'];
    const nextIdx = (themeCycle.indexOf(currentTheme) + 1) % themeCycle.length;
    setTheme(themeCycle[nextIdx]);
  };

  const themeIcon = {
    midnight: <Moon className="w-4 h-4 text-sky-400" />,
    gold: <Sun className="w-4 h-4 text-amber-500" />,
    emerald: <Leaf className="w-4 h-4 text-emerald-400" />,
  }[currentTheme];

  const themeLabel = {
    midnight: 'Тема: Полночь (Референс)',
    gold: 'Тема: Золотой рассвет',
    emerald: 'Тема: Изумрудный лес',
  }[currentTheme];

  return (
    <header className="sticky top-0 z-40 w-full backdrop-blur-2xl transition-all duration-300" style={{ background: 'var(--topbar-bg)' }}>
      <div className="max-w-3xl mx-auto px-3 sm:px-4 h-16 flex items-center justify-between gap-2.5">
        {/* Left: Header Icon & Time Pill */}
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Static circular icon (default cursor, zero hover scale) */}
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-sm cursor-default select-none"
            style={{
              background: 'var(--theme-primary)',
              color: 'var(--btn-pill-text)',
            }}
          >
            <Hourglass className="w-5 h-5 stroke-[2.5]" />
          </div>

          {/* Text Info - Default Cursor */}
          <div className="min-w-0 cursor-default select-none">
            <div className="flex items-center gap-1.5">
              <h1 className="text-base sm:text-lg font-black tracking-tight leading-none truncate">
                Планер
              </h1>
              <span
                className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 transition-colors"
                style={{
                  background: 'var(--theme-accent-soft)',
                  color: 'var(--theme-primary)',
                }}
              >
                До конца дня
              </span>
            </div>
            <p className="text-[11px] font-bold leading-tight mt-0.5 flex items-center gap-1.5 truncate" style={{ color: 'var(--glass-text-sub)' }}>
              <span className="font-mono font-extrabold text-xs" style={{ color: 'var(--theme-primary)' }}>
                {dayCountdown}
              </span>
              <span>•</span>
              <span className="capitalize">{format(selectedDate, 'd MMM', { locale: ru })}</span>
            </p>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {installPrompt && (
            <button
              onClick={() => {
                haptic.medium();
                onInstall();
              }}
              className="ref-btn-pill px-3 py-1.5 text-xs flex items-center gap-1 cursor-pointer shrink-0"
              title="Установить приложение"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Установить</span>
            </button>
          )}

          {/* Theme Quick Cycler Button */}
          <button
            type="button"
            onClick={handleCycleTheme}
            className="ref-btn-circle w-9 h-9 sm:w-10 sm:h-10 cursor-pointer"
            title={themeLabel}
          >
            {themeIcon}
          </button>

          {/* Cloud Sync Status Button */}
          <button
            type="button"
            onClick={handleCloudClick}
            disabled={isSyncing}
            className="ref-btn-circle w-9 h-9 sm:w-10 sm:h-10 relative cursor-pointer"
            title={
              isSyncing
                ? 'Синхронизация с облаком...'
                : isCloudConfigured
                ? 'Облако синхронизировано (нажмите для проверки)'
                : 'Облако не настроено — нажмите для подключения'
            }
          >
            {isSyncing ? (
              <RefreshCw className="w-4 h-4 animate-spin" style={{ color: 'var(--theme-primary)' }} />
            ) : isCloudConfigured ? (
              <div className="relative flex items-center justify-center">
                <Cloud className="w-4 h-4" style={{ color: 'var(--theme-primary)' }} />
                <span
                  className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full"
                  style={{ background: 'var(--theme-primary)' }}
                />
              </div>
            ) : (
              <div className="relative flex items-center justify-center opacity-60">
                <Cloud className="w-4 h-4" style={{ color: 'var(--glass-text-sub)' }} />
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-slate-400" />
              </div>
            )}
          </button>

          {/* Account Button */}
          <button
            type="button"
            onClick={() => {
              haptic.light();
              onOpenAccount();
            }}
            className="ref-btn-circle w-9 h-9 sm:w-10 sm:h-10 cursor-pointer hidden sm:flex"
            title="Аккаунт и синхронизация"
          >
            <User className="w-4 h-4" />
          </button>

          {/* Settings Button */}
          <button
            onClick={() => {
              haptic.light();
              onOpenSettings();
            }}
            className="ref-btn-circle w-9 h-9 sm:w-10 sm:h-10 cursor-pointer"
            title="Настройки, темы и звук"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* Flat Pill Add Task Button (Reference Styled) */}
          <button
            onClick={() => {
              haptic.medium();
              onOpenNewTask();
            }}
            className="ref-btn-pill px-3.5 sm:px-4 py-2 text-xs sm:text-sm flex items-center gap-1.5 cursor-pointer shrink-0"
            title="Создать новую задачу"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Добавить</span>
          </button>
        </div>
      </div>
    </header>
  );
};
