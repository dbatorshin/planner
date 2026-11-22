import React from 'react';
import { Calendar } from 'lucide-react';
import { usePlanner } from '../context/PlannerContext';
import type { DayOfWeek } from '../types';

const DAYS: { id: DayOfWeek; label: string; short: string }[] = [
  { id: 1, label: 'Понедельник', short: 'Пн' },
  { id: 2, label: 'Вторник', short: 'Вт' },
  { id: 3, label: 'Среда', short: 'Ср' },
  { id: 4, label: 'Четверг', short: 'Чт' },
  { id: 5, label: 'Пятница', short: 'Пт' },
  { id: 6, label: 'Суббота', short: 'Сб' },
  { id: 0, label: 'Воскресенье', short: 'Вс' },
];

export const WeekView: React.FC = () => {
  const { appData } = usePlanner();

  return (
    <div className="space-y-4 max-w-xl mx-auto pb-10">
      {/* Top Glass Card - Frameless */}
      <div className="ref-glass-card p-5 space-y-1">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5" style={{ color: 'var(--theme-primary)' }} />
          <h2 className="text-base sm:text-lg font-black tracking-tight" style={{ color: 'var(--glass-text-title)' }}>
            Постоянный недельный график
          </h2>
        </div>
        <p className="text-xs font-bold" style={{ color: 'var(--glass-text-sub)' }}>
          Базовое расписание повторяющихся задач по дням недели
        </p>
      </div>

      {/* Days List in High-Contrast Sheet - Frameless */}
      <div className="ref-contrast-sheet p-5 space-y-3">
        {DAYS.map((day) => {
          const tasksForDay = appData.tasks
            .filter((t) => t.daysOfWeek.includes(day.id))
            .sort((a, b) => a.startTime.localeCompare(b.startTime));

          return (
            <div
              key={day.id}
              className="ref-sheet-card p-4 space-y-2.5"
            >
              <div className="flex items-center justify-between pb-1">
                <span className="text-sm font-black flex items-center gap-2" style={{ color: 'var(--sheet-title)' }}>
                  <span className="w-2 h-2 rounded-full" style={{ background: 'var(--theme-primary)' }} />
                  {day.label}
                </span>
                <span className="text-xs font-bold" style={{ color: 'var(--sheet-sub)' }}>
                  {tasksForDay.length} {tasksForDay.length === 1 ? 'задача' : tasksForDay.length < 5 ? 'задачи' : 'задач'}
                </span>
              </div>

              {tasksForDay.length === 0 ? (
                <p className="text-xs italic py-1" style={{ color: 'var(--sheet-sub)' }}>Нет запланированных задач</p>
              ) : (
                <div className="space-y-1.5 pt-1">
                  {tasksForDay.map((task) => (
                    <div
                      key={task.id}
                      className="p-3 rounded-2xl flex items-center justify-between text-xs"
                      style={{
                        background: 'var(--sheet-bg)',
                      }}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: task.color || 'var(--theme-primary)' }}
                        />
                        <span className="font-black truncate" style={{ color: 'var(--sheet-title)' }}>
                          {task.title}
                        </span>
                        {task.category && (
                          <span
                            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                            style={{
                              background: 'var(--sheet-card-bg)',
                              color: 'var(--sheet-sub)',
                            }}
                          >
                            {task.category}
                          </span>
                        )}
                      </div>

                      <span className="font-mono text-xs font-black shrink-0" style={{ color: 'var(--theme-primary)' }}>
                        {task.startTime} — {task.endTime}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
