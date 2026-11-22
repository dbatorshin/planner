import React from 'react';
import { Bell, Clock, Check, X } from 'lucide-react';
import { usePlanner } from '../context/PlannerContext';
import { formatDuration } from '../utils/time';
import { sound } from '../utils/sound';

export const AlarmModal: React.FC = () => {
  const { currentAlarmTask, dismissAlarm, completeTask } = usePlanner();

  if (!currentAlarmTask) return null;

  const handleClose = () => {
    sound.stopAlarm();
    dismissAlarm();
  };

  const handleComplete = () => {
    sound.stopAlarm();
    completeTask(currentAlarmTask.id);
    dismissAlarm();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="modal-container w-full max-w-md p-6 shadow-2xl relative animate-in zoom-in-95 duration-200"
        style={{
          background: 'var(--sheet-card-bg)',
          color: 'var(--sheet-title)',
          border: 'none',
        }}
      >
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-2 rounded-full hover:bg-black/5 transition cursor-pointer"
          style={{ color: 'var(--sheet-sub)' }}
          title="Закрыть"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Alarm Bell Animation Icon */}
        <div className="flex flex-col items-center text-center">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-white shadow-lg animate-bounce mb-3"
            style={{
              background: 'var(--btn-accent-bg)',
              color: 'var(--btn-accent-text)',
            }}
          >
            <Bell className="w-8 h-8 stroke-[2.5]" />
          </div>

          <span
            className="text-xs font-black uppercase tracking-wider px-3 py-1 rounded-full"
            style={{
              background: 'var(--sheet-bg)',
              color: 'var(--active-indicator)',
            }}
          >
            Лимит времени отработан
          </span>

          <h3 className="text-xl sm:text-2xl font-black mt-2.5 tracking-tight" style={{ color: 'var(--sheet-title)' }}>
            Время вышло!
          </h3>

          <p className="text-sm font-bold mt-1 max-w-sm" style={{ color: 'var(--sheet-sub)' }}>
            Запланированное время на задачу <span className="font-black" style={{ color: 'var(--active-indicator)' }}>«{currentAlarmTask.title}»</span> • {formatDuration(currentAlarmTask.basePlannedDurationMinutes)} завершено.
          </p>

          <div
            className="mt-3 py-2 px-4 rounded-xl text-xs font-mono font-bold flex items-center gap-2"
            style={{
              background: 'var(--sheet-bg)',
              color: 'var(--sheet-title)',
            }}
          >
            <Clock className="w-4 h-4" style={{ color: 'var(--active-indicator)' }} />
            <span>Интервал: {currentAlarmTask.effectiveStartTime} — {currentAlarmTask.effectiveEndTime}</span>
          </div>

          {/* Action Buttons */}
          <div className="w-full mt-6 space-y-2">
            <button
              onClick={handleComplete}
              className="ref-btn-pill w-full py-3 px-5 text-sm flex items-center justify-center gap-2 cursor-pointer active:scale-95"
            >
              <Check className="w-5 h-5 stroke-[3]" />
              <span>Отметить выполненной</span>
            </button>

            <button
              onClick={handleClose}
              className="w-full py-2.5 text-xs font-extrabold transition cursor-pointer hover:opacity-75"
              style={{ color: 'var(--sheet-sub)' }}
            >
              Понятно, закрыть
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
