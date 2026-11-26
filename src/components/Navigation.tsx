import React, { useState } from 'react';
import {
  BarChart3,
  BookOpen,
  Brain,
  Calendar,
  CalendarDays,
  CheckSquare,
  Clock,
  FileText,
  GraduationCap,
  Home,
  LayoutDashboard,
  Menu,
  Moon,
  NotebookPen,
  Palette,
  PieChart,
  Play,
  Settings,
  Shield,
  Sun,
  Swords,
  Timer,
  Users,
  X,
} from 'lucide-react';
import type { UserSettings } from '../types/studytrack';

export type ActiveTab =
  | 'OBREN_DASHBOARD'
  | 'CLASSROOMS'
  | 'MY_ASSIGNED_TESTS'
  | 'TESTS'
  | 'PYQ_VAULT'
  | 'FORMULA_BANK'
  | 'FLASHCARDS'
  | 'ANALYTICS_OBREN'
  | 'PLANNER'
  | 'NOTES'
  | 'ARENA'
  | 'EXAM_SETTINGS'
  | 'ADMIN_PROCTORING'
  | 'AI_MANAGEMENT'
  | 'DASHBOARD'
  | 'TUITION_PLANNER'
  | 'VIRTUAL_CALENDAR'
  | 'ATTENDANCE'
  | 'TASKS'
  | 'STOPWATCH'
  | 'ANALYTICS'
  | 'SETTINGS';

interface NavigationProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  darkMode: boolean;
  setDarkMode: (val: boolean | ((prev: boolean) => boolean)) => void;
  settings: UserSettings;
  calendarTokenReady: boolean;
  upcomingRemindersCount: number;
  activeTuitionRunning: boolean;
  isAdmin?: boolean;
}

const CLASSROOM_NAV: Array<{ id: ActiveTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'CLASSROOMS', label: 'Classrooms & Groups', icon: Users },
  { id: 'MY_ASSIGNED_TESTS', label: 'My Assigned Tests', icon: CheckSquare },
];

const EXAM_NAV: Array<{ id: ActiveTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'OBREN_DASHBOARD', label: 'Exam Dashboard', icon: LayoutDashboard },
  { id: 'TESTS', label: 'PYQ Test Center', icon: Play },
  { id: 'PYQ_VAULT', label: 'PYQ Vault', icon: FileText },
  { id: 'FORMULA_BANK', label: 'Formula Bank', icon: BookOpen },
  { id: 'FLASHCARDS', label: 'Flashcards & Revision', icon: Brain },
  { id: 'ANALYTICS_OBREN', label: 'Analytics & Mistakes', icon: BarChart3 },
  { id: 'PLANNER', label: 'Planner & Pomodoro', icon: Clock },
  { id: 'NOTES', label: 'Notes & Folders', icon: NotebookPen },
  { id: 'ARENA', label: 'Arena, Duels & Ranks', icon: Swords },
  { id: 'EXAM_SETTINGS', label: 'Exam Appearance', icon: Palette },
];

