import React, { useState, useEffect, useCallback } from 'react';
import { Lock, Delete, ShieldCheck, KeyRound } from 'lucide-react';
import { haptic } from '../utils/haptics';

interface PinLockProps {
  onUnlock: () => void;
}

const PIN_STORAGE_KEY = 'planner_app_pin';
const UNLOCKED_SESSION_KEY = 'planner_app_unlocked';

export function isPinConfigured(): boolean {
  try {
    return Boolean(localStorage.getItem(PIN_STORAGE_KEY));
  } catch {
    return false;
  }
}

export function isAppUnlocked(): boolean {
  try {
    const hasPin = Boolean(localStorage.getItem(PIN_STORAGE_KEY));
    if (!hasPin) return false; // Require creating PIN on first launch
    return sessionStorage.getItem(UNLOCKED_SESSION_KEY) === 'true';
  } catch {
    return false;
  }
}

export function lockApp(): void {
  try {
    sessionStorage.removeItem(UNLOCKED_SESSION_KEY);
  } catch {}
}

export function setAppPin(newPin: string): void {
  try {
    localStorage.setItem(PIN_STORAGE_KEY, newPin);
    sessionStorage.setItem(UNLOCKED_SESSION_KEY, 'true');
  } catch {}
}

export function removeAppPin(): void {
  try {
    localStorage.removeItem(PIN_STORAGE_KEY);
    sessionStorage.removeItem(UNLOCKED_SESSION_KEY);
  } catch {}
}

