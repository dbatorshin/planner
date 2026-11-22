import React from 'react';
import { CalendarDays, Clock } from 'lucide-react';
import { usePlanner } from '../context/PlannerContext';
import { haptic } from '../utils/haptics';
import type { ViewMode } from '../types';

export const Navigation: React.FC = () => {
  const { viewMode, setViewMode } = usePlanner();

  const navItems: { id: ViewMode; label: string; icon: React.ReactNode }[] = [
    { id: 'day', label: 'Расписание дня', icon: <Clock className="w-4 h-4" /> },
    { id: 'week', label: 'Недельный план', icon: <CalendarDays className="w-4 h-4" /> },
  ];

  return (
    <div className="flex justify-center w-full">
      <div
        className="p-1 rounded-2xl flex items-center gap-1.5 w-full max-w-sm backdrop-blur-xl transition-all shadow-md"
        style={{
          background: 'var(--glass-bg)',
        }}
      >
        {navItems.map((item) => {
          const isActive = viewMode === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                haptic.light();
                setViewMode(item.id);
              }}
              className={`flex-1 py-2.5 px-3.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all duration-200 select-none cursor-pointer relative ${
                isActive
                  ? 'ref-sheet-card'
                  : 'hover:opacity-90'
              }`}
              style={{
                color: isActive ? 'var(--sheet-title)' : 'var(--glass-text-sub)',
              }}
            >
              <span style={{ color: isActive ? 'var(--theme-primary)' : 'inherit' }}>
                {item.icon}
              </span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
