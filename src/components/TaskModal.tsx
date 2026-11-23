import React, { useState, useEffect } from 'react';
import { X, Trash2, Clock, Bell, Check, CalendarX } from 'lucide-react';
import type { DayOfWeek } from '../types';
import { usePlanner, type EffectiveTask } from '../context/PlannerContext';
import { haptic } from '../utils/haptics';
import { getDurationMinutes, formatDuration } from '../utils/time';
import { TimePickerDropdown } from './TimePickerDropdown';

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  taskToEdit?: EffectiveTask | null;
}

const COLOR_PRESETS = [
  { label: 'Синий', value: '#2563eb' },
  { label: 'Зеленый', value: '#10b981' },
  { label: 'Коралловый', value: '#f87171' },
  { label: 'Фиолетовый', value: '#a855f7' },
  { label: 'Янтарный', value: '#f59e0b' },
  { label: 'Розовый', value: '#ec4899' },
  { label: 'Индиго', value: '#6366f1' },
  { label: 'Бирюзовый', value: '#06b6d4' },
  { label: 'Оранжевый', value: '#f97316' },
  { label: 'Лаймовый', value: '#84cc16' },
];

const DAYS: { id: DayOfWeek; label: string; short: string }[] = [
  { id: 1, label: 'Понедельник', short: 'Пн' },
  { id: 2, label: 'Вторник', short: 'Вт' },
  { id: 3, label: 'Среда', short: 'Ср' },
  { id: 4, label: 'Четверг', short: 'Чт' },
  { id: 5, label: 'Пятница', short: 'Пт' },
  { id: 6, label: 'Суббота', short: 'Сб' },
  { id: 0, label: 'Воскресенье', short: 'Вс' },
];