export const PinLock: React.FC<PinLockProps> = ({ onUnlock }) => {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [step, setStep] = useState<'enter' | 'create' | 'confirm'>(() =>
    isPinConfigured() ? 'enter' : 'create'
  );
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);

  const triggerError = (msg: string) => {
    setError(msg);
    setShake(true);
    haptic.error();
    setTimeout(() => {
      setShake(false);
      setPin('');
      if (step === 'confirm') {
        setStep('create');
        setConfirmPin('');
      }
    }, 600);
  };

  const handleDigit = useCallback(
    (digit: string) => {
      if (pin.length >= 4) return;
      haptic.light();
      setError(null);
      const nextPin = pin + digit;
      setPin(nextPin);

      if (nextPin.length === 4) {
        // Complete 4 digits entered
        if (step === 'enter') {
          const savedPin = localStorage.getItem(PIN_STORAGE_KEY);
          if (nextPin === savedPin) {
            haptic.success();
            try {
              sessionStorage.setItem(UNLOCKED_SESSION_KEY, 'true');
            } catch {}
            onUnlock();
          } else {
            triggerError('Неверный PIN-код');
          }
        } else if (step === 'create') {
          // Move to confirmation step
          setTimeout(() => {
            setConfirmPin(nextPin);
            setPin('');
            setStep('confirm');
          }, 150);
        } else if (step === 'confirm') {
          if (nextPin === confirmPin) {
            // Success! Save PIN
            haptic.success();
            setAppPin(nextPin);
            onUnlock();
          } else {
            triggerError('PIN-коды не совпали. Попробуйте снова');
          }
        }
      }
    },
    [pin, step, confirmPin, onUnlock]
  );

  const handleDelete = useCallback(() => {
    if (pin.length === 0) return;
    haptic.light();
    setPin((prev) => prev.slice(0, -1));
    setError(null);
  }, [pin]);

  // Support hardware physical keyboard
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleDigit(e.key);
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        handleDelete();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleDigit, handleDelete]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-2xl animate-in fade-in duration-300 select-none"
      style={{
        background: 'var(--topbar-bg)',
      }}
    >
      <div className="w-full max-w-sm flex flex-col items-center text-center">
        {/* App Circular Icon */}
        <div
          className="w-16 h-16 rounded-full p-1 shadow-lg flex items-center justify-center mb-4"
          style={{
            background: 'var(--theme-primary)',
            color: 'var(--btn-pill-text)',
          }}
        >
          {step === 'enter' ? (
            <Lock className="w-8 h-8 stroke-[2.2]" />
          ) : (
            <ShieldCheck className="w-8 h-8 stroke-[2.2]" />
          )}
        </div>

        {/* Title */}
        <h2 className="text-xl sm:text-2xl font-black tracking-tight mb-1" style={{ color: 'var(--sheet-title)' }}>
          {step === 'enter'
            ? 'Вход в Планер'
            : step === 'create'
            ? 'Задайте PIN-код'
            : 'Подтвердите PIN-код'}
        </h2>

        {/* Subtitle / Prompt */}
        <p className="text-xs sm:text-sm font-bold mb-6" style={{ color: 'var(--sheet-sub)' }}>
          {step === 'enter'
            ? 'Введите 4-значный код для доступа'
            : step === 'create'
            ? 'Придумайте 4 цифры для защиты ваших дел'
            : 'Введите код ещё раз для подтверждения'}
        </p>

        {/* 4 Pin Indicator Dots */}
        <div
          className={`flex items-center gap-4 mb-8 transition-transform duration-200 ${
            shake ? 'translate-x-[-10px] duration-75 text-rose-500' : ''
          }`}
        >
          {[0, 1, 2, 3].map((index) => {
            const isFilled = pin.length > index;
            return (
              <div
                key={index}
                className={`w-4 h-4 rounded-full transition-all duration-200 ${
                  error
                    ? 'bg-rose-500 scale-110 shadow-[0_0_10px_rgba(244,63,94,0.6)]'
                    : isFilled
                    ? 'scale-125 shadow-md'
                    : 'opacity-30'
                }`}
                style={{
                  background: error ? undefined : isFilled ? 'var(--theme-primary)' : 'var(--sheet-sub)',
                }}
              />
            );
          })}
        </div>

        {/* Error message */}
        {error && (
          <p className="text-xs font-black text-rose-500 mb-4 animate-in fade-in">
            {error}
          </p>
        )}

        {/* Flat Minimalist Keypad */}
        <div className="grid grid-cols-3 gap-3.5 sm:gap-4 w-full max-w-[280px]">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleDigit(digit)}
              style={{
                background: 'var(--sheet-card-bg)',
                color: 'var(--sheet-title)',
                outline: 'none',
                WebkitTapHighlightColor: 'transparent',
              }}
              className="w-16 h-16 sm:w-18 sm:h-18 mx-auto rounded-full text-2xl font-black flex items-center justify-center cursor-pointer shadow-sm active:scale-90 transition-all select-none"
            >
              {digit}
            </button>
          ))}

          {/* Row 4: Key icon, 0, Backspace */}
          <div className="w-16 h-16 sm:w-18 sm:h-18 mx-auto flex items-center justify-center opacity-40">
            {step === 'enter' && (
              <KeyRound className="w-5 h-5" style={{ color: 'var(--sheet-sub)' }} />
            )}
          </div>

          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handleDigit('0')}
            style={{
              background: 'var(--sheet-card-bg)',
              color: 'var(--sheet-title)',
              outline: 'none',
              WebkitTapHighlightColor: 'transparent',
            }}
            className="w-16 h-16 sm:w-18 sm:h-18 mx-auto rounded-full text-2xl font-black flex items-center justify-center cursor-pointer shadow-sm active:scale-90 transition-all select-none"
          >
            0
          </button>

          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleDelete}
            disabled={pin.length === 0}
            style={{
              background: 'var(--sheet-card-bg)',
              color: 'var(--sheet-title)',
              outline: 'none',
              WebkitTapHighlightColor: 'transparent',
            }}
            className="w-16 h-16 sm:w-18 sm:h-18 mx-auto rounded-full flex items-center justify-center cursor-pointer shadow-sm active:scale-90 disabled:opacity-30 disabled:pointer-events-none transition-all select-none"
            title="Стереть"
          >
            <Delete className="w-6 h-6 stroke-[2]" />
          </button>
        </div>

        {/* Footer Note */}
        <p className="text-[11px] font-bold mt-8 max-w-xs" style={{ color: 'var(--sheet-sub)' }}>
          {step === 'enter'
            ? 'Защита личных данных на вашем устройстве'
            : 'Код сохранится в вашем браузере для безопасного входа'}
        </p>
      </div>
    </div>
  );
};
