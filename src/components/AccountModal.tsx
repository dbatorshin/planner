import React, { useState, useEffect } from 'react';
import {
  X,
  Mail,
  Cloud,
  RefreshCw,
  Copy,
  Check,
  Smartphone,
  ShieldCheck,
  CheckCircle2,
  Lock,
  KeyRound,
  ScanFace,
} from 'lucide-react';
import { usePlanner } from '../context/PlannerContext';
import { haptic } from '../utils/haptics';
import { isPinConfigured, removeAppPin, lockApp } from './PinLock';
import {
  isBiometricsEnabled,
  setBiometricsEnabled,
  hasBiometricsCredential,
  isPlatformAuthenticatorAvailable,
  registerBiometrics,
} from '../utils/biometrics';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AccountModal: React.FC<AccountModalProps> = ({ isOpen, onClose }) => {
  const {
    appData,
    updateAccount,
    triggerSync,
    isSyncing,
    showToast,
  } = usePlanner();

  const [email, setEmail] = useState(() => appData?.account?.email || 'user@planner.app');
  const [supabaseUrl, setSupabaseUrl] = useState(() => appData?.account?.supabaseUrl || '');
  const [supabaseKey, setSupabaseKey] = useState(() => appData?.account?.supabaseAnonKey || '');
  const [syncEnabled, setSyncEnabled] = useState(() => appData?.account?.cloudSyncEnabled || false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(() => !appData?.account?.supabaseUrl || !appData?.account?.supabaseAnonKey);
  const [hasPinState, setHasPinState] = useState(() => isPinConfigured());
  const [biometricsEnabled, setBiometricsEnabledState] = useState(() => isBiometricsEnabled());
  const [isBiometricsSupported, setIsBiometricsSupported] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setHasPinState(isPinConfigured());
      setBiometricsEnabledState(isBiometricsEnabled());
      isPlatformAuthenticatorAvailable().then(setIsBiometricsSupported);
      if (!appData?.account?.supabaseUrl || !appData?.account?.supabaseAnonKey) {
        setShowAdvanced(true);
      }
    }
  }, [isOpen]);

  const handleToggleSync = (checked: boolean) => {
    setSyncEnabled(checked);
    if (checked && (!supabaseUrl.trim() || !supabaseKey.trim())) {
      setShowAdvanced(true);
      showToast('Укажите параметры Supabase ниже для синхронизации');
    }
  };

  const handleToggleBiometrics = async (checked: boolean) => {
    haptic.light();
    if (checked) {
      if (!hasPinState) {
        showToast('Сначала создайте PIN-код');
        return;
      }
      if (hasBiometricsCredential()) {
        setBiometricsEnabled(true);
        setBiometricsEnabledState(true);
        showToast('Вход по Face ID включён');
      } else {
        const res = await registerBiometrics();
        if (res.success) {
          setBiometricsEnabledState(true);
          showToast('Face ID успешно привязан');
        } else {
          setBiometricsEnabledState(false);
          showToast(res.error || 'Не удалось привязать Face ID');
        }
      }
    } else {
      setBiometricsEnabled(false);
      setBiometricsEnabledState(false);
      showToast('Вход по биометрии выключен');
    }
  };

  useEffect(() => {
    if (appData?.account) {
      setEmail(appData.account.email || 'user@planner.app');
      setSupabaseUrl(appData.account.supabaseUrl || '');
      setSupabaseKey(appData.account.supabaseAnonKey || '');
      setSyncEnabled(appData.account.cloudSyncEnabled || false);
    }
  }, [appData?.account, isOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSaveAndSync = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    haptic.medium();

    const cleanEmail = email.trim() || 'user@planner.app';
    const cleanUrl = supabaseUrl.trim();
    const cleanKey = supabaseKey.trim();

    const accountUpdates = {
      email: cleanEmail,
      supabaseUrl: cleanUrl,
      supabaseAnonKey: cleanKey,
      cloudSyncEnabled: syncEnabled,
    };

    updateAccount(accountUpdates);

    if (syncEnabled && cleanUrl && cleanKey) {
      const res = await triggerSync(cleanUrl, cleanKey, accountUpdates);
      if (res.success) {
        haptic.success();
      }
    } else {
      showToast('Настройки аккаунта сохранены');
    }
  };

  const handleCopyMobileLink = () => {
    haptic.light();
    const cleanUrl = supabaseUrl.trim();
    const cleanKey = supabaseKey.trim();
    const cleanEmail = email.trim() || 'user@planner.app';

    if (!cleanUrl || !cleanKey) {
      showToast('Сначала укажите Supabase URL и Anon Key');
      return;
    }

    const payload = {
      u: cleanUrl,
      k: cleanKey,
      e: cleanEmail,
    };
    const b64 = btoa(encodeURIComponent(JSON.stringify(payload)));
    const link = `${window.location.origin}${window.location.pathname}#sync=${b64}`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link)
        .then(() => {
          setCopiedLink(true);
          showToast('Ссылка скопирована! Откройте её на смартфоне');
          setTimeout(() => setCopiedLink(false), 3500);
        })
        .catch(() => {
          prompt('Скопируйте эту ссылку для быстрой настройки на телефоне:', link);
        });
    } else {
      prompt('Скопируйте эту ссылку для быстрой настройки на телефоне:', link);
    }
  };

  const isConnected = Boolean(
    appData?.account?.cloudSyncEnabled &&
    appData?.account?.supabaseUrl &&
    appData?.account?.supabaseAnonKey
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
      <div className="modal-container w-full max-w-lg shadow-2xl">
        {/* Fixed Pinned Header - Frameless */}
        <div
          className="flex items-center justify-between px-5 sm:px-6 py-4 shrink-0 backdrop-blur-sm"
          style={{
            background: 'var(--sheet-bg)',
          }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-2xl flex items-center justify-center"
              style={{
                background: 'var(--theme-accent-soft)',
                color: 'var(--theme-primary)',
              }}
            >
              <Cloud className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight leading-tight" style={{ color: 'var(--sheet-title)' }}>
                Облачная синхронизация
              </h2>
              <p className="text-[11px] font-bold" style={{ color: 'var(--sheet-sub)' }}>
                Синхронизация между ПК и смартфоном
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-black/5 transition cursor-pointer"
            style={{ color: 'var(--sheet-sub)' }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body - Frameless & Theme Colored */}
        <div className="modal-body p-5 sm:p-6 space-y-4">

        {/* Sync Status Banner */}
        <div
          className="p-3.5 rounded-2xl flex items-center justify-between transition-all"
          style={{
            background: 'var(--sheet-card-bg)',
            boxShadow: 'var(--sheet-card-shadow)',
          }}
        >
          <div className="flex items-center gap-2.5">
            {isSyncing ? (
              <RefreshCw className="w-5 h-5 animate-spin" style={{ color: 'var(--theme-primary)' }} />
            ) : isConnected ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            ) : (
              <Cloud className="w-5 h-5 text-slate-400" />
            )}
            <div>
              <span className="text-xs font-black block" style={{ color: 'var(--sheet-title)' }}>
                {isSyncing
                  ? 'Синхронизация с облаком...'
                  : isConnected
                  ? `Облако активно • ${appData.tasks.length} задач`
                  : 'Синхронизация не настроена'}
              </span>
              <span className="text-[11px] font-semibold block" style={{ color: 'var(--sheet-sub)' }}>
                {isConnected
                  ? 'Изменения мгновенно передаются на все ваши устройства'
                  : 'Подключите Supabase для авто-синхронизации со смартфоном'}
              </span>
            </div>
          </div>

          {isConnected && (
            <button
              type="button"
              disabled={isSyncing}
              onClick={() => handleSaveAndSync()}
              className="ref-btn-soft px-3 py-1.5 text-xs font-black flex items-center gap-1.5 transition active:scale-95 cursor-pointer shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>Синхронизировать</span>
            </button>
          )}
        </div>

        {/* Form Settings */}
        <form onSubmit={handleSaveAndSync} className="space-y-4">
          {/* Account Email */}
          <div>
            <label className="block text-xs font-black uppercase tracking-wide mb-1 flex items-center gap-1.5" style={{ color: 'var(--sheet-title)' }}>
              <Mail className="w-3.5 h-3.5" style={{ color: 'var(--theme-primary)' }} />
              Email аккаунта
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="w-full px-4 py-2.5 rounded-xl text-sm font-bold transition-all outline-none"
              style={{
                background: 'var(--sheet-card-bg)',
                color: 'var(--sheet-title)',
                boxShadow: 'var(--sheet-card-shadow)',
              }}
            />
            <span className="text-[11px] font-semibold block mt-1" style={{ color: 'var(--sheet-sub)' }}>
              Укажите одинаковый email на компьютере и телефоне, чтобы задачи синхронизировались.
            </span>
          </div>

          {/* Sync Switch */}
          <div
            className="p-3.5 rounded-2xl flex items-center justify-between"
            style={{
              background: 'var(--sheet-card-bg)',
              boxShadow: 'var(--sheet-card-shadow)',
            }}
          >
            <div className="pr-3">
              <span className="text-xs font-black block" style={{ color: 'var(--sheet-title)' }}>
                Включить авто-синхронизацию
              </span>
              <span className="text-[11px] font-semibold block" style={{ color: 'var(--sheet-sub)' }}>
                Автоматически отправлять и получать задачи при любом изменении
              </span>
            </div>

            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={syncEnabled}
                onChange={(e) => handleToggleSync(e.target.checked)}
                className="sr-only peer"
              />
              <div
                className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all"
                style={{
                  backgroundColor: syncEnabled ? 'var(--theme-primary)' : undefined,
                }}
              />
            </label>
          </div>

          {/* Quick Connect Mobile Link Card */}
          <div
            className="p-3.5 rounded-2xl space-y-2.5 transition-all"
            style={{
              background: 'var(--sheet-card-bg)',
              boxShadow: 'var(--sheet-card-shadow)',
            }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wide flex items-center gap-1.5" style={{ color: 'var(--sheet-title)' }}>
                <Smartphone className="w-3.5 h-3.5" style={{ color: 'var(--theme-primary)' }} />
                Быстрое подключение на смартфоне
              </span>
              {Boolean(supabaseUrl.trim() && supabaseKey.trim()) ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/15 text-emerald-600">
                  Готово к отправке
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/15 text-amber-600">
                  Требуются ключи
                </span>
              )}
            </div>
            <p className="text-[11px] font-bold leading-relaxed" style={{ color: 'var(--sheet-sub)' }}>
              {Boolean(supabaseUrl.trim() && supabaseKey.trim())
                ? 'Нажмите кнопку ниже, чтобы скопировать ссылку. Отправьте её себе в Telegram или WhatsApp и откройте на телефоне — телефон настроится за 1 секунду без ввода ключей!'
                : 'Вставьте ваши Project URL и Anon Key в параметры ниже, затем нажмите эту кнопку для быстрой отправки ссылки на смартфон.'}
            </p>
            <button
              type="button"
              onClick={handleCopyMobileLink}
              className={`ref-btn-pill w-full py-2.5 px-4 text-xs flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-all ${
                !supabaseUrl.trim() || !supabaseKey.trim() ? 'opacity-70' : ''
              }`}
            >
              {copiedLink ? (
                <>
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>Ссылка скопирована! Откройте на телефоне</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Скопировать ссылку для настройки телефона</span>
                </>
              )}
            </button>
          </div>

          {/* Collapsible Supabase Parameters */}
          <div
            className="rounded-2xl p-3.5 space-y-3"
            style={{
              background: 'var(--sheet-card-bg)',
              boxShadow: 'var(--sheet-card-shadow)',
            }}
          >
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-between text-xs font-black cursor-pointer"
              style={{ color: 'var(--sheet-title)' }}
            >
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" style={{ color: 'var(--theme-primary)' }} />
                Параметры подключения Supabase
              </span>
              <span className="font-extrabold text-[11px]" style={{ color: 'var(--theme-primary)' }}>
                {showAdvanced ? 'Скрыть ▲' : 'Показать ▼'}
              </span>
            </button>

            {showAdvanced && (
              <div className="space-y-3 pt-2">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-bold" style={{ color: 'var(--sheet-sub)' }}>
                      Supabase Project URL:
                    </label>
                    <span
                      className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                        supabaseUrl.trim() ? 'bg-emerald-500/15 text-emerald-600' : 'bg-slate-200 text-slate-500'
                      }`}
                    >
                      {supabaseUrl.trim() ? 'Заполнено' : 'Не заполнено'}
                    </span>
                  </div>
                  <input
                    type="url"
                    value={supabaseUrl}
                    onChange={(e) => setSupabaseUrl(e.target.value)}
                    placeholder="Вставьте URL, например: https://abcdef.supabase.co"
                    className="w-full px-3 py-2 rounded-xl text-xs font-mono font-bold outline-none"
                    style={{
                      background: 'var(--sheet-bg)',
                      color: 'var(--sheet-title)',
                    }}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-bold" style={{ color: 'var(--sheet-sub)' }}>
                      Supabase Anon Public Key:
                    </label>
                    <span
                      className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                        supabaseKey.trim() ? 'bg-emerald-500/15 text-emerald-600' : 'bg-slate-200 text-slate-500'
                      }`}
                    >
                      {supabaseKey.trim() ? 'Заполнено' : 'Не заполнено'}
                    </span>
                  </div>
                  <textarea
                    rows={2}
                    value={supabaseKey}
                    onChange={(e) => setSupabaseKey(e.target.value)}
                    placeholder="Вставьте anon key из раздела Project Settings -> API"
                    className="w-full px-3 py-2 rounded-xl text-xs font-mono font-bold outline-none"
                    style={{
                      background: 'var(--sheet-bg)',
                      color: 'var(--sheet-title)',
                    }}
                  />
                </div>

                <div className="p-3 rounded-xl space-y-1.5" style={{ background: 'var(--sheet-bg)' }}>
                  <p className="text-[11px] font-bold" style={{ color: 'var(--sheet-title)' }}>
                    💡 Как настроить синхронизацию:
                  </p>
                  <p className="text-[10px] font-semibold leading-relaxed" style={{ color: 'var(--sheet-sub)' }}>
                    1. Укажите те же Project URL и Anon Key, что и в «Ежедневках». База данных общая — задачи из «Ежедневок» не затронутся, так как планер хранит данные с суффиксом <code className="font-mono px-1 py-0.5 rounded bg-black/10">#planner</code>.
                  </p>
                  <p className="text-[10px] font-semibold leading-relaxed" style={{ color: 'var(--sheet-sub)' }}>
                    2. Нажмите «Сохранить и синхронизировать» внизу.
                  </p>
                  <p className="text-[10px] font-semibold leading-relaxed" style={{ color: 'var(--sheet-sub)' }}>
                    3. Затем нажмите кнопку выше «Скопировать ссылку для настройки телефона» — отправьте её себе в мессенджер и откройте на телефоне. Телефон подключится мгновенно без ручного ввода ключей.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Section: Security & PIN Code */}
          <div
            className="rounded-2xl p-3.5 space-y-3"
            style={{
              background: 'var(--sheet-card-bg)',
              boxShadow: 'var(--sheet-card-shadow)',
            }}
          >
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4" style={{ color: 'var(--theme-primary)' }} />
              <h4 className="text-xs font-black uppercase tracking-wider" style={{ color: 'var(--sheet-title)' }}>
                Безопасность и PIN-код
              </h4>
            </div>

            <p className="text-xs font-semibold leading-relaxed" style={{ color: 'var(--sheet-sub)' }}>
              {hasPinState
                ? 'PIN-код активен. Доступ к вашему планеру надёжно защищён 4-значным паролем.'
                : 'PIN-код не установлен. При следующем входе приложение предложит задать 4-значный код.'}
            </p>

            {/* Face ID / Biometrics Switch */}
            <div
              className="flex items-center justify-between p-3 rounded-xl transition-all"
              style={{
                background: 'var(--sheet-bg)',
              }}
            >
              <div className="pr-3 flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    background: 'var(--theme-accent-soft)',
                    color: 'var(--theme-primary)',
                  }}
                >
                  <ScanFace className="w-4 h-4 stroke-[2.2]" />
                </div>
                <div>
                  <span className="text-xs font-black block" style={{ color: 'var(--sheet-title)' }}>
                    Вход по Face ID / Биометрии
                  </span>
                  <span className="text-[11px] font-semibold block" style={{ color: 'var(--sheet-sub)' }}>
                    {isBiometricsSupported
                      ? biometricsEnabled
                        ? 'Мгновенный вход по лицу или пальцу'
                        : 'Выключено. Для входа используется 4-значный PIN'
                      : 'Биометрия не поддерживается данным устройством'}
                  </span>
                </div>
              </div>

              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  disabled={!isBiometricsSupported || !hasPinState}
                  checked={biometricsEnabled}
                  onChange={(e) => handleToggleBiometrics(e.target.checked)}
                  className="sr-only peer"
                />
                <div
                  className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-disabled:opacity-40"
                  style={{
                    backgroundColor: biometricsEnabled && hasPinState ? 'var(--theme-primary)' : undefined,
                  }}
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  haptic.medium();
                  lockApp();
                  window.location.reload();
                }}
                className="ref-btn-soft px-3.5 py-2 text-xs font-black cursor-pointer flex items-center gap-1.5"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Заблокировать сейчас</span>
              </button>

              {hasPinState && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Сбросить PIN-код? После этого вход будет свободным до создания нового кода.')) {
                      removeAppPin();
                      setHasPinState(false);
                      setBiometricsEnabledState(false);
                      haptic.success();
                      showToast('PIN-код сброшен');
                    }
                  }}
                  className="px-3.5 py-2 rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-1.5 hover:opacity-80"
                  style={{
                    background: 'rgba(239, 68, 68, 0.12)',
                    color: '#ef4444',
                  }}
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Сбросить PIN</span>
                </button>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-full text-xs font-bold transition cursor-pointer hover:opacity-80"
              style={{ color: 'var(--sheet-sub)' }}
            >
              Закрыть
            </button>
            <button
              type="submit"
              disabled={isSyncing}
              className="ref-btn-pill px-6 py-2.5 text-xs font-black shadow-md cursor-pointer flex items-center gap-1.5"
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>Сохранить и синхронизировать</span>
            </button>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
};
