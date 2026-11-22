import React, { useEffect, useRef } from 'react';
import { Clock, ChevronDown } from 'lucide-react';
import { haptic } from '../utils/haptics';

interface TimePickerDropdownProps {
  label: string;
  value: string; // "HH:mm" e.g. "18:00"
  onChange: (time: string) => void;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}

const HOURS: string[] = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
const MINUTES: string[] = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));

export const TimePickerDropdown: React.FC<TimePickerDropdownProps> = ({
  label,
  value,
  onChange,
  isOpen,
  onToggle,
  onClose,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedHourRef = useRef<HTMLButtonElement>(null);
  const selectedMinuteRef = useRef<HTMLButtonElement>(null);

  const [hourStr, minuteStr] = (value && value.includes(':') ? value.split(':') : ['08', '00']);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  // Auto-scroll to selected hour and minute when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        if (selectedHourRef.current) {
          selectedHourRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
        if (selectedMinuteRef.current) {
          selectedMinuteRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      }, 60);
    }
  }, [isOpen]);

  const handleSelectHour = (newHour: string) => {
    haptic.light();
    onChange(`${newHour}:${minuteStr || '00'}`);
  };

  const handleSelectMinute = (newMinute: string) => {
    haptic.light();
    onChange(`${hourStr || '08'}:${newMinute}`);
  };

  return (
    <div className="relative" ref={containerRef}>
      <label className="block text-[11px] font-bold mb-1" style={{ color: 'var(--sheet-sub)' }}>
        {label}
      </label>

      {/* Main Clickable Trigger Button (Opens Dropdown) */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-3.5 py-2.5 rounded-2xl flex items-center justify-between text-sm font-black transition cursor-pointer select-none active:scale-[0.98]"
        style={{
          background: 'var(--sheet-bg)',
          color: 'var(--sheet-title)',
          boxShadow: isOpen ? '0 0 0 2px var(--theme-primary)' : 'none',
        }}
      >
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 shrink-0" style={{ color: 'var(--theme-primary)' }} />
          <span className="font-mono text-base font-bold tracking-tight">{value}</span>
        </div>
        <ChevronDown
          className={`w-4 h-4 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          style={{ color: 'var(--sheet-sub)' }}
        />
      </button>

      {/* Custom Modern Dropdown Menu: Hours & Minutes only */}
      {isOpen && (
        <div
          className="absolute top-full left-0 right-0 sm:w-64 mt-1.5 z-50 rounded-2xl p-3 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-xl"
          style={{
            background: 'var(--sheet-card-bg)',
            color: 'var(--sheet-title)',
            boxShadow: '0 12px 36px rgba(0, 0, 0, 0.22)',
            border: 'none',
          }}
        >
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2 text-center">
              <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'var(--sheet-sub)' }}>
                Часы
              </span>
              <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'var(--sheet-sub)' }}>
                Минуты
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 h-48">
              {/* Hours Column (00 - 23) */}
              <div
                className="overflow-y-auto space-y-1 pr-1 overscroll-contain rounded-xl p-1"
                style={{ background: 'var(--sheet-bg)' }}
              >
                {HOURS.map((h) => {
                  const isSelected = h === hourStr;
                  return (
                    <button
                      key={h}
                      ref={isSelected ? selectedHourRef : null}
                      type="button"
                      onClick={() => handleSelectHour(h)}
                      className="w-full py-1.5 rounded-lg text-xs font-mono font-bold transition cursor-pointer select-none"
                      style={{
                        background: isSelected ? 'var(--theme-primary)' : 'transparent',
                        color: isSelected ? 'var(--btn-pill-text)' : 'var(--sheet-title)',
                        fontWeight: isSelected ? '800' : '600',
                      }}
                    >
                      {h}
                    </button>
                  );
                })}
              </div>

              {/* Minutes Column (00 - 59) */}
              <div
                className="overflow-y-auto space-y-1 pr-1 overscroll-contain rounded-xl p-1"
                style={{ background: 'var(--sheet-bg)' }}
              >
                {MINUTES.map((m) => {
                  const isSelected = m === minuteStr;
                  return (
                    <button
                      key={m}
                      ref={isSelected ? selectedMinuteRef : null}
                      type="button"
                      onClick={() => handleSelectMinute(m)}
                      className="w-full py-1.5 rounded-lg text-xs font-mono font-bold transition cursor-pointer select-none"
                      style={{
                        background: isSelected ? 'var(--theme-primary)' : 'transparent',
                        color: isSelected ? 'var(--btn-pill-text)' : 'var(--sheet-title)',
                        fontWeight: isSelected ? '800' : '600',
                      }}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Confirm / Close Button */}
            <button
              type="button"
              onClick={() => {
                haptic.medium();
                onClose();
              }}
              className="ref-btn-pill w-full py-2 text-xs font-black cursor-pointer mt-1"
            >
              Готово • {value}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
