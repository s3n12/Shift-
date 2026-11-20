import { motion } from 'motion/react';
import { Briefcase, LogOut, Sun } from 'lucide-react';
import type { PageRoute, PlannerMode, UserProfile } from '../types.ts';

interface HeaderProps {
  mode: PlannerMode;
  onModeChange: (mode: PlannerMode) => void;
  activePage: PageRoute;
  onNavigate: (page: PageRoute) => void;
  user: UserProfile;
  onLogout: () => void;
}

const NAV_ITEMS: Array<{ id: PageRoute; label: string }> = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'habits', label: 'Habits' },
  { id: 'trips', label: 'Trips' },
];

export function Header({
  mode,
  onModeChange,
  activePage,
  onNavigate,
  user,
  onLogout,
}: HeaderProps) {
  const isWork = mode === 'work';

  return (
    <header className="sticky top-0 z-30 bg-[#FAF8F5]/92 backdrop-blur-md border-b border-[#E7E1D8] transition-colors duration-300">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-[72px] flex items-center justify-between gap-4 sm:gap-8">
        {/* Zone 1: Clean single-line brand wordmark */}
        <button
          type="button"
          onClick={() => onNavigate('dashboard')}
          className={`font-display text-xl sm:text-2xl font-semibold tracking-tight whitespace-nowrap shrink-0 transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 rounded-md ${
            isWork
              ? 'text-[#1E293B] focus-visible:ring-[#1E293B]'
              : 'text-[#4A6B5D] focus-visible:ring-[#D97757]'
          }`}
        >
          Shift
        </button>

        {/* Zone 2: Clean typographic navigation links (desktop) + prominent Work <-> Weekend toggle */}
        <div className="flex items-center gap-5 lg:gap-8 min-w-0">
          <nav
            aria-label="Primary"
            className="hidden md:flex items-center gap-6 text-sm font-medium"
          >
            {NAV_ITEMS.map((item) => {
              const active = activePage === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  className={`relative py-1 whitespace-nowrap shrink-0 transition-colors duration-200 focus-visible:outline-none ${
                    active
                      ? isWork
                        ? 'text-[#1E293B] font-semibold'
                        : 'text-[#D97757] font-semibold'
                      : 'text-[#64748B] hover:text-[#1E293B]'
                  }`}
                >
                  {item.label}
                  {active && (
                    <motion.span
                      layoutId="shift-nav-underline"
                      transition={{ type: 'spring', stiffness: 460, damping: 36 }}
                      className={`absolute left-0 right-0 -bottom-0.5 h-[2px] rounded-full transition-colors duration-300 ${
                        isWork ? 'bg-[#1E293B]' : 'bg-[#D97757]'
                      }`}
                    />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Signature Sliding Toggle Switch: Work Mode <-> Weekend Mode */}
          <div
            role="group"
            aria-label="Planner mode switch"
            className="relative inline-flex items-center p-1 rounded-full bg-[#EFEAE2] border border-[#E3DBD0] shrink-0"
          >
            <button
              type="button"
              onClick={() => onModeChange('work')}
              aria-pressed={isWork}
              className={`relative z-10 inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium whitespace-nowrap shrink-0 transition-colors duration-200 cursor-pointer ${
                isWork ? 'text-white' : 'text-[#5C6672] hover:text-[#1E293B]'
              }`}
            >
              {isWork && (
                <motion.span
                  layoutId="shift-mode-thumb"
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  className="absolute inset-0 -z-10 rounded-full bg-[#1E293B] shadow-sm"
                />
              )}
              <Briefcase className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
              <span>Work Mode</span>
            </button>

            <button
              type="button"
              onClick={() => onModeChange('weekend')}
              aria-pressed={!isWork}
              className={`relative z-10 inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium whitespace-nowrap shrink-0 transition-colors duration-200 cursor-pointer ${
                !isWork ? 'text-white' : 'text-[#5C6672] hover:text-[#1E293B]'
              }`}
            >
              {!isWork && (
                <motion.span
                  layoutId="shift-mode-thumb"
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  className="absolute inset-0 -z-10 rounded-full bg-[#D97757] shadow-sm"
                />
              )}
              <Sun className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
              <span>Weekend Mode</span>
            </button>
          </div>
        </div>

        {/* Zone 3: User sign-out pill button */}
        <div className="flex items-center gap-3 shrink-0">
          <span className="hidden lg:inline-block text-sm text-[#64748B] truncate max-w-[140px]">
            {user.displayName || user.email.split('@')[0]}
          </span>
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs sm:text-sm font-medium border border-[#DED7CC] bg-white text-[#1E293B] hover:bg-[#F3EFE8] transition-colors duration-200 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" strokeWidth={1.8} />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </div>

      {/* Compact mobile navigation strip */}
      <nav
        aria-label="Mobile Navigation"
        className="flex md:hidden items-center justify-center gap-8 border-t border-[#ECE6DD] py-2 px-4 text-xs font-medium bg-[#FAF8F5]"
      >
        {NAV_ITEMS.map((item) => {
          const active = activePage === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={`py-1 whitespace-nowrap shrink-0 transition-colors ${
                active
                  ? isWork
                    ? 'text-[#1E293B] font-semibold underline underline-offset-4 decoration-2'
                    : 'text-[#D97757] font-semibold underline underline-offset-4 decoration-2'
                  : 'text-[#64748B]'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
}
