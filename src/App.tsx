import React, { useState, useEffect } from 'react';
import { PlannerProvider, usePlanner, type EffectiveTask } from './context/PlannerContext';
import { Header } from './components/Header';
import { Navigation } from './components/Navigation';
import { DayView } from './components/DayView';
import { WeekView } from './components/WeekView';
import { TaskModal } from './components/TaskModal';
import { SettingsModal } from './components/SettingsModal';
import { AccountModal } from './components/AccountModal';
import { AlarmModal } from './components/AlarmModal';
import { Toast } from './components/Toast';
import { PinLock, isAppUnlocked } from './components/PinLock';
import { haptic } from './utils/haptics';

const MainContent: React.FC<{
  installPrompt: any;
  onInstall: () => void;
}> = ({ installPrompt, onInstall }) => {
  const { viewMode } = usePlanner();

  const [isLocked, setIsLocked] = useState(() => !isAppUnlocked());
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [taskToEdit, setTaskToEdit] = useState<EffectiveTask | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);

  if (isLocked) {
    return <PinLock onUnlock={() => setIsLocked(false)} />;
  }

  const handleOpenNewTask = () => {
    haptic.medium();
    setTaskToEdit(null);
    setIsTaskModalOpen(true);
  };

  const handleOpenEditTask = (task: EffectiveTask) => {
    haptic.light();
    setTaskToEdit(task);
    setIsTaskModalOpen(true);
  };

  return (
    <div className="min-h-screen flex flex-col antialiased ref-bg-canvas relative overflow-x-hidden">
      {/* Atmospheric Ambient Glow */}
      <div className="ambient-canvas">
        <div className="ambient-glow-1" />
        <div className="ambient-glow-2" />
      </div>

      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Top Header */}
        <Header
          onOpenNewTask={handleOpenNewTask}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenAccount={() => setIsAccountOpen(true)}
          installPrompt={installPrompt}
          onInstall={onInstall}
        />

        {/* Main Container */}
        <main className="flex-1 max-w-2xl w-full mx-auto px-3 sm:px-4 py-4 space-y-4 transition-all">
          {/* Navigation Tabs */}
          <Navigation />

          {/* Dynamic Views */}
          <div>
            {viewMode === 'day' && (
              <DayView
                onEditTask={handleOpenEditTask}
                onAddNewTask={handleOpenNewTask}
              />
            )}
            {viewMode === 'week' && <WeekView />}
          </div>
        </main>

        {/* Modals & Alerts */}
        <TaskModal
          isOpen={isTaskModalOpen}
          onClose={() => {
            setIsTaskModalOpen(false);
            setTaskToEdit(null);
          }}
          taskToEdit={taskToEdit}
        />

        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          onOpenAccount={() => setIsAccountOpen(true)}
        />

        <AccountModal
          isOpen={isAccountOpen}
          onClose={() => setIsAccountOpen(false)}
        />

        <AlarmModal />
        <Toast />
      </div>
    </div>
  );
};

export const App: React.FC = () => {
  const [installPrompt, setInstallPrompt] = useState<any>(null);

  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const result = await installPrompt.userChoice;
    if (result.outcome === 'accepted') {
      setInstallPrompt(null);
    }
  };

  return (
    <PlannerProvider>
      <MainContent
        installPrompt={installPrompt}
        onInstall={handleInstall}
      />
    </PlannerProvider>
  );
};

export default App;
