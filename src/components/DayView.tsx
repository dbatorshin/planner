import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Check,
  Pause,
  Play,
  RotateCcw,
  Plus,
  Trash2,
} from 'lucide-react';
import { format, addDays, subDays } from 'date-fns';
import { ru } from 'date-fns/locale';
import { usePlanner, type EffectiveTask } from '../context/PlannerContext';
import { haptic } from '../utils/haptics';
import { formatDuration, formatSecondsToHMS } from '../utils/time';

interface DayViewProps {
  onEditTask: (task: EffectiveTask) => void;
  onAddNewTask: () => void;
}

export const DayView: React.FC<DayViewProps> = ({ onEditTask, onAddNewTask }) => {
  const {
    selectedDate,
    setSelectedDate,
    goToToday,
    isCurrentToday,
    activeTasks,
    completedTasks,
    allScheduledTasks,
    currentRunningTask,
    dayCompletionRate,
    totalScheduledMinutes,
    completedScheduledMinutes,
    startTask,
    pauseTask,
    resumeTask,
    resetTask,
    completeTask,
    restoreTask,
    deleteTaskPermanently,
  } = usePlanner();

  const [isCompletedOpen, setIsCompletedOpen] = useState(false);
  const [taskToDeleteId, setTaskToDeleteId] = useState<string | null>(null);

  const handlePrevDay = () => {
    haptic.light();
    setSelectedDate(subDays(selectedDate, 1));
  };

  const handleNextDay = () => {
    haptic.light();
    setSelectedDate(addDays(selectedDate, 1));
  };

  const handleDeleteClick = (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation();
    haptic.medium();
    deleteTaskPermanently(taskId);
    setTaskToDeleteId(null);
  };

  // Date formatting
  const rawDayOfWeek = format(selectedDate, 'EEEE', { locale: ru });
  const capitalizedDayOfWeek = rawDayOfWeek.charAt(0).toUpperCase() + rawDayOfWeek.slice(1);
  const formattedDayAndMonth = format(selectedDate, 'd MMMM', { locale: ru }).toLowerCase();

  return (
    <div className="space-y-4 max-w-xl mx-auto pb-10">
      {/* Date Navigation Bar - Clean Frameless */}
      <div className="flex items-center justify-between gap-2 px-1">
        <button
          onClick={handlePrevDay}
          className="ref-btn-circle w-10 h-10 cursor-pointer active:scale-95 shrink-0"
          title="Предыдущий день"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="flex items-center justify-center gap-2 flex-1 min-w-0">
          <div className="text-center min-w-0">
            <h2
              className="text-base sm:text-lg font-black tracking-tight leading-tight flex flex-wrap items-center justify-center gap-x-1.5"
              style={{ color: 'var(--glass-text-title)' }}
            >
              <span className="whitespace-nowrap">{capitalizedDayOfWeek},</span>
              <span className="whitespace-nowrap">{formattedDayAndMonth}</span>
            </h2>
          </div>
          {!isCurrentToday && (
            <button
              onClick={goToToday}
              className="ref-btn-pill px-2.5 py-1 text-[11px] font-bold cursor-pointer shrink-0 active:scale-95"
            >
              Сегодня
            </button>
          )}
        </div>

        <button
          onClick={handleNextDay}
          className="ref-btn-circle w-10 h-10 cursor-pointer active:scale-95 shrink-0"
          title="Следующий день"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Daily Plan Progress Card - Frameless Glass */}
      <div className="ref-glass-card p-4 sm:p-5 space-y-3 relative overflow-hidden">
        {/* Card Header */}
        <div className="flex items-center justify-between px-1">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base sm:text-lg font-black tracking-tight" style={{ color: 'var(--glass-text-title)' }}>
                План на день
              </h3>
              {isCurrentToday && (
                <span
                  className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full"
                  style={{
                    background: 'var(--theme-accent-soft)',
                    color: 'var(--theme-primary)',
                  }}
                >
                  Сегодня
                </span>
              )}
            </div>
            <p className="text-xs font-bold mt-0.5" style={{ color: 'var(--glass-text-sub)' }}>
              {allScheduledTasks.length === 0 ? (
                'Нет задач в расписании'
              ) : (
                <>
                  Выполнено {completedTasks.length} из {allScheduledTasks.length} •{' '}
                  {formatDuration(completedScheduledMinutes)} из {formatDuration(totalScheduledMinutes)}
                </>
              )}
            </p>
          </div>

          <div className="text-right">
            <span className="text-2xl sm:text-3xl font-black tracking-tight" style={{ color: 'var(--theme-primary)' }}>
              {dayCompletionRate}%
            </span>
          </div>
        </div>

        {/* Progress Bar (Frameless, clean theme adaptation) */}
        <div
          className="p-1 rounded-full backdrop-blur-md"
          style={{ background: 'var(--sheet-card-bg)', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}
        >
          <div className="h-3 rounded-full overflow-hidden" style={{ background: 'var(--theme-accent-soft)' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${dayCompletionRate}%`,
                background: 'var(--btn-pill-bg)',
                boxShadow: 'var(--btn-pill-shadow)',
              }}
            />
          </div>
        </div>
      </div>

      {/* Active Running Task Top Banner (Reference "Your Physical Card" / Frameless) */}
      {currentRunningTask && isCurrentToday && (
        <div
          className="ref-glass-card p-4 sm:p-5 space-y-3 relative overflow-hidden"
          style={{
            boxShadow: `0 16px 40px -8px var(--theme-accent-soft)`,
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full animate-pulse"
                style={{ background: 'var(--theme-primary)' }}
              />
              <span className="text-xs font-black uppercase tracking-wider" style={{ color: 'var(--glass-text-title)' }}>
                {currentRunningTask.status === 'paused' ? 'На паузе' : 'Идет отсчет времени'}
              </span>
            </div>

            <span
              className="text-xs font-mono font-black px-2.5 py-0.5 rounded-full"
              style={{
                background: 'var(--sheet-card-bg)',
                color: 'var(--sheet-title)',
              }}
            >
              {currentRunningTask.effectiveStartTime} — {currentRunningTask.effectiveEndTime}
            </span>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h4 className="text-base sm:text-lg font-black truncate" style={{ color: 'var(--glass-text-title)' }}>
                {currentRunningTask.title}
              </h4>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-2xl sm:text-3xl font-mono font-black tracking-tight" style={{ color: 'var(--theme-primary)' }}>
                  {formatSecondsToHMS(currentRunningTask.remainingSeconds)}
                </span>
                <span className="text-xs font-bold" style={{ color: 'var(--glass-text-sub)' }}>
                  {currentRunningTask.status === 'paused' ? 'пауза' : 'осталось'}
                </span>
              </div>
            </div>

            {/* Action buttons on running task */}
            <div className="flex items-center gap-2 shrink-0">
              {currentRunningTask.status === 'paused' ? (
                <button
                  type="button"
                  onClick={() => resumeTask(currentRunningTask.id)}
                  className="ref-btn-pill px-4 py-2 text-xs flex items-center gap-1.5 cursor-pointer active:scale-95"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Продолжить</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => pauseTask(currentRunningTask.id)}
                  className="ref-btn-soft px-3.5 py-2 text-xs flex items-center gap-1.5 cursor-pointer active:scale-95"
                >
                  <Pause className="w-3.5 h-3.5 fill-current" />
                  <span>Пауза</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => completeTask(currentRunningTask.id)}
                className="ref-btn-pill px-3 py-2 text-xs flex items-center justify-center cursor-pointer active:scale-95"
                title="Отметить выполненной"
              >
                <Check className="w-4 h-4 stroke-[3]" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Signature High-Contrast Sheet (Reference Bottom Card "Statistics" / Frameless) */}
      <div className="ref-contrast-sheet p-5 sm:p-6 space-y-4">
        {/* Sheet Header (Reference: Statistics | View All >) */}
        <div className="flex items-center justify-between pb-1">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base sm:text-lg font-black tracking-tight" style={{ color: 'var(--sheet-title)' }}>
                Задачи дня
              </h3>
              <span
                className="text-[11px] font-black px-2 py-0.5 rounded-full"
                style={{
                  background: 'var(--sheet-card-bg)',
                  color: 'var(--sheet-sub)',
                }}
              >
                {activeTasks.length}
              </span>
            </div>
            <p className="text-[11px] font-bold mt-0.5" style={{ color: 'var(--sheet-sub)' }}>
              {activeTasks.length > 0 ? 'Нажмите на задачу для редактирования' : 'Создайте первую задачу'}
            </p>
          </div>

          <button
            type="button"
            onClick={onAddNewTask}
            className="ref-btn-pill px-3.5 py-1.5 text-xs flex items-center gap-1 cursor-pointer active:scale-95"
          >
            <Plus className="w-3.5 h-3.5 stroke-[3]" />
            <span>Добавить</span>
          </button>
        </div>

        {/* Column Subtitles (Reference: Senders & Receivers | Amount) */}
        {activeTasks.length > 0 && (
          <div className="flex items-center justify-between px-2 text-[10px] font-black uppercase tracking-wider" style={{ color: 'var(--sheet-sub)' }}>
            <span>Задача и интервал</span>
            <span>Статус / Время</span>
          </div>
        )}

        {/* Task Cards List (Frameless, sleek, reference style) */}
        {activeTasks.length === 0 ? (
          <div className="p-8 text-center space-y-3 rounded-2xl" style={{ background: 'var(--sheet-card-bg)' }}>
            <div
              className="w-14 h-14 mx-auto rounded-3xl flex items-center justify-center shadow-xs"
              style={{
                background: 'var(--sheet-bg)',
                color: 'var(--theme-primary)',
              }}
            >
              <Clock className="w-7 h-7" />
            </div>
            <div>
              <h4 className="text-base font-black" style={{ color: 'var(--sheet-title)' }}>
                Расписание пусто
              </h4>
              <p className="text-xs font-bold max-w-xs mx-auto mt-1" style={{ color: 'var(--sheet-sub)' }}>
                Нажмите кнопку ниже, чтобы создать задачу с автоматическим контролем времени
              </p>
            </div>
            <button
              type="button"
              onClick={onAddNewTask}
              className="ref-btn-pill px-6 py-2.5 text-xs font-black cursor-pointer active:scale-95"
            >
              + Добавить первую задачу
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {activeTasks.map((task) => {
              const isRunning = task.status === 'running';
              const isPaused = task.status === 'paused';
              const isIdle = task.status === 'idle';
              const isConfirmingDelete = taskToDeleteId === task.id;

              return (
                <div
                  key={task.id}
                  onClick={() => onEditTask(task)}
                  className="ref-sheet-card p-4 space-y-3 select-none transition-all cursor-pointer relative"
                  style={{
                    boxShadow: isRunning
                      ? '0 8px 24px -2px var(--theme-accent-soft)'
                      : 'var(--sheet-card-shadow)',
                  }}
                >
                  {/* Top Row: Avatar on Left, Title in Middle, Action Pill on Right */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {/* Volumetric Category Avatar with calibrated depth (20% less deep than #0f172a) */}
                      <div
                        className="w-11 h-11 rounded-full flex items-center justify-center text-white font-black text-sm shrink-0 shadow-sm select-none"
                        style={{
                          background: `linear-gradient(135deg, ${task.color || 'var(--theme-primary)'} 0%, color-mix(in srgb, ${task.color || 'var(--theme-primary)'} 35%, #0f172a) 100%)`,
                        }}
                      >
                        {task.title.charAt(0).toUpperCase()}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="text-base font-black truncate leading-snug" style={{ color: 'var(--sheet-title)' }}>
                            {task.title}
                          </h4>
                          {isRunning && (
                            <span
                              className="w-2 h-2 rounded-full animate-pulse shrink-0"
                              style={{ background: 'var(--theme-primary)' }}
                            />
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 mt-0.5 text-xs font-medium" style={{ color: 'var(--sheet-sub)' }}>
                          <span className="font-mono font-bold" style={{ color: 'var(--sheet-title)' }}>
                            {task.effectiveStartTime} — {task.effectiveEndTime}
                          </span>
                          {task.category && (
                            <span>• {task.category}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right Header: Status / Delete */}
                    <div
                      className="flex items-center gap-2 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Delete button */}
                      {isConfirmingDelete ? (
                        <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: 'var(--theme-accent-soft)' }}>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteClick(e, task.id)}
                            className="px-2.5 py-1 text-[11px] font-black text-white bg-rose-600 rounded-lg hover:bg-rose-700"
                          >
                            Удалить
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setTaskToDeleteId(null);
                            }}
                            className="px-1.5 py-1 text-[11px] font-bold"
                            style={{ color: 'var(--sheet-sub)' }}
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setTaskToDeleteId(task.id);
                          }}
                          className="p-1.5 text-slate-400 hover:text-rose-500 rounded-xl transition cursor-pointer"
                          title="Удалить задачу"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Clean Frameless LCD Timer Display in Theme Colors */}
                  <div
                    className="p-3 rounded-2xl transition-all"
                    style={{
                      background: 'var(--sheet-bg)',
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[10px] uppercase font-black tracking-wider block" style={{ color: 'var(--sheet-sub)' }}>
                          {isRunning
                            ? 'Осталось до звонка будильника:'
                            : isPaused
                            ? 'Обратный отсчет заморожен на:'
                            : 'Запланированное время:'}
                        </span>
                        <div
                          className="text-2xl sm:text-3xl font-mono font-black tracking-tight leading-none mt-1"
                          style={{
                            color: isRunning || isPaused ? 'var(--theme-primary)' : 'var(--sheet-title)',
                          }}
                        >
                          {formatSecondsToHMS(task.remainingSeconds)}
                        </div>
                      </div>

                      <div className="text-right">
                        {isRunning && (
                          <span className="text-[11px] font-mono font-bold block" style={{ color: 'var(--theme-primary)' }}>
                            Отработано: {formatSecondsToHMS(task.workedSeconds)}
                          </span>
                        )}
                        {isPaused && (
                          <span className="text-[11px] font-mono font-bold block" style={{ color: 'var(--theme-primary)' }}>
                            Пауза: {formatSecondsToHMS(task.pausedElapsedSeconds)}
                          </span>
                        )}
                        {isIdle && (
                          <span className="text-[11px] font-mono font-bold block" style={{ color: 'var(--sheet-sub)' }}>
                            Лимит: {formatDuration(task.basePlannedDurationMinutes)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Bottom Row: Flat Action Pills (Reference "Pay Now" style) */}
                  <div
                    className="flex items-center justify-between gap-2 pt-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Reset Button */}
                    <div>
                      {!isIdle && (
                        <button
                          type="button"
                          onClick={() => resetTask(task.id)}
                          className="ref-btn-soft py-1.5 px-3 text-xs flex items-center gap-1 cursor-pointer active:scale-95"
                          title="Сбросить таймер и начать заново"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Сбросить</span>
                        </button>
                      )}
                    </div>

                    {/* Right Flat Action Pills */}
                    <div className="flex items-center gap-2">
                      {isIdle && (
                        <button
                          type="button"
                          onClick={() => startTask(task.id)}
                          className="ref-btn-pill px-5 py-2 text-xs flex items-center gap-1.5 cursor-pointer active:scale-95"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Начать задачу</span>
                        </button>
                      )}

                      {isRunning && (
                        <>
                          <button
                            type="button"
                            onClick={() => pauseTask(task.id)}
                            className="ref-btn-soft px-4 py-2 text-xs flex items-center gap-1.5 cursor-pointer active:scale-95"
                          >
                            <Pause className="w-3.5 h-3.5 fill-current" />
                            <span>Пауза</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => completeTask(task.id)}
                            className="ref-btn-pill px-4 py-2 text-xs flex items-center gap-1.5 cursor-pointer active:scale-95"
                          >
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                            <span>Выполнить</span>
                          </button>
                        </>
                      )}

                      {isPaused && (
                        <>
                          <button
                            type="button"
                            onClick={() => resumeTask(task.id)}
                            className="ref-btn-pill px-4 py-2 text-xs flex items-center gap-1.5 cursor-pointer active:scale-95"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            <span>Продолжить</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => completeTask(task.id)}
                            className="ref-btn-soft px-4 py-2 text-xs flex items-center gap-1.5 cursor-pointer active:scale-95"
                          >
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                            <span>Выполнить</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Completed Tasks Accordion */}
        {completedTasks.length > 0 && (
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setIsCompletedOpen(!isCompletedOpen)}
              className="w-full p-3 rounded-2xl flex items-center justify-between text-xs font-black transition cursor-pointer"
              style={{
                background: 'var(--sheet-card-bg)',
                color: 'var(--sheet-title)',
              }}
            >
              <span>Выполненные задачи • {completedTasks.length}</span>
              <span className="font-bold" style={{ color: 'var(--theme-primary)' }}>
                {isCompletedOpen ? 'Скрыть ▲' : 'Показать ▼'}
              </span>
            </button>

            {isCompletedOpen && (
              <div className="space-y-2 mt-2">
                {completedTasks.map((t) => (
                  <div
                    key={t.id}
                    className="p-3 rounded-2xl flex items-center justify-between gap-3 opacity-80"
                    style={{
                      background: 'var(--sheet-card-bg)',
                    }}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                        style={{
                          background: 'var(--theme-accent-soft)',
                          color: 'var(--theme-primary)',
                        }}
                      >
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-sm font-bold line-through truncate block" style={{ color: 'var(--sheet-sub)' }}>
                          {t.title}
                        </span>
                        <span className="text-[10px] font-mono" style={{ color: 'var(--sheet-sub)' }}>
                          {t.effectiveStartTime}–{t.effectiveEndTime}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => restoreTask(t.id)}
                        className="ref-btn-soft p-1.5 text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                        title="Вернуть в расписание"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span className="text-[11px]">Вернуть</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => handleDeleteClick(e, t.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-500 rounded-xl transition cursor-pointer"
                        title="Удалить задачу"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
