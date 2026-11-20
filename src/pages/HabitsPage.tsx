import { useState, type FormEvent } from 'react';
import { Check, Flame, Plus, Trash2 } from 'lucide-react';
import { HABIT_RITUAL_IMAGE, type HabitItem, type PlannerMode } from '../types.ts';
import { MediaImage } from '../components/MediaImage.tsx';

interface HabitsPageProps {
  mode: PlannerMode;
  habits: HabitItem[];
  loading: boolean;
  onAddHabit: (
    title: string,
    category: string,
    targetMinutes: number | null
  ) => Promise<void>;
  onToggleHabit: (habit: HabitItem) => Promise<void>;
  onDeleteHabit: (id: number) => Promise<void>;
}

const CATEGORIES = [
  { id: 'all', label: 'All Rituals' },
  { id: 'wellness', label: 'Wellness' },
  { id: 'plants', label: 'Home & Plants' },
  { id: 'mindful', label: 'Mindful' },
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  wellness: 'Wellness',
  plants: 'Home & Plants',
  mindful: 'Mindful',
};

export function HabitsPage({
  mode,
  habits,
  loading,
  onAddHabit,
  onToggleHabit,
  onDeleteHabit,
}: HabitsPageProps) {
  const isWork = mode === 'work';
  const [filter, setFilter] = useState<string>('all');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('wellness');
  const [targetMinutes, setTargetMinutes] = useState('15');
  const [busy, setBusy] = useState(false);

  const completedToday = habits.filter((h) => h.completedToday).length;
  const bestStreak = habits.reduce((acc, h) => Math.max(acc, h.streakCount), 0);
  const progressPercent =
    habits.length > 0 ? Math.round((completedToday / habits.length) * 100) : 0;

  const visibleHabits =
    filter === 'all' ? habits : habits.filter((h) => h.category === filter);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      const mins = targetMinutes.trim() ? Number(targetMinutes) : null;
      await onAddHabit(
        title.trim(),
        category,
        mins && Number.isFinite(mins) && mins > 0 ? mins : null
      );
      setTitle('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Editorial Split Bento Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <section className="lg:col-span-7 bg-white rounded-[24px] border border-[#E7E1D8] shadow-[0_8px_30px_rgba(30,41,59,0.035)] p-6 sm:p-8 flex flex-col justify-between">
          <div>
            <p
              className={`text-xs font-medium mb-1 transition-colors duration-300 ${
                isWork ? 'text-[#1E293B]' : 'text-[#4A6B5D]'
              }`}
            >
              Daily Routines
            </p>
            <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-[#1E293B]">
              Habits &amp; Calm Rituals
            </h1>
            <p className="text-sm text-[#64748B] mt-2 max-w-xl leading-relaxed">
              Simple checkboxes for grounding daily practices—from 15 minutes of morning yoga to watering your houseplants.
            </p>

            {/* Clean unboxed tabular summary strip */}
            <div className="grid grid-cols-3 gap-4 mt-6 pt-5 border-t border-[#EFEAE2]">
              <div>
                <p className="text-xs text-[#64748B]">Done Today</p>
                <p className="font-display text-2xl font-semibold text-[#1E293B] tabular-nums mt-0.5">
                  {completedToday}/{habits.length}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#64748B]">Longest Streak</p>
                <p className="font-display text-2xl font-semibold text-[#D97757] tabular-nums mt-0.5">
                  {bestStreak} days
                </p>
              </div>
              <div>
                <p className="text-xs text-[#64748B]">Completion</p>
                <p className="font-display text-2xl font-semibold text-[#4A6B5D] tabular-nums mt-0.5">
                  {progressPercent}%
                </p>
              </div>
            </div>

            <div className="h-2 w-full rounded-full bg-[#F1ECE4] overflow-hidden mt-4">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  isWork ? 'bg-[#1E293B]' : 'bg-[#4A6B5D]'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Add New Habit Form */}
          <form
            onSubmit={handleSubmit}
            className="mt-7 pt-6 border-t border-[#EFEAE2] space-y-3"
          >
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="New habit (e.g., 15 mins of yoga, water monstera)..."
                className="flex-1 px-4 py-3 rounded-full bg-[#FAF8F5] border border-[#E3DBD0] text-sm text-[#1E293B] placeholder:text-[#94A3B8] focus:outline-none focus:bg-white focus:border-[#4A6B5D] transition"
              />
              <button
                type="submit"
                disabled={busy || !title.trim()}
                className={`inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full text-white text-sm font-medium active:scale-[0.98] transition-all duration-200 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer ${
                  isWork
                    ? 'bg-[#1E293B] hover:bg-[#0F172A]'
                    : 'bg-[#4A6B5D] hover:bg-[#3A564A]'
                }`}
              >
                <Plus className="w-4 h-4" strokeWidth={2} />
                <span>Add Habit</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-[#64748B]">
              <label className="inline-flex items-center gap-2">
                <span>Category</span>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="px-3 py-1.5 rounded-full bg-[#FAF8F5] border border-[#E3DBD0] text-xs text-[#1E293B] focus:outline-none focus:border-[#4A6B5D]"
                >
                  <option value="wellness">Wellness</option>
                  <option value="plants">Home &amp; Plants</option>
                  <option value="mindful">Mindful</option>
                </select>
              </label>

              <label className="inline-flex items-center gap-2">
                <span>Duration (min)</span>
                <input
                  type="number"
                  min={1}
                  max={240}
                  value={targetMinutes}
                  onChange={(e) => setTargetMinutes(e.target.value)}
                  className="w-20 px-3 py-1.5 rounded-full bg-[#FAF8F5] border border-[#E3DBD0] text-xs text-[#1E293B] tabular-nums focus:outline-none focus:border-[#4A6B5D]"
                />
              </label>
            </div>
          </form>
        </section>

        {/* Right Editorial Image Bento Tile */}
        <div className="lg:col-span-5 relative min-h-[260px] rounded-[24px] overflow-hidden border border-[#E7E1D8]">
          <MediaImage
            src={HABIT_RITUAL_IMAGE}
            alt="Sunlit room with natural cork yoga mat and ceramic planters"
            fallbackLabel="Daily Ritual Space"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#1E293B]/75 via-transparent to-transparent" />
          <div className="absolute bottom-6 left-6 right-6 text-white">
            <p className="text-xs text-white/80">Consistency over intensity</p>
            <p className="font-display text-xl font-medium mt-0.5 [text-wrap:balance]">
              Fifteen unhurried minutes change the tone of the entire evening.
            </p>
          </div>
        </div>
      </div>

      {/* Filter Tabs + Full Habits Checklist */}
      <section className="bg-white rounded-[24px] border border-[#E7E1D8] shadow-[0_8px_30px_rgba(30,41,59,0.035)] p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#EFEAE2]">
          <h2 className="font-display text-xl font-semibold text-[#1E293B]">
            Today’s Checklist
          </h2>

          <div
            role="tablist"
            aria-label="Filter habits by category"
            className="inline-flex flex-wrap items-center gap-1 p-1 rounded-full bg-[#F3EEE7] border border-[#E5DDD2]"
          >
            {CATEGORIES.map((cat) => {
              const active = filter === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(cat.id)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                    active
                      ? isWork
                        ? 'bg-[#1E293B] text-white'
                        : 'bg-[#4A6B5D] text-white'
                      : 'text-[#5C6672] hover:text-[#1E293B]'
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>

        {loading ? (
          <div className="py-8 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-16 rounded-2xl bg-[#F4F0EA] animate-pulse"
              />
            ))}
          </div>
        ) : visibleHabits.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-base font-medium text-[#1E293B]">
              No habits in this category yet
            </p>
            <p className="text-sm text-[#64748B] mt-1">
              Add a daily habit above or switch back to All Rituals.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[#F0EBE3]">
            {visibleHabits.map((habit) => (
              <li
                key={habit.id}
                className="group py-4 sm:py-5 flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <button
                    type="button"
                    onClick={() => onToggleHabit(habit)}
                    aria-label={
                      habit.completedToday
                        ? `Uncheck "${habit.title}"`
                        : `Check off "${habit.title}"`
                    }
                    className={`w-7 h-7 rounded-full flex items-center justify-center border transition-all duration-200 shrink-0 cursor-pointer ${
                      habit.completedToday
                        ? isWork
                          ? 'bg-[#1E293B] border-[#1E293B] text-white'
                          : 'bg-[#4A6B5D] border-[#4A6B5D] text-white'
                        : 'bg-white border-[#CBD5E1] hover:border-[#4A6B5D]'
                    }`}
                  >
                    {habit.completedToday && (
                      <Check className="w-4 h-4" strokeWidth={2.5} />
                    )}
                  </button>

                  <div className="min-w-0">
                    <p
                      className={`text-base font-medium leading-snug transition-colors ${
                        habit.completedToday
                          ? isWork
                            ? 'text-[#64748B] line-through'
                            : 'text-[#4A6B5D]'
                          : 'text-[#1E293B]'
                      }`}
                    >
                      {habit.title}
                    </p>
                    <p className="text-xs text-[#64748B] mt-0.5 tabular-nums">
                      <span>{CATEGORY_LABELS[habit.category] || 'Routine'}</span>
                      {habit.targetMinutes && (
                        <>
                          <span aria-hidden="true" className="mx-1.5">
                            ·
                          </span>
                          <span>{habit.targetMinutes} min</span>
                        </>
                      )}
                      <span aria-hidden="true" className="mx-1.5">
                        ·
                      </span>
                      <span
                        className={
                          habit.completedToday
                            ? 'text-[#4A6B5D] font-medium'
                            : 'text-[#64748B]'
                        }
                      >
                        {habit.completedToday ? 'Completed today' : 'Pending today'}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right">
                    <span className="inline-flex items-center gap-1 text-sm font-mono font-medium text-[#D97757] tabular-nums">
                      <Flame className="w-4 h-4" strokeWidth={2} />
                      {habit.streakCount}
                    </span>
                    <p className="text-[11px] text-[#848D98]">day streak</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => onDeleteHabit(habit.id)}
                    aria-label={`Delete "${habit.title}"`}
                    className="p-2 rounded-full text-[#94A3B8] hover:text-[#B91C1C] hover:bg-[#FEF2F2] opacity-70 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 transition-all cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" strokeWidth={1.8} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
