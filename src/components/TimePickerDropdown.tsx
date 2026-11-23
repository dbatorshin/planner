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
  const hoursColRef = useRef<HTMLDivElement>(null);
  const minutesColRef = useRef<HTMLDivElement>(null);
  const selectedHourRef = useRef<HTMLButtonElement>(null);
  const selectedMinuteRef = useRef<HTMLButtonElement>(null);

  const [hourStr, minuteStr] = (value && value.includes(':') ? value.split(':') : ['08', '00']);

  // Reliable outside-interaction handling for both desktop and mobile touch
  useEffect(() => {
    if (!isOpen) return;

    const handleOutsidePointer = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // If the node was removed or detached from the DOM during React re-render, ignore
      if (!document.contains(target)) return;

      // If inside our timepicker container or any child with data-timepicker, do not close
      if (containerRef.current && containerRef.current.contains(target)) return;
      if (target.closest && target.closest('[data-timepicker]')) return;

      onClose();
    };

    document.addEventListener('pointerdown', handleOutsidePointer);
    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointer);
    };
  }, [isOpen, onClose]);

  // Smooth scroll within the specific columns without shifting the outer viewport or modal
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        if (hoursColRef.current && selectedHourRef.current) {
          const top =
            selectedHourRef.current.offsetTop -
            hoursColRef.current.clientHeight / 2 +
            selectedHourRef.current.clientHeight / 2;
          hoursColRef.current.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
        }
        if (minutesColRef.current && selectedMinuteRef.current) {
          const top =
            selectedMinuteRef.current.offsetTop -
            minutesColRef.current.clientHeight / 2 +
            selectedMinuteRef.current.clientHeight / 2;
          minutesColRef.current.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
        }
      }, 70);

      return () => clearTimeout(timer);
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
    <div className="relative" ref={containerRef} data-timepicker="true">
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
          data-timepicker="true"
          onPointerDown={(e) => e.stopPropagation()}
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

            <div className="grid grid-cols-2 gap-2 h-48 sm:h-52">
              {/* Hours Column (00 - 23) */}
              <div
                ref={hoursColRef}
                className="overflow-y-auto space-y-1 pr-1 overscroll-contain rounded-xl p-1"
                style={{
                  background: 'var(--sheet-bg)',
                  touchAction: 'pan-y',
                  WebkitOverflowScrolling: 'touch',
                }}
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
                ref={minutesColRef}
                className="overflow-y-auto space-y-1 pr-1 overscroll-contain rounded-xl p-1"
                style={{
                  background: 'var(--sheet-bg)',
                  touchAction: 'pan-y',
                  WebkitOverflowScrolling: 'touch',
                }}
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
