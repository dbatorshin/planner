import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Download,
  Upload,
  Trash2,
  CheckCircle2,
  Cloud,
  Play,
  Square,
  Music,
  ChevronDown,
  FileJson,
  Palette,
  Moon,
  Sun,
  Leaf,
} from 'lucide-react';
import { usePlanner } from '../context/PlannerContext';
import { sound, SOUND_TRACKS, requestNotificationPermission } from '../utils/sound';
import { storage } from '../services/storage';
import { haptic } from '../utils/haptics';
import type { SoundTrackId, ThemeId } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenAccount: () => void;
}

const THEMES: { id: ThemeId; title: string; subtitle: string; icon: React.ReactNode; gradient: string }[] = [
  {
    id: 'midnight',
    title: 'Полночь',
    subtitle: 'Глубокий ночной сапфир, фарфор и небесно-голубой',
    icon: <Moon className="w-4 h-4 text-sky-400" />,
    gradient: 'linear-gradient(135deg, #0d2238 0%, #1e456a 100%)',
  },
  {
    id: 'gold',
    title: 'Золотой рассвет',
    subtitle: 'Светлые тона слоновой кости, солнечного желтого и золота',
    icon: <Sun className="w-4 h-4 text-amber-500" />,
    gradient: 'linear-gradient(135deg, #fef3c7 0%, #f59e0b 100%)',
  },
  {
    id: 'emerald',
    title: 'Изумрудный лес',
    subtitle: 'Глубокий хвойный фон, мятные и изумрудные тона',
    icon: <Leaf className="w-4 h-4 text-emerald-400" />,
    gradient: 'linear-gradient(135deg, #071f16 0%, #10b981 100%)',
  },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onOpenAccount,
}) => {
  const { appData, updateSettings, showToast, currentTheme, setTheme } = usePlanner();
  const [notificationStatus, setNotificationStatus] = useState<string>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'unsupported';
  });
  const [confirmClear, setConfirmClear] = useState(false);
  const [playingTrackId, setPlayingTrackId] = useState<SoundTrackId | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isDropdownOpen]);

  if (!isOpen) return null;

  const handlePlayPreview = (trackId: SoundTrackId) => {
    haptic.medium();
    if (playingTrackId === trackId) {
      sound.stopAlarm();
      setPlayingTrackId(null);
    } else {
      sound.previewSound(trackId);
      setPlayingTrackId(trackId);
      showToast('Воспроизведение мелодии...');
    }
  };

  const handleSelectTrack = (trackId: SoundTrackId) => {
    haptic.light();
    updateSettings({ selectedSoundTrack: trackId });
    setIsDropdownOpen(false);
  };

  const handleSelectTheme = (themeId: ThemeId) => {
    haptic.medium();
    setTheme(themeId);
    showToast(`Тема изменена: ${THEMES.find(t => t.id === themeId)?.title}`);
  };

  const handleRequestNotifications = async () => {
    haptic.light();
    const granted = await requestNotificationPermission();
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotificationStatus(Notification.permission);
    }
    if (granted) {
      updateSettings({ notificationsEnabled: true });
      showToast('Уведомления успешно включены!');
    } else {
      showToast('Разрешение на уведомления не получено');
    }
  };

  const handleExportData = () => {
    haptic.light();
    const jsonStr = storage.exportJSON(appData);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `planner_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Резервная копия сохранена в файл');
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const imported = storage.importJSON(content);
      if (imported) {
        window.location.reload();
      } else {
        showToast('Ошибка при загрузке файла резервной копии');
      }
    };
    reader.readAsText(file);
  };

  const handleClearAll = () => {
    haptic.medium();
    storage.clear();
    window.location.reload();
  };

  const selectedTrackId = appData.settings?.selectedSoundTrack || 'morning_sunrise';
  const currentTrack =
    SOUND_TRACKS.find((t) => t.id === selectedTrackId) || SOUND_TRACKS[0];
  const isPlayingCurrent = playingTrackId === currentTrack.id;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
      <div className="modal-container w-full max-w-lg shadow-2xl">
        {/* Pinned Header - Frameless */}
        <div
          className="flex items-center justify-between px-5 sm:px-6 py-4 shrink-0 backdrop-blur-sm"
          style={{
            background: 'var(--sheet-bg)',
          }}
        >
          <div className="flex items-center gap-2">
            <h3 className="text-base sm:text-lg font-black tracking-tight" style={{ color: 'var(--sheet-title)' }}>
              Настройки планера
            </h3>
          </div>
          <button
            onClick={() => {
              sound.stopAlarm();
              onClose();
            }}
            className="p-1.5 rounded-full hover:bg-black/5 transition cursor-pointer"
            style={{ color: 'var(--sheet-sub)' }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body - Frameless & Theme Colored */}
        <div className="modal-body p-5 sm:p-6 space-y-4">
          {/* THEME SELECTION: 3 THEMES */}
          <div className="space-y-2.5">
            <span className="text-xs font-black uppercase tracking-wide flex items-center gap-1.5" style={{ color: 'var(--sheet-title)' }}>
              <Palette className="w-3.5 h-3.5" style={{ color: 'var(--theme-primary)' }} />
              Тема оформления приложения
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {THEMES.map((theme) => {
                const isSelected = currentTheme === theme.id;
                return (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => handleSelectTheme(theme.id)}
                    className="p-3 rounded-2xl text-left transition-all duration-200 cursor-pointer relative overflow-hidden flex flex-col justify-between"
                    style={{
                      background: 'var(--sheet-card-bg)',
                      boxShadow: isSelected ? '0 0 0 2px var(--theme-primary)' : 'var(--sheet-card-shadow)',
                    }}
                  >
                    <div>
                      {/* Theme color miniature pill */}
                      <div className="flex items-center justify-between mb-2">
                        <div
                          className="w-7 h-7 rounded-xl flex items-center justify-center shadow-xs"
                          style={{ background: theme.gradient }}
                        >
                          {theme.icon}
                        </div>
                        {isSelected && (
                          <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: 'var(--theme-primary)' }} />
                        )}
                      </div>

                      <span className="text-xs font-black block leading-snug" style={{ color: 'var(--sheet-title)' }}>
                        {theme.title}
                      </span>
                      <span className="text-[10px] font-semibold block leading-tight mt-0.5 line-clamp-2" style={{ color: 'var(--sheet-sub)' }}>
                        {theme.subtitle}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cloud Sync Quick Entry Banner */}
          <div
            className="p-3.5 rounded-2xl flex items-center justify-between"
            style={{
              background: 'var(--sheet-card-bg)',
              boxShadow: 'var(--sheet-card-shadow)',
            }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  background: 'var(--theme-accent-soft)',
                  color: 'var(--theme-primary)',
                }}
              >
                <Cloud className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-black block truncate" style={{ color: 'var(--sheet-title)' }}>
                  Облачная синхронизация
                </span>
                <span className="text-[11px] font-semibold block truncate" style={{ color: 'var(--sheet-sub)' }}>
                  {appData?.account?.cloudSyncEnabled
                    ? `Активно • ${appData.account.email}`
                    : 'Синхронизация между ПК и телефоном'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenAccount();
              }}
              className="ref-btn-pill px-3.5 py-1.5 text-xs font-black cursor-pointer shrink-0 ml-2"
            >
              Настроить
            </button>
          </div>

          {/* Melodies: COMPACT DROPDOWN SELECTOR */}
          <div className="space-y-2">
            <span className="text-xs font-black uppercase tracking-wide flex items-center gap-1.5" style={{ color: 'var(--sheet-title)' }}>
              <Music className="w-3.5 h-3.5" style={{ color: 'var(--theme-primary)' }} />
              Мелодия будильника • Натуральный стерео-звук
            </span>

            <div className="flex items-center gap-2" ref={dropdownRef}>
              {/* Dropdown Button */}
              <div className="relative flex-1">
                <button
                  type="button"
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="w-full p-2.5 sm:p-3 rounded-2xl flex items-center justify-between gap-2 transition cursor-pointer text-left"
                  style={{
                    background: 'var(--sheet-card-bg)',
                    boxShadow: 'var(--sheet-card-shadow)',
                  }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-lg shrink-0">{currentTrack.icon}</span>
                    <div className="min-w-0">
                      <span className="text-xs font-black block truncate" style={{ color: 'var(--sheet-title)' }}>
                        {currentTrack.title}
                      </span>
                      <span className="text-[10px] font-semibold block truncate" style={{ color: 'var(--sheet-sub)' }}>
                        {currentTrack.subtitle}
                      </span>
                    </div>
                  </div>

                  <ChevronDown
                    className={`w-4 h-4 shrink-0 transition-transform duration-200 ${
                      isDropdownOpen ? 'rotate-180' : ''
                    }`}
                    style={{ color: 'var(--sheet-sub)' }}
                  />
                </button>

                {/* Dropdown Menu Options */}
                {isDropdownOpen && (
                  <div
                    className="absolute top-full left-0 right-0 mt-1.5 z-30 rounded-2xl shadow-xl overflow-hidden py-1 animate-in fade-in zoom-in-95 duration-150"
                    style={{
                      background: 'var(--sheet-card-bg)',
                    }}
                  >
                    {SOUND_TRACKS.map((t) => {
                      const isSelected = t.id === selectedTrackId;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => handleSelectTrack(t.id)}
                          className="w-full p-2.5 px-3 flex items-center justify-between gap-2.5 text-left transition cursor-pointer hover:opacity-85"
                          style={{
                            background: isSelected ? 'var(--theme-accent-soft)' : 'transparent',
                          }}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="text-base shrink-0">{t.icon}</span>
                            <div className="min-w-0">
                              <span className="text-xs font-bold block truncate" style={{ color: 'var(--sheet-title)' }}>
                                {t.title}
                              </span>
                              <span className="text-[10px] font-medium block truncate" style={{ color: 'var(--sheet-sub)' }}>
                                {t.subtitle}
                              </span>
                            </div>
                          </div>

                          {isSelected && (
                            <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: 'var(--theme-primary)' }} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Listen / Preview Button */}
              <button
                type="button"
                onClick={() => handlePlayPreview(currentTrack.id)}
                className={`py-2.5 px-3.5 sm:px-4 rounded-2xl text-xs font-black flex items-center gap-1.5 transition active:scale-95 cursor-pointer shrink-0 ${
                  isPlayingCurrent
                    ? 'bg-rose-500 text-white shadow-rose-500/20'
                    : 'ref-btn-pill'
                }`}
                title={isPlayingCurrent ? 'Остановить воспроизведение' : 'Прослушать мелодию'}
              >
                {isPlayingCurrent ? (
                  <>
                    <Square className="w-3.5 h-3.5 fill-current" />
                    <span>Стоп</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Слушать</span>
                  </>
                )}
              </button>
            </div>

            {/* Sound On/Off & Notifications */}
            <div
              className="p-3.5 rounded-2xl space-y-2.5 mt-2"
              style={{
                background: 'var(--sheet-card-bg)',
                boxShadow: 'var(--sheet-card-shadow)',
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-black block" style={{ color: 'var(--sheet-title)' }}>
                    Звуковой сигнал будильника
                  </span>
                  <span className="text-[11px] font-semibold block" style={{ color: 'var(--sheet-sub)' }}>
                    Воспроизводить звук при окончании запланированного времени
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={appData.settings?.soundEnabled ?? true}
                    onChange={(e) => updateSettings({ soundEnabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div
                    className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all"
                    style={{
                      backgroundColor: appData.settings?.soundEnabled ? 'var(--theme-primary)' : undefined,
                    }}
                  />
                </label>
              </div>

              <div className="pt-2 flex items-center justify-between">
                <div>
                  <span className="text-xs font-black block" style={{ color: 'var(--sheet-title)' }}>
                    Системные push-уведомления
                  </span>
                  <span className="text-[11px] font-semibold block" style={{ color: 'var(--sheet-sub)' }}>
                    Статус: {notificationStatus === 'granted' ? 'Разрешено' : 'Не включено'}
                  </span>
                </div>
                {notificationStatus !== 'granted' ? (
                  <button
                    type="button"
                    onClick={handleRequestNotifications}
                    className="ref-btn-soft px-3 py-1.5 text-xs font-black transition active:scale-95 cursor-pointer"
                  >
                    Включить
                  </button>
                ) : (
                  <span className="text-xs font-black flex items-center gap-1" style={{ color: 'var(--theme-primary)' }}>
                    <CheckCircle2 className="w-4 h-4" />
                    Активно
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Automatic Shift Settings */}
          <div className="space-y-2">
            <span className="text-xs font-black uppercase tracking-wide block" style={{ color: 'var(--sheet-title)' }}>
              Авто-сдвиг задач
            </span>

            <div
              className="p-3.5 rounded-2xl flex items-center justify-between"
              style={{
                background: 'var(--sheet-card-bg)',
                boxShadow: 'var(--sheet-card-shadow)',
              }}
            >
              <div className="pr-3">
                <span className="text-xs font-black block" style={{ color: 'var(--sheet-title)' }}>
                  Сдвигать последующие задачи
                </span>
                <span className="text-[11px] font-semibold block" style={{ color: 'var(--sheet-sub)' }}>
                  При изменении времени или паузе задачи автоматически сдвигать все следующие за ней
                </span>
              </div>

              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={appData.settings?.autoShiftSubsequent ?? true}
                  onChange={(e) => updateSettings({ autoShiftSubsequent: e.target.checked })}
                  className="sr-only peer"
                />
                <div
                  className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all"
                  style={{
                    backgroundColor: appData.settings?.autoShiftSubsequent ? 'var(--theme-primary)' : undefined,
                  }}
                />
              </label>
            </div>
          </div>

          {/* Backup / Restore Section with clear explanations */}
          <div className="space-y-2">
            <span className="text-xs font-black uppercase tracking-wide flex items-center gap-1.5" style={{ color: 'var(--sheet-title)' }}>
              <FileJson className="w-3.5 h-3.5" style={{ color: 'var(--theme-primary)' }} />
              Резервное копирование
            </span>

            <div
              className="p-3.5 rounded-2xl space-y-3"
              style={{
                background: 'var(--sheet-card-bg)',
                boxShadow: 'var(--sheet-card-shadow)',
              }}
            >
              <p className="text-[11px] font-semibold leading-relaxed" style={{ color: 'var(--sheet-sub)' }}>
                Сохраните файл с вашими задачами на компьютер или телефон. Это ваша страховка на случай очистки истории браузера.
              </p>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleExportData}
                  className="ref-btn-soft py-2.5 px-3 text-xs font-black flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Скачать копию</span>
                </button>

                <label
                  className="ref-btn-soft py-2.5 px-3 text-xs font-black flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Загрузить копию</span>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleImportFile}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Clear Data Section */}
          <div className="pt-2">
            {confirmClear ? (
              <div className="p-3.5 rounded-2xl bg-rose-50 space-y-2">
                <p className="text-xs font-bold text-rose-800">
                  Вы уверены? Все созданные задачи и история будут полностью очищены.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="flex-1 py-2 text-xs font-black text-white bg-rose-600 rounded-xl hover:bg-rose-700 cursor-pointer shadow-xs"
                  >
                    Да, очистить всё
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 bg-white rounded-xl cursor-pointer"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="text-xs font-bold text-rose-500 hover:text-rose-600 flex items-center gap-1.5 p-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Сбросить все данные приложения</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
