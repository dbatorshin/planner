import React from 'react';
import { usePlanner } from '../context/PlannerContext';
import { Info } from 'lucide-react';

export const Toast: React.FC = () => {
  const { toastMessage } = usePlanner();

  if (!toastMessage) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none transition-all animate-in fade-in slide-in-from-bottom-4 duration-200">
      <div className="py-2.5 px-4 rounded-full bg-slate-900/90 text-white text-xs font-black shadow-2xl backdrop-blur-md flex items-center gap-2 max-w-sm text-center">
        <Info className="w-4 h-4 shrink-0" style={{ color: 'var(--theme-primary)' }} />
        <span className="truncate">{toastMessage}</span>
      </div>
    </div>
  );
};
