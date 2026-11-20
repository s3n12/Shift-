import { useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowRight,
  Calendar,
  Check,
  Flame,
  Plus,
  Sun,
  Trash2,
  Briefcase,
} from 'lucide-react';
import {
  HABIT_RITUAL_IMAGE,
  daysUntil,
  formatReadableDate,
  getTripCoverSrc,
  type HabitItem,
  type PackingItem,
  type PageRoute,
  type PlannerMode,
  type TaskItem,
  type TripItem,
} from '../types.ts';
import { MediaImage } from '../components/MediaImage.tsx';

interface DashboardPageProps {
  mode: PlannerMode;
  onModeChange: (mode: PlannerMode) => void;
  onNavigate: (page: PageRoute) => void;
  tasks: TaskItem[];
  habits: HabitItem[];
  trips: TripItem[];
  loading: boolean;
  onAddTask: (title: string, notes?: string) => Promise<void>;
  onToggleTask: (task: TaskItem) => Promise<void>;
  onDeleteTask: (id: number) => Promise<void>;
  onAddHabit: (title: string, category?: string, targetMinutes?: number | null) => Promise<void>;
  onToggleHabit: (habit: HabitItem) => Promise<void>;
  onDeleteHabit: (id: number) => Promise<void>;
  onUpdateTripPacking: (trip: TripItem, nextList: PackingItem[]) => Promise<void>;
}