export const TaskModal: React.FC<TaskModalProps> = ({
  isOpen,
  onClose,
  taskToEdit,
}) => {
  const {
    categories,
    addCategory,
    createTask,
    updateTask,
    deleteTaskPermanently,
    skipTaskForDay,
  } = usePlanner();

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Работа');
  const [color, setColor] = useState('#2563eb');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('12:00');
  const [daysOfWeek, setDaysOfWeek] = useState<DayOfWeek[]>([0, 1, 2, 3, 4, 5, 6]);
  const [alarmEnabled, setAlarmEnabled] = useState(true);

  // Edit-specific scope: 'today' or 'future'
  const [applyScope, setApplyScope] = useState<'today' | 'future'>('today');
  const [autoShiftSubsequent, setAutoShiftSubsequent] = useState(true);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newCatInput, setNewCatInput] = useState('');
  const [showAddCat, setShowAddCat] = useState(false);
  const [openTimePicker, setOpenTimePicker] = useState<'start' | 'end' | null>(null);

  // Calculate dynamic duration
  const durationMinutes = getDurationMinutes(startTime, endTime);
  const formattedDuration = formatDuration(durationMinutes);

  useEffect(() => {
    setOpenTimePicker(null);
    if (taskToEdit) {
      setTitle(taskToEdit.title);
      setCategory(taskToEdit.category || 'Работа');
      setColor(taskToEdit.color || '#2563eb');
      setStartTime(taskToEdit.effectiveStartTime || taskToEdit.startTime || '08:00');
      setEndTime(taskToEdit.effectiveEndTime || taskToEdit.endTime || '12:00');
      setDaysOfWeek(taskToEdit.daysOfWeek || [0, 1, 2, 3, 4, 5, 6]);
      setAlarmEnabled(taskToEdit.alarmEnabled ?? true);
      setApplyScope('today');
      setAutoShiftSubsequent(true);
      setConfirmDelete(false);
    } else {
      setTitle('');
      setCategory(categories[0] || 'Работа');
      setColor('#2563eb');
      setStartTime('08:00');
      setEndTime('12:00');
      setDaysOfWeek([0, 1, 2, 3, 4, 5, 6]);
      setAlarmEnabled(true);
      setApplyScope('future');
      setAutoShiftSubsequent(true);
      setConfirmDelete(false);
    }
  }, [taskToEdit, isOpen, categories]);

  if (!isOpen) return null;

  const toggleDay = (day: DayOfWeek) => {
    haptic.light();
    if (daysOfWeek.includes(day)) {
      if (daysOfWeek.length > 1) {
        setDaysOfWeek(daysOfWeek.filter((d) => d !== day));
      }
    } else {
      setDaysOfWeek([...daysOfWeek, day]);
    }
  };

  const handleAddCategorySubmit = () => {
    const trimmed = newCatInput.trim();
    if (!trimmed) return;
    addCategory(trimmed);
    setCategory(trimmed);
    setNewCatInput('');
    setShowAddCat(false);
    haptic.medium();
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!title.trim()) return;

    haptic.success();

    if (taskToEdit) {
      updateTask(
        taskToEdit.id,
        {
          title: title.trim(),
          category,
          color,
          startTime,
          endTime,
          daysOfWeek,
          alarmEnabled,
        },
        applyScope === 'future',
        autoShiftSubsequent
      );
    } else {
      createTask({
        title: title.trim(),
        category,
        color,
        startTime,
        endTime,
        daysOfWeek,
        alarmEnabled,
      });
    }

    onClose();
  };

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
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{
                background: 'var(--theme-accent-soft)',
                color: 'var(--theme-primary)',
              }}
            >
              <Clock className="w-4 h-4" />
            </div>
            <h2 className="text-base sm:text-lg font-black tracking-tight" style={{ color: 'var(--sheet-title)' }}>
              {taskToEdit ? 'Редактировать задачу' : 'Новая задача расписания'}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {/* Top Quick Save Button */}
            <button
              type="button"
              onClick={() => handleSubmit()}
              className="ref-btn-pill px-4 py-1.5 text-xs flex items-center gap-1 cursor-pointer active:scale-95"
            >
              <Check className="w-3.5 h-3.5 stroke-[3]" />
              <span>Сохранить</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-black/5 transition cursor-pointer"
              style={{ color: 'var(--sheet-sub)' }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Form Body - Frameless & Theme Colored */}
        <div className="modal-body p-5 sm:p-6 space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title Input */}
          <div>
            <label className="block text-xs font-black uppercase tracking-wide mb-1" style={{ color: 'var(--sheet-title)' }}>
              Название задачи
            </label>
            <input
              type="text"
              required
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Например: Кодинг, Рилсы, Чтение книги..."
              className="w-full px-4 py-2.5 rounded-xl text-sm font-bold transition-all outline-none"
              style={{
                background: 'var(--sheet-card-bg)',
                color: 'var(--sheet-title)',
                boxShadow: 'var(--sheet-card-shadow)',
              }}
            />
          </div>

          {/* Time Block: Start & End */}
          <div
            className="p-3.5 rounded-2xl space-y-2.5"
            style={{
              background: 'var(--sheet-card-bg)',
              boxShadow: 'var(--sheet-card-shadow)',
            }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wide flex items-center gap-1.5" style={{ color: 'var(--sheet-title)' }}>
                <Clock className="w-3.5 h-3.5" style={{ color: 'var(--theme-primary)' }} />
                Время задачи
              </span>
              <span
                className="text-xs font-black px-2.5 py-0.5 rounded-full"
                style={{
                  background: 'var(--theme-accent-soft)',
                  color: 'var(--theme-primary)',
                }}
              >
                Лимит: {formattedDuration}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <TimePickerDropdown
                label="Начало:"
                value={startTime}
                onChange={(newTime) => setStartTime(newTime)}
                isOpen={openTimePicker === 'start'}
                onToggle={() => setOpenTimePicker(openTimePicker === 'start' ? null : 'start')}
                onClose={() => setOpenTimePicker(null)}
              />

              <TimePickerDropdown
                label="Окончание:"
                value={endTime}
                onChange={(newTime) => setEndTime(newTime)}
                isOpen={openTimePicker === 'end'}
                onToggle={() => setOpenTimePicker(openTimePicker === 'end' ? null : 'end')}
                onClose={() => setOpenTimePicker(null)}
              />
            </div>
          </div>

          {/* If Editing: Scope Switcher (Today vs All Days) */}
          {taskToEdit && (
            <div
              className="p-3.5 rounded-2xl space-y-2.5"
              style={{
                background: 'var(--sheet-card-bg)',
                boxShadow: 'var(--sheet-card-shadow)',
              }}
            >
              <span className="text-xs font-black uppercase tracking-wide block" style={{ color: 'var(--sheet-title)' }}>
                Область применения изменений времени:
              </span>

              <div className="space-y-2">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="radio"
                    name="applyScope"
                    value="today"
                    checked={applyScope === 'today'}
                    onChange={() => setApplyScope('today')}
                    className="mt-0.5"
                    style={{ accentColor: 'var(--theme-primary)' }}
                  />
                  <div>
                    <span className="text-xs font-black block" style={{ color: 'var(--sheet-title)' }}>
                      Только для сегодняшнего дня
                    </span>
                    <span className="text-[11px] font-semibold block" style={{ color: 'var(--sheet-sub)' }}>
                      Например: проспали или перенесли задачу сегодня
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer pt-2">
                  <input
                    type="radio"
                    name="applyScope"
                    value="future"
                    checked={applyScope === 'future'}
                    onChange={() => setApplyScope('future')}
                    className="mt-0.5"
                    style={{ accentColor: 'var(--theme-primary)' }}
                  />
                  <div>
                    <span className="text-xs font-black block" style={{ color: 'var(--sheet-title)' }}>
                      Для всех последующих дней, начиная с сегодня
                    </span>
                    <span className="text-[11px] font-semibold block" style={{ color: 'var(--sheet-sub)' }}>
                      Меняет постоянное расписание задачи на каждый день
                    </span>
                  </div>
                </label>
              </div>

              {applyScope === 'today' && (
                <div className="pt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoShiftSubsequent}
                      onChange={(e) => setAutoShiftSubsequent(e.target.checked)}
                      className="rounded"
                      style={{ accentColor: 'var(--theme-primary)' }}
                    />
                    <span className="text-xs font-extrabold" style={{ color: 'var(--theme-primary)' }}>
                      Автоматически сдвинуть следующие задачи дня на такую же разницу
                    </span>
                  </label>
                </div>
              )}
            </div>
          )}

          {/* Category Chips */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-black uppercase tracking-wide" style={{ color: 'var(--sheet-title)' }}>
                Категория
              </label>
              <button
                type="button"
                onClick={() => setShowAddCat(!showAddCat)}
                className="text-[11px] font-black cursor-pointer"
                style={{ color: 'var(--theme-primary)' }}
              >
                {showAddCat ? 'Скрыть' : '+ Новая категория'}
              </button>
            </div>

            {showAddCat && (
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  placeholder="Новая категория"
                  value={newCatInput}
                  onChange={(e) => setNewCatInput(e.target.value)}
                  className="flex-1 px-3 py-1.5 text-xs rounded-xl font-bold outline-none"
                  style={{
                    background: 'var(--sheet-card-bg)',
                    color: 'var(--sheet-title)',
                  }}
                />
                <button
                  type="button"
                  onClick={handleAddCategorySubmit}
                  className="ref-btn-pill px-3 py-1.5 text-xs cursor-pointer"
                >
                  ОК
                </button>
              </div>
            )}

            <div className="flex flex-wrap gap-1.5">
              {categories.map((cat) => {
                const isSelected = category === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => {
                      haptic.light();
                      setCategory(cat);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer ${
                      isSelected
                        ? 'ref-btn-pill'
                        : 'ref-btn-soft'
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Color Preset Palette */}
          <div>
            <label className="block text-xs font-black uppercase tracking-wide mb-1.5" style={{ color: 'var(--sheet-title)' }}>
              Цветовая метка
            </label>
            <div className="flex flex-wrap gap-2 items-center">
              {COLOR_PRESETS.map((p) => {
                const isSelected = color === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => {
                      haptic.light();
                      setColor(p.value);
                    }}
                    className={`w-7 h-7 rounded-full transition-transform cursor-pointer shadow-xs ${
                      isSelected ? 'scale-120 ring-2 ring-offset-2' : ''
                    }`}
                    style={{
                      backgroundColor: p.value,
                    }}
                    title={p.label}
                  />
                );
              })}
            </div>
          </div>

          {/* Days of Week (Repeating) */}
          <div>
            <label className="block text-xs font-black uppercase tracking-wide mb-1.5" style={{ color: 'var(--sheet-title)' }}>
              Дни повторения
            </label>
            <div className="grid grid-cols-7 gap-1">
              {DAYS.map((d) => {
                const isActive = daysOfWeek.includes(d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => toggleDay(d.id)}
                    className={`py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                      isActive ? 'ref-btn-pill' : 'ref-btn-soft'
                    }`}
                    title={d.label}
                  >
                    {d.short}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Alarm Toggle */}
          <div
            className="p-3.5 rounded-2xl flex items-center justify-between"
            style={{
              background: 'var(--sheet-card-bg)',
              boxShadow: 'var(--sheet-card-shadow)',
            }}
          >
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{
                  background: 'var(--theme-accent-soft)',
                  color: 'var(--theme-primary)',
                }}
              >
                <Bell className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-black block" style={{ color: 'var(--sheet-title)' }}>
                  Звуковой будильник
                </span>
                <span className="text-[11px] font-semibold block" style={{ color: 'var(--sheet-sub)' }}>
                  Оповещение со звуком при окончании времени
                </span>
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={alarmEnabled}
                onChange={(e) => setAlarmEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div
                className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all"
                style={{
                  backgroundColor: alarmEnabled ? 'var(--theme-primary)' : undefined,
                }}
              />
            </label>
          </div>

          {/* Bottom Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-3">
            {taskToEdit ? (
              confirmDelete ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      skipTaskForDay(taskToEdit.id);
                      onClose();
                    }}
                    className="ref-btn-soft px-3 py-2 text-xs font-bold flex items-center gap-1.5 cursor-pointer active:scale-95"
                    title="Убрать только из расписания на этот день"
                  >
                    <CalendarX className="w-3.5 h-3.5 text-amber-500" />
                    <span>Пропустить сегодня</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      deleteTaskPermanently(taskToEdit.id);
                      onClose();
                    }}
                    className="px-3 py-2 text-xs font-black text-white bg-rose-600 hover:bg-rose-700 rounded-xl flex items-center gap-1.5 shadow-sm cursor-pointer active:scale-95"
                    title="Удалить задачу навсегда из всех дней"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Удалить навсегда</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="px-2 py-2 text-xs font-bold cursor-pointer"
                    style={{ color: 'var(--sheet-sub)' }}
                  >
                    Отмена
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="py-2 px-3 text-rose-500 hover:text-rose-700 rounded-xl transition cursor-pointer flex items-center gap-1.5 text-xs font-bold"
                  title="Удалить задачу"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Удалить</span>
                </button>
              )
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-full text-xs font-bold transition cursor-pointer hover:opacity-80"
                style={{ color: 'var(--sheet-sub)' }}
              >
                Отмена
              </button>
              <button
                type="submit"
                className="ref-btn-pill px-6 py-2.5 text-xs font-black shadow-md cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                <span>{taskToEdit ? 'Подтвердить и сохранить' : 'Создать задачу'}</span>
              </button>
            </div>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
};