const STUDYTRACK_NAV: Array<{ id: ActiveTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'DASHBOARD', label: 'StudyTrack Home', icon: Home },
  { id: 'TUITION_PLANNER', label: 'Tuition Planner', icon: Calendar },
  { id: 'VIRTUAL_CALENDAR', label: 'Virtual Calendar', icon: CalendarDays },
  { id: 'ATTENDANCE', label: 'Teacher Attendance', icon: Users },
  { id: 'TASKS', label: 'Study Tasks', icon: CheckSquare },
  { id: 'STOPWATCH', label: 'Study Stopwatch', icon: Timer },
  { id: 'ANALYTICS', label: 'Study Analytics', icon: PieChart },
  { id: 'SETTINGS', label: 'Calendar & Alerts', icon: Settings },
];

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  setActiveTab,
  darkMode,
  setDarkMode,
  settings,
  calendarTokenReady,
  upcomingRemindersCount,
  activeTuitionRunning,
  isAdmin = false,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSelect = (tab: ActiveTab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };

  const renderNavButton = (item: {
    id: ActiveTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }) => {
    const Icon = item.icon;
    const isActive = activeTab === item.id;
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => handleSelect(item.id)}
        className={`w-full flex items-center justify-between px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
          isActive
            ? 'bg-indigo-600 text-white'
            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-white'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Icon
            className={`w-4 h-4 shrink-0 ${
              isActive ? 'text-white' : 'text-slate-500 dark:text-slate-400'
            }`}
          />
          <span className="truncate">{item.label}</span>
        </div>
        {item.id === 'TUITION_PLANNER' && (upcomingRemindersCount > 0 || activeTuitionRunning) && (
          <span
            className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono tabular-nums font-bold shrink-0 ${
              activeTuitionRunning
                ? 'bg-emerald-500 text-white'
                : isActive
                  ? 'bg-white text-indigo-600'
                  : 'bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400'
            }`}
          >
            {activeTuitionRunning ? 'LIVE' : upcomingRemindersCount}
          </span>
        )}
      </button>
    );
  };

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-68 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 select-none">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white shrink-0">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="font-extrabold font-display text-base text-slate-900 dark:text-white leading-tight truncate">
              OBREN
            </h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
              Exam Prep · StudyTrack
            </p>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          <div className="px-3 py-1 text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
            Classrooms & Tests
          </div>
          {CLASSROOM_NAV.map(renderNavButton)}

          <div className="pt-3 px-3 py-1 text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
            Exam Prep
          </div>
          {EXAM_NAV.map(renderNavButton)}
          {isAdmin && (
            <>
              {renderNavButton({
                id: 'ADMIN_PROCTORING',
                label: 'Proctoring Admin',
                icon: Shield,
              })}
              {renderNavButton({
                id: 'AI_MANAGEMENT',
                label: 'AI Assistant Admin',
                icon: Brain,
              })}
            </>
          )}

          <div className="pt-3 px-3 py-1 text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
            Tuition & StudyTrack
          </div>
          {STUDYTRACK_NAV.map(renderNavButton)}
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
          <button
            type="button"
            onClick={() => handleSelect(calendarTokenReady ? 'SETTINGS' : 'VIRTUAL_CALENDAR')}
            className="w-full text-left p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60 hover:border-indigo-400 transition-colors cursor-pointer space-y-1"
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                {calendarTokenReady ? 'Google Calendar' : 'Virtual Calendar'}
              </span>
              <span
                className={`w-2 h-2 rounded-full ${
                  calendarTokenReady
                    ? 'bg-emerald-500'
                    : settings.googleCalendarConnected
                      ? 'bg-amber-500'
                      : 'bg-indigo-500'
                }`}
              />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate font-mono">
              {calendarTokenReady
                ? settings.googleAccountEmail || 'Synced Live'
                : settings.googleCalendarConnected
                  ? 'Virtual active · Reconnect Google'
                  : 'Built-in calendar active'}
            </p>
          </button>

          <button
            type="button"
            onClick={() => setDarkMode((prev) => !prev)}
            className="w-full flex items-center justify-between px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              {darkMode ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-indigo-600" />
              )}
              <span>{darkMode ? 'Light Mode' : 'Dark Mode'}</span>
            </div>
            <span className="text-[10px] font-mono uppercase text-slate-400">
              {darkMode ? 'Dark' : 'Light'}
            </span>
          </button>
        </div>
      </aside>

      {/* Mobile Slide-out Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex">
          <div className="w-72 bg-white dark:bg-slate-900 h-full flex flex-col border-r border-slate-200 dark:border-slate-800">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white">
                  <GraduationCap className="w-4 h-4" />
                </div>
                <span className="font-extrabold font-display text-sm">OBREN · StudyTrack</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              <div className="px-3 py-1 text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                Classrooms & Tests
              </div>
              {CLASSROOM_NAV.map(renderNavButton)}

              <div className="pt-3 px-3 py-1 text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                Exam Prep
              </div>
              {EXAM_NAV.map(renderNavButton)}
              {isAdmin && (
                <>
                  {renderNavButton({
                    id: 'ADMIN_PROCTORING',
                    label: 'Proctoring Admin',
                    icon: Shield,
                  })}
                  {renderNavButton({
                    id: 'AI_MANAGEMENT',
                    label: 'AI Assistant Admin',
                    icon: Brain,
                  })}
                </>
              )}
              <div className="pt-3 px-3 py-1 text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                Tuition & StudyTrack
              </div>
              {STUDYTRACK_NAV.map(renderNavButton)}
            </nav>
            <div className="p-4 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setDarkMode((prev) => !prev)}
                className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold cursor-pointer"
              >
                <span>{darkMode ? 'Switch to Light' : 'Switch to Dark'}</span>
                {darkMode ? (
                  <Sun className="w-4 h-4 text-amber-400" />
                ) : (
                  <Moon className="w-4 h-4 text-indigo-600" />
                )}
              </button>
            </div>
          </div>
          <div className="flex-1" onClick={() => setMobileMenuOpen(false)} />
        </div>
      )}

      {/* Mobile Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-2 py-1.5 flex items-center justify-around z-40">
        {([
          ['OBREN_DASHBOARD', 'Dashboard', LayoutDashboard],
          ['TESTS', 'Tests', Play],
          ['TUITION_PLANNER', 'Tuition', Calendar],
          ['STOPWATCH', 'Stopwatch', Timer],
        ] as const).map(([id, label, Icon]) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => handleSelect(id)}
              className={`flex flex-col items-center gap-1 px-2 py-1.5 rounded-xl text-[10px] font-semibold cursor-pointer ${
                isActive
                  ? 'text-indigo-600 dark:text-indigo-400'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{label}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="flex flex-col items-center gap-1 px-2 py-1.5 rounded-xl text-[10px] font-semibold text-slate-500 dark:text-slate-400 cursor-pointer"
        >
          <Menu className="w-4 h-4" />
          <span>All</span>
        </button>
      </nav>
    </>
  );
};
