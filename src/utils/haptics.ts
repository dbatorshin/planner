/**
 * Web Haptic Feedback Utility
 * Uses the navigator.vibrate API for native tactile feedback on mobile devices.
 */
export const haptic = {
  // Light vibration for simple checkbox tap / button click
  light: () => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(10);
      } catch {}
    }
  },

  // Medium vibration for restoring from trash or switching tabs
  medium: () => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(20);
      } catch {}
    }
  },

  // Success vibration pattern when a task is completed
  success: () => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([15, 30, 25]);
      } catch {}
    }
  },

  // Celebratory vibration when 100% of daily tasks are done
  celebrate: () => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([30, 40, 30, 40, 60]);
      } catch {}
    }
  },

  // Error vibration pattern
  error: () => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([40, 60, 40]);
      } catch {}
    }
  },
};
