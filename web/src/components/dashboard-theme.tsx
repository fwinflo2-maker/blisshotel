'use client';

import { useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';

export type DashboardTheme = 'light' | 'dark';

const STORAGE_KEY = 'bliss-dashboard-theme';
const listeners = new Set<() => void>();
let currentTheme: DashboardTheme = 'light';
let initialized = false;

function getThemeSnapshot(): DashboardTheme {
  if (!initialized && typeof window !== 'undefined') {
    const savedTheme = window.localStorage.getItem(STORAGE_KEY);
    if (savedTheme === 'light' || savedTheme === 'dark') currentTheme = savedTheme;
    initialized = true;
  }
  return currentTheme;
}

function subscribeToTheme(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setDashboardTheme(theme: DashboardTheme) {
  currentTheme = theme;
  initialized = true;
  window.localStorage.setItem(STORAGE_KEY, theme);
  listeners.forEach((listener) => listener());
}

export function useDashboardTheme() {
  const theme = useSyncExternalStore<DashboardTheme>(subscribeToTheme, getThemeSnapshot, () => 'light');

  function toggleTheme() {
    setDashboardTheme(theme === 'light' ? 'dark' : 'light');
  }

  return { theme, toggleTheme };
}

export function DashboardThemeToggle({ theme, onToggle }: { theme: DashboardTheme; onToggle: () => void }) {
  const nextTheme = theme === 'light' ? 'sombre' : 'clair';
  const Icon = theme === 'light' ? Moon : Sun;

  return (
    <button
      type="button"
      className="dashboard-theme-toggle"
      onClick={onToggle}
      aria-label={`Activer le thème ${nextTheme}`}
      aria-pressed={theme === 'dark'}
      title={`Activer le thème ${nextTheme}`}
    >
      <Icon size={16} aria-hidden="true" />
      <span>{theme === 'light' ? 'Sombre' : 'Clair'}</span>
    </button>
  );
}