export function DashboardPage({
  mode,
  onModeChange,
  onNavigate,
  tasks,
  habits,
  trips,
  loading,
  onAddTask,
  onToggleTask,
  onDeleteTask,
  onAddHabit,
  onToggleHabit,
  onDeleteHabit,
  onUpdateTripPacking,
}: DashboardPageProps) {
  const isWork = mode === 'work';
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskNotes, setNewTaskNotes] = useState('');
  const [taskBusy, setTaskBusy] = useState(false);

  const [newHabitTitle, setNewHabitTitle] = useState('');
  const [habitBusy, setHabitBusy] = useState(false);

  const [newPackLabel, setNewPackLabel] = useState('');

  const todayFormatted = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const workTasks = tasks.filter((t) => t.mode === 'work');
  const topThreeTasks = workTasks.slice(0, 3);
  const extraWorkTasks = workTasks.slice(3);
  const completedWorkCount = workTasks.filter((t) => t.isCompleted).length;

  const completedHabitsCount = habits.filter((h) => h.completedToday).length;
  const bestStreak = habits.reduce((max, h) => Math.max(max, h.streakCount), 0);

  const upcomingTrips = [...trips].sort((a, b) =>
    a.travelDate.localeCompare(b.travelDate)
  );
  const nextTrip = upcomingTrips[0] || null;
  const nextTripDays = nextTrip ? daysUntil(nextTrip.travelDate) : null;
  const nextTripPackedCount = nextTrip
    ? nextTrip.packingList.filter((p) => p.packed).length
    : 0;

  const handleTaskSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim() || taskBusy) return;
    setTaskBusy(true);
    try {
      await onAddTask(newTaskTitle.trim(), newTaskNotes.trim() || undefined);
      setNewTaskTitle('');
      setNewTaskNotes('');
    } finally {
      setTaskBusy(false);
    }
  };

  const handleHabitSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!newHabitTitle.trim() || habitBusy) return;
    setHabitBusy(true);
    try {
      await onAddHabit(newHabitTitle.trim(), 'wellness', 15);
      setNewHabitTitle('');
    } finally {
      setHabitBusy(false);
    }
  };

  const handleTogglePacking = async (itemId: string) => {
    if (!nextTrip) return;
    const nextList = nextTrip.packingList.map((item) =>
      item.id === itemId ? { ...item, packed: !item.packed } : item
    );
    await onUpdateTripPacking(nextTrip, nextList);
  };

  const handleAddPackingItem = async (e: FormEvent) => {
    e.preventDefault();
    if (!nextTrip || !newPackLabel.trim()) return;
    const nextList: PackingItem[] = [
      ...nextTrip.packingList,
      { id: crypto.randomUUID(), label: newPackLabel.trim(), packed: false },
    ];
    setNewPackLabel('');
    await onUpdateTripPacking(nextTrip, nextList);
  };

  const handleDeletePackingItem = async (itemId: string) => {
    if (!nextTrip) return;
    const nextList = nextTrip.packingList.filter((item) => item.id !== itemId);
    await onUpdateTripPacking(nextTrip, nextList);
  };

  return (
    <div className="space-y-8">
      {/* Contextual Greeting Row */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-sm text-[#64748B] mb-1">
            {todayFormatted}
            <span aria-hidden="true" className="mx-2">
              ·
            </span>
            <span
              className={`font-medium transition-colors duration-300 ${
                isWork ? 'text-[#1E293B]' : 'text-[#D97757]'
              }`}
            >
              {isWork ? 'Work Mode' : 'Weekend Mode'}
            </span>
          </p>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-[#1E293B] [text-wrap:balance]">
            {isWork ? 'Today’s Focus' : 'Unwind & Recharge'}
          </h1>
        </div>

        <p className="text-sm text-[#64748B] tabular-nums">
          {isWork ? (
            <>
              <span className="font-semibold text-[#1E293B]">
                {completedWorkCount} of {workTasks.length}
              </span>{' '}
              work tasks completed
            </>
          ) : (
            <>
              <span className="font-semibold text-[#4A6B5D]">
                {completedHabitsCount} of {habits.length}
              </span>{' '}
              daily rituals done
              {nextTripDays !== null && (
                <>
                  <span aria-hidden="true" className="mx-2">
                    ·
                  </span>
                  <span className="font-semibold text-[#D97757]">
                    {Math.max(0, nextTripDays)} days
                  </span>{' '}
                  to {nextTrip?.destination}
                </>
              )}
            </>
          )}
        </p>
      </div>

      {/* Mode-Switching Bento Grid */}
      <AnimatePresence mode="wait">
        {isWork ? (
          <motion.div
            key="work-bento"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
          >
            {/* Primary Focal Anchor (8 cols): Top 3 Work Tasks */}
            <section className="lg:col-span-8 bg-white rounded-[24px] border border-[#E7E1D8] shadow-[0_8px_30px_rgba(30,41,59,0.035)] p-6 sm:p-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-6 border-b border-[#EFEAE2]">
                <div>
                  <h2 className="font-display text-xl sm:text-2xl font-semibold text-[#1E293B]">
                    Top 3 Work Tasks
                  </h2>
                  <p className="text-sm text-[#64748B] mt-0.5">
                    Keep your day intentional by finishing three meaningful deliverables first.
                  </p>
                </div>
                <span className="text-xs font-mono text-[#64748B] tabular-nums shrink-0">
                  {Math.min(
                    topThreeTasks.filter((t) => t.isCompleted).length,
                    3
                  )}
                  /{Math.max(topThreeTasks.length, 3)} DONE
                </span>
              </div>

              {loading ? (
                <div className="py-8 space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-16 rounded-2xl bg-[#F4F0EA] animate-pulse"
                    />
                  ))}
                </div>
              ) : topThreeTasks.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-base font-medium text-[#1E293B]">
                    No work tasks yet
                  </p>
                  <p className="text-sm text-[#64748B] mt-1">
                    Add up to three key priorities below to anchor your workday.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-[#F0EBE3]">
                  {topThreeTasks.map((task, idx) => (
                    <li
                      key={task.id}
                      className="group py-5 flex items-start gap-4 transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => onToggleTask(task)}
                        aria-label={
                          task.isCompleted
                            ? `Mark "${task.title}" incomplete`
                            : `Complete "${task.title}"`
                        }
                        className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center border transition-all duration-200 shrink-0 cursor-pointer ${
                          task.isCompleted
                            ? 'bg-[#1E293B] border-[#1E293B] text-white'
                            : 'bg-white border-[#CBD5E1] hover:border-[#1E293B]'
                        }`}
                      >
                        {task.isCompleted && (
                          <Check className="w-3.5 h-3.5" strokeWidth={2.6} />
                        )}
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2.5">
                          <span className="font-mono text-xs text-[#94A3B8] tabular-nums shrink-0">
                            0{idx + 1}
                          </span>
                          <p
                            className={`text-[15px] sm:text-base font-medium leading-snug transition-colors ${
                              task.isCompleted
                                ? 'line-through text-[#94A3B8]'
                                : 'text-[#1E293B]'
                            }`}
                          >
                            {task.title}
                          </p>
                        </div>
                        {task.notes && (
                          <p className="mt-1 pl-6 text-xs sm:text-sm text-[#64748B] leading-relaxed">
                            {task.notes}
                          </p>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => onDeleteTask(task.id)}
                        aria-label={`Delete "${task.title}"`}
                        className="p-2 rounded-full text-[#94A3B8] hover:text-[#B91C1C] hover:bg-[#FEF2F2] opacity-70 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 transition-all cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-4 h-4" strokeWidth={1.8} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {/* Additional queued work tasks beyond Top 3 */}
              {extraWorkTasks.length > 0 && (
                <div className="mt-4 pt-5 border-t border-[#EFEAE2]">
                  <p className="text-xs font-medium text-[#64748B] mb-3">
                    Up next ({extraWorkTasks.length})
                  </p>
                  <ul className="space-y-2.5">
                    {extraWorkTasks.map((task) => (
                      <li
                        key={task.id}
                        className="group flex items-center justify-between gap-3 py-1.5"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <button
                            type="button"
                            onClick={() => onToggleTask(task)}
                            className={`w-5 h-5 rounded-full flex items-center justify-center border transition-colors shrink-0 cursor-pointer ${
                              task.isCompleted
                                ? 'bg-[#1E293B] border-[#1E293B] text-white'
                                : 'bg-white border-[#CBD5E1] hover:border-[#1E293B]'
                            }`}
                          >
                            {task.isCompleted && (
                              <Check className="w-3 h-3" strokeWidth={2.5} />
                            )}
                          </button>
                          <span
                            className={`text-sm truncate ${
                              task.isCompleted
                                ? 'line-through text-[#94A3B8]'
                                : 'text-[#334155]'
                            }`}
                          >
                            {task.title}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => onDeleteTask(task.id)}
                          aria-label={`Delete "${task.title}"`}
                          className="p-1.5 rounded-full text-[#94A3B8] hover:text-[#B91C1C] hover:bg-[#FEF2F2] opacity-70 sm:opacity-0 sm:group-hover:opacity-100 transition-all cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" strokeWidth={1.8} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Quick-add Work Task Form */}
              <form
                onSubmit={handleTaskSubmit}
                className="mt-6 pt-6 border-t border-[#EFEAE2] space-y-3"
              >
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="text"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    placeholder="Add a work priority..."
                    className="flex-1 px-4 py-3 rounded-full bg-[#FAF8F5] border border-[#E3DBD0] text-sm text-[#1E293B] placeholder:text-[#94A3B8] focus:outline-none focus:bg-white focus:border-[#1E293B] transition"
                  />
                  <button
                    type="submit"
                    disabled={taskBusy || !newTaskTitle.trim()}
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-[#1E293B] text-white text-sm font-medium hover:bg-[#0F172A] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" strokeWidth={2} />
                    <span>Add Task</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={newTaskNotes}
                  onChange={(e) => setNewTaskNotes(e.target.value)}
                  placeholder="Optional context or deadline note..."
                  className="w-full px-4 py-2 rounded-full bg-transparent text-xs text-[#64748B] placeholder:text-[#A3ACB8] focus:outline-none focus:text-[#1E293B]"
                />
              </form>
            </section>

            {/* Right Bento Column (4 cols): Work Rhythm + Next Trip Horizon */}
            <div className="lg:col-span-4 space-y-6">
              {/* Daily Rhythm & End-of-Day Switch */}
              <section className="bg-white rounded-[24px] border border-[#E7E1D8] shadow-[0_8px_30px_rgba(30,41,59,0.035)] p-6">
                <h3 className="font-display text-lg font-semibold text-[#1E293B]">
                  Workday Pulse
                </h3>
                <p className="text-xs text-[#64748B] mt-1">
                  Finish what matters, then close the laptop.
                </p>

                <div className="grid grid-cols-2 gap-4 my-5 py-4 border-y border-[#F0EBE3]">
                  <div>
                    <p className="text-xs text-[#64748B]">Remaining</p>
                    <p className="font-display text-2xl font-semibold text-[#1E293B] tabular-nums mt-0.5">
                      {Math.max(0, workTasks.length - completedWorkCount)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[#64748B]">Best Habit Streak</p>
                    <p className="font-display text-2xl font-semibold text-[#4A6B5D] tabular-nums mt-0.5">
                      {bestStreak}d
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onModeChange('weekend')}
                  className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-[#D97757] text-white text-sm font-medium hover:bg-[#BF6243] active:scale-[0.98] transition-all duration-200 whitespace-nowrap cursor-pointer"
                >
                  <Sun className="w-4 h-4 shrink-0" strokeWidth={2} />
                  <span>Flip to Weekend Mode</span>
                </button>
              </section>

              {/* Upcoming Getaway Teaser */}
              {nextTrip && (
                <section className="bg-white rounded-[24px] border border-[#E7E1D8] shadow-[0_8px_30px_rgba(30,41,59,0.035)] overflow-hidden">
                  <div className="relative h-44 w-full">
                    <MediaImage
                      src={getTripCoverSrc(nextTrip.coverKey)}
                      alt={nextTrip.destination}
                      fallbackLabel={nextTrip.destination}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#1E293B]/80 via-[#1E293B]/20 to-transparent" />
                    <div className="absolute bottom-4 left-5 right-5 text-white">
                      <p className="text-xs text-white/80 tabular-nums">
                        {nextTripDays !== null && nextTripDays >= 0
                          ? `In ${nextTripDays} days`
                          : 'Active getaway'}{' '}
                        · {formatReadableDate(nextTrip.travelDate)}
                      </p>
                      <h3 className="font-display text-xl font-semibold mt-0.5">
                        {nextTrip.destination}
                      </h3>
                    </div>
                  </div>
                  <div className="p-5 flex items-center justify-between gap-3">
                    <span className="text-xs text-[#64748B] tabular-nums">
                      {nextTripPackedCount} of {nextTrip.packingList.length} packed
                    </span>
                    <button
                      type="button"
                      onClick={() => onNavigate('trips')}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#F4F0EA] text-xs font-medium text-[#1E293B] hover:bg-[#E9E2D8] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <span>View Trip</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </section>
              )}
            </div>
          </motion.div>
        ) : (
          /* WEEKEND MODE: Work tasks completely hidden; Warm Terracotta & Sage Green accents */
          <motion.div
            key="weekend-bento"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
          >
            {/* Left Bento Column (7 cols): Habit Tracker + Editorial Lifestyle Card */}
            <div className="lg:col-span-7 space-y-6">
              <section className="bg-white rounded-[24px] border border-[#E7E1D8] shadow-[0_8px_30px_rgba(74,107,93,0.05)] p-6 sm:p-8">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-6 border-b border-[#EFEAE2]">
                  <div>
                    <h2 className="font-display text-xl sm:text-2xl font-semibold text-[#1E293B]">
                      Weekend Habit Tracker
                    </h2>
                    <p className="text-sm text-[#64748B] mt-0.5">
                      Work tasks are tucked away. Tend to your mind, body, and home.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('habits')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#EDF3F0] text-xs font-medium text-[#4A6B5D] hover:bg-[#DFEBE5] transition-colors whitespace-nowrap shrink-0 cursor-pointer self-start sm:self-auto"
                  >
                    <span>All Habits</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {loading ? (
                  <div className="py-6 space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="h-14 rounded-2xl bg-[#F4F0EA] animate-pulse"
                      />
                    ))}
                  </div>
                ) : habits.length === 0 ? (
                  <div className="py-10 text-center">
                    <p className="text-base font-medium text-[#1E293B]">
                      No habits tracked yet
                    </p>
                    <p className="text-sm text-[#64748B] mt-1">
                      Add a relaxing routine like 15 mins of yoga or watering plants.
                    </p>
                  </div>
                ) : (
                  <ul className="divide-y divide-[#F0EBE3]">
                    {habits.map((habit) => (
                      <li
                        key={habit.id}
                        className="group py-4 flex items-center justify-between gap-4"
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <button
                            type="button"
                            onClick={() => onToggleHabit(habit)}
                            aria-label={
                              habit.completedToday
                                ? `Uncheck "${habit.title}"`
                                : `Complete "${habit.title}"`
                            }
                            className={`w-6 h-6 rounded-full flex items-center justify-center border transition-all duration-200 shrink-0 cursor-pointer ${
                              habit.completedToday
                                ? 'bg-[#4A6B5D] border-[#4A6B5D] text-white'
                                : 'bg-white border-[#CBD5E1] hover:border-[#4A6B5D]'
                            }`}
                          >
                            {habit.completedToday && (
                              <Check className="w-3.5 h-3.5" strokeWidth={2.6} />
                            )}
                          </button>

                          <div className="min-w-0">
                            <p
                              className={`text-[15px] font-medium truncate transition-colors ${
                                habit.completedToday
                                  ? 'text-[#4A6B5D]'
                                  : 'text-[#1E293B]'
                              }`}
                            >
                              {habit.title}
                            </p>
                            <p className="text-xs text-[#64748B] tabular-nums mt-0.5">
                              {habit.targetMinutes ? `${habit.targetMinutes} min · ` : ''}
                              <span className="text-[#D97757] font-medium">
                                {habit.streakCount} day streak
                              </span>
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="inline-flex items-center gap-1 text-xs font-mono text-[#D97757] tabular-nums">
                            <Flame className="w-3.5 h-3.5" strokeWidth={2} />
                            {habit.streakCount}
                          </span>
                          <button
                            type="button"
                            onClick={() => onDeleteHabit(habit.id)}
                            aria-label={`Delete "${habit.title}"`}
                            className="p-2 rounded-full text-[#94A3B8] hover:text-[#B91C1C] hover:bg-[#FEF2F2] opacity-70 sm:opacity-0 sm:group-hover:opacity-100 transition-all cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" strokeWidth={1.8} />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                <form
                  onSubmit={handleHabitSubmit}
                  className="mt-5 pt-5 border-t border-[#EFEAE2] flex flex-col sm:flex-row gap-3"
                >
                  <input
                    type="text"
                    value={newHabitTitle}
                    onChange={(e) => setNewHabitTitle(e.target.value)}
                    placeholder="Add a relaxing habit (e.g., Water balcony herbs)..."
                    className="flex-1 px-4 py-3 rounded-full bg-[#FAF8F5] border border-[#E3DBD0] text-sm text-[#1E293B] placeholder:text-[#94A3B8] focus:outline-none focus:bg-white focus:border-[#4A6B5D] transition"
                  />
                  <button
                    type="submit"
                    disabled={habitBusy || !newHabitTitle.trim()}
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-[#4A6B5D] text-white text-sm font-medium hover:bg-[#3A564A] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" strokeWidth={2} />
                    <span>Add Habit</span>
                  </button>
                </form>
              </section>

              {/* Editorial Morning Ritual Visual Card */}
              <section className="bg-white rounded-[24px] border border-[#E7E1D8] shadow-[0_8px_30px_rgba(74,107,93,0.04)] overflow-hidden grid grid-cols-1 sm:grid-cols-12 items-stretch">
                <div className="sm:col-span-5 h-52 sm:h-auto">
                  <MediaImage
                    src={HABIT_RITUAL_IMAGE}
                    alt="Sunlit living room corner with cork yoga mat and ceramic plant pots"
                    fallbackLabel="Morning Rituals"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="sm:col-span-7 p-6 flex flex-col justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium text-[#4A6B5D]">
                      Slow Living Pace
                    </p>
                    <h3 className="font-display text-xl font-semibold text-[#1E293B] mt-1">
                      {completedHabitsCount === habits.length && habits.length > 0
                        ? 'Every ritual completed today'
                        : `${habits.length - completedHabitsCount} calm rituals left today`}
                    </h3>
                    <p className="text-sm text-[#64748B] mt-1.5 leading-relaxed">
                      Longest active streak is{' '}
                      <span className="font-semibold text-[#D97757] tabular-nums">
                        {bestStreak} days
                      </span>
                      . Ready to jump back to office tasks whenever Monday arrives.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => onNavigate('habits')}
                      className="px-5 py-2.5 rounded-full bg-[#4A6B5D] text-white text-xs sm:text-sm font-medium hover:bg-[#3A564A] transition-colors whitespace-nowrap cursor-pointer"
                    >
                      Open Habits
                    </button>
                    <button
                      type="button"
                      onClick={() => onModeChange('work')}
                      className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-[#F4F0EA] text-[#1E293B] text-xs sm:text-sm font-medium hover:bg-[#E8E1D7] transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <Briefcase className="w-3.5 h-3.5" />
                      <span>Back to Work</span>
                    </button>
                  </div>
                </div>
              </section>
            </div>

            {/* Right Bento Column (5 cols): Trip Countdown Card + Interactive Packing List */}
            <section className="lg:col-span-5 bg-white rounded-[24px] border border-[#E7E1D8] shadow-[0_8px_30px_rgba(217,119,87,0.06)] overflow-hidden">
              {nextTrip ? (
                <>
                  <div className="relative h-60 w-full">
                    <MediaImage
                      src={getTripCoverSrc(nextTrip.coverKey)}
                      alt={nextTrip.destination}
                      fallbackLabel={nextTrip.destination}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#1E293B]/85 via-[#1E293B]/25 to-transparent" />
                    <div className="absolute bottom-5 left-6 right-6 text-white">
                      <div className="flex items-end justify-between gap-3">
                        <div>
                          <p className="text-xs text-white/80 inline-flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5" />
                            <span>{formatReadableDate(nextTrip.travelDate)}</span>
                          </p>
                          <h2 className="font-display text-2xl font-semibold mt-1">
                            {nextTrip.destination}
                          </h2>
                          {nextTrip.subtitle && (
                            <p className="text-xs text-white/80 mt-0.5 line-clamp-1">
                              {nextTrip.subtitle}
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-display text-3xl font-semibold leading-none tabular-nums">
                            {Math.max(0, nextTripDays ?? 0)}
                          </p>
                          <p className="text-[11px] text-white/80 mt-1">
                            days left
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-6">
                    <div className="flex items-center justify-between gap-2 mb-4">
                      <div>
                        <h3 className="font-display text-base font-semibold text-[#1E293B]">
                          Packing Checklist
                        </h3>
                        <p className="text-xs text-[#64748B] tabular-nums">
                          {nextTripPackedCount} of {nextTrip.packingList.length} packed
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onNavigate('trips')}
                        className="inline-flex items-center gap-1 px-4 py-2 rounded-full bg-[#FBF0EC] text-xs font-medium text-[#D97757] hover:bg-[#F6E2DA] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <span>Trips Board</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Packing progress bar */}
                    <div className="h-1.5 w-full rounded-full bg-[#F1ECE4] overflow-hidden mb-4">
                      <div
                        className="h-full rounded-full bg-[#D97757] transition-all duration-300"
                        style={{
                          width: `${
                            nextTrip.packingList.length > 0
                              ? Math.round(
                                  (nextTripPackedCount /
                                    nextTrip.packingList.length) *
                                    100
                                )
                              : 0
                          }%`,
                        }}
                      />
                    </div>

                    <ul className="divide-y divide-[#F3EFE8] max-h-64 overflow-y-auto pr-1">
                      {nextTrip.packingList.map((item) => (
                        <li
                          key={item.id}
                          className="group py-2.5 flex items-center justify-between gap-3"
                        >
                          <button
                            type="button"
                            onClick={() => handleTogglePacking(item.id)}
                            className="flex items-center gap-3 min-w-0 text-left flex-1 cursor-pointer"
                          >
                            <span
                              className={`w-5 h-5 rounded-full flex items-center justify-center border transition-colors shrink-0 ${
                                item.packed
                                  ? 'bg-[#D97757] border-[#D97757] text-white'
                                  : 'bg-white border-[#CBD5E1] group-hover:border-[#D97757]'
                              }`}
                            >
                              {item.packed && (
                                <Check className="w-3 h-3" strokeWidth={2.6} />
                              )}
                            </span>
                            <span
                              className={`text-sm truncate ${
                                item.packed
                                  ? 'line-through text-[#94A3B8]'
                                  : 'text-[#1E293B]'
                              }`}
                            >
                              {item.label}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeletePackingItem(item.id)}
                            aria-label={`Remove "${item.label}"`}
                            className="p-1.5 rounded-full text-[#94A3B8] hover:text-[#B91C1C] opacity-70 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>

                    <form
                      onSubmit={handleAddPackingItem}
                      className="mt-4 pt-4 border-t border-[#EFEAE2] flex gap-2"
                    >
                      <input
                        type="text"
                        value={newPackLabel}
                        onChange={(e) => setNewPackLabel(e.target.value)}
                        placeholder="Add item to pack..."
                        className="flex-1 px-4 py-2.5 rounded-full bg-[#FAF8F5] border border-[#E3DBD0] text-xs sm:text-sm text-[#1E293B] placeholder:text-[#94A3B8] focus:outline-none focus:bg-white focus:border-[#D97757] transition"
                      />
                      <button
                        type="submit"
                        disabled={!newPackLabel.trim()}
                        className="px-4 py-2.5 rounded-full bg-[#D97757] text-white text-xs sm:text-sm font-medium hover:bg-[#BF6243] transition-colors disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Add
                      </button>
                    </form>
                  </div>
                </>
              ) : (
                <div className="p-8 text-center">
                  <h3 className="font-display text-xl font-semibold text-[#1E293B]">
                    Plan Your Next Getaway
                  </h3>
                  <p className="text-sm text-[#64748B] mt-2 mb-5">
                    Add an upcoming destination to track your countdown and packing list here.
                  </p>
                  <button
                    type="button"
                    onClick={() => onNavigate('trips')}
                    className="px-6 py-3 rounded-full bg-[#D97757] text-white text-sm font-medium hover:bg-[#BF6243] transition-colors cursor-pointer"
                  >
                    Create First Trip
                  </button>
                </div>
              )}
            </section>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
