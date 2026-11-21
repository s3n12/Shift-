import {
  Component,
  useCallback,
  useEffect,
  useState,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { api } from './lib/api.ts';
import { Header } from './components/Header.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { HabitsPage } from './pages/HabitsPage.tsx';
import { TripsPage } from './pages/TripsPage.tsx';
import type {
  HabitItem,
  PackingItem,
  PageRoute,
  PlannerMode,
  TaskItem,
  TripItem,
} from './types.ts';

class ShiftErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      message: error?.message || 'An unexpected error occurred.',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Shift application error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center px-6">
          <div className="max-w-md w-full bg-white rounded-[24px] border border-[#E7E1D8] p-8 text-center space-y-4">
            <p className="font-display text-2xl font-semibold text-[#1E293B]">
              Shift
            </p>
            <p className="text-sm text-[#64748B]">
              Something interrupted your session. Please reload to continue.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 rounded-full bg-[#1E293B] text-white text-sm font-medium hover:bg-[#0F172A] transition-colors cursor-pointer"
            >
              Reload Workspace
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function ShiftWorkspace() {
  const { user, loading: authLoading, getToken, logout } = useAuth();
  const [mode, setMode] = useState<PlannerMode>('work');
  const [activePage, setActivePage] = useState<PageRoute>('dashboard');

  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [habits, setHabits] = useState<HabitItem[]>([]);
  const [trips, setTrips] = useState<TripItem[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  const loadAllData = useCallback(async () => {
    if (!user) return;
    setDataLoading(true);
    setDataError(null);
    try {
      const token = await getToken();
      if (!token) return;
      const [tasksRes, habitsRes, tripsRes] = await Promise.all([
        api.listTasks(token),
        api.listHabits(token),
        api.listTrips(token),
      ]);
      setTasks(tasksRes.tasks);
      setHabits(habitsRes.habits);
      setTrips(tripsRes.trips);
    } catch (err: unknown) {
      setDataError(
        err instanceof Error ? err.message : 'Unable to load your planner data.'
      );
    } finally {
      setDataLoading(false);
    }
  }, [user, getToken]);

  useEffect(() => {
    if (user) {
      loadAllData();
    } else {
      setTasks([]);
      setHabits([]);
      setTrips([]);
    }
  }, [user, loadAllData]);

  // --- Task Actions ---
  const handleAddTask = async (title: string, notes?: string) => {
    setDataError(null);
    try {
      const token = await getToken();
      if (!token) return;
      const { task } = await api.createTask(token, {
        title,
        mode: 'work',
        notes,
      });
      setTasks((prev) => [task, ...prev]);
    } catch (err: unknown) {
      setDataError(err instanceof Error ? err.message : 'Could not add task.');
    }
  };

  const handleToggleTask = async (task: TaskItem) => {
    setDataError(null);
    const nextCompleted = !task.isCompleted;
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id ? { ...t, isCompleted: nextCompleted } : t
      )
    );
    try {
      const token = await getToken();
      if (!token) return;
      const { task: updated } = await api.updateTask(token, task.id, {
        isCompleted: nextCompleted,
      });
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
    } catch (err: unknown) {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
      setDataError(err instanceof Error ? err.message : 'Could not update task.');
    }
  };

  const handleDeleteTask = async (id: number) => {
    setDataError(null);
    const previous = tasks;
    setTasks((prev) => prev.filter((t) => t.id !== id));
    try {
      const token = await getToken();
      if (!token) return;
      await api.deleteTask(token, id);
    } catch (err: unknown) {
      setTasks(previous);
      setDataError(err instanceof Error ? err.message : 'Could not delete task.');
    }
  };

  // --- Habit Actions ---
  const handleAddHabit = async (
    title: string,
    category = 'wellness',
    targetMinutes: number | null = 15
  ) => {
    setDataError(null);
    try {
      const token = await getToken();
      if (!token) return;
      const { habit } = await api.createHabit(token, {
        title,
        category,
        targetMinutes,
      });
      setHabits((prev) => [...prev, habit]);
    } catch (err: unknown) {
      setDataError(err instanceof Error ? err.message : 'Could not add habit.');
    }
  };

  const handleToggleHabit = async (habit: HabitItem) => {
    setDataError(null);
    const optimistic: HabitItem = {
      ...habit,
      completedToday: !habit.completedToday,
      streakCount: !habit.completedToday
        ? habit.streakCount + 1
        : Math.max(0, habit.streakCount - 1),
    };
    setHabits((prev) => prev.map((h) => (h.id === habit.id ? optimistic : h)));
    try {
      const token = await getToken();
      if (!token) return;
      const { habit: updated } = await api.toggleHabit(token, habit.id);
      setHabits((prev) => prev.map((h) => (h.id === habit.id ? updated : h)));
    } catch (err: unknown) {
      setHabits((prev) => prev.map((h) => (h.id === habit.id ? habit : h)));
      setDataError(err instanceof Error ? err.message : 'Could not update habit.');
    }
  };

  const handleDeleteHabit = async (id: number) => {
    setDataError(null);
    const previous = habits;
    setHabits((prev) => prev.filter((h) => h.id !== id));
    try {
      const token = await getToken();
      if (!token) return;
      await api.deleteHabit(token, id);
    } catch (err: unknown) {
      setHabits(previous);
      setDataError(err instanceof Error ? err.message : 'Could not delete habit.');
    }
  };

  // --- Trip Actions ---
  const handleCreateTrip = async (data: {
    destination: string;
    subtitle?: string;
    travelDate: string;
    coverKey: string;
    packingList: PackingItem[];
  }) => {
    setDataError(null);
    try {
      const token = await getToken();
      if (!token) return;
      const { trip } = await api.createTrip(token, data);
      setTrips((prev) => [...prev, trip]);
    } catch (err: unknown) {
      setDataError(err instanceof Error ? err.message : 'Could not save trip.');
    }
  };

  const handleUpdateTripPacking = async (
    trip: TripItem,
    nextList: PackingItem[]
  ) => {
    setDataError(null);
    setTrips((prev) =>
      prev.map((t) => (t.id === trip.id ? { ...t, packingList: nextList } : t))
    );
    try {
      const token = await getToken();
      if (!token) return;
      const { trip: updated } = await api.updateTrip(token, trip.id, {
        packingList: nextList,
      });
      setTrips((prev) => prev.map((t) => (t.id === trip.id ? updated : t)));
    } catch (err: unknown) {
      setTrips((prev) => prev.map((t) => (t.id === trip.id ? trip : t)));
      setDataError(
        err instanceof Error ? err.message : 'Could not save packing list.'
      );
    }
  };

  const handleDeleteTrip = async (id: number) => {
    setDataError(null);
    const previous = trips;
    setTrips((prev) => prev.filter((t) => t.id !== id));
    try {
      const token = await getToken();
      if (!token) return;
      await api.deleteTrip(token, id);
    } catch (err: unknown) {
      setTrips(previous);
      setDataError(err instanceof Error ? err.message : 'Could not delete trip.');
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="font-display text-2xl font-semibold tracking-tight text-[#1E293B]">
            Shift
          </p>
          <p className="text-xs text-[#64748B]">Loading your workspace...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#1E293B] flex flex-col transition-colors duration-300">
      <Header
        mode={mode}
        onModeChange={setMode}
        activePage={activePage}
        onNavigate={setActivePage}
        user={user}
        onLogout={logout}
      />

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        {dataError && (
          <div
            role="alert"
            className="mb-6 px-5 py-3.5 rounded-2xl bg-[#FDF2EE] border border-[#EBC6B9] text-sm text-[#9A3D22] flex items-center justify-between gap-4"
          >
            <span>{dataError}</span>
            <button
              type="button"
              onClick={() => setDataError(null)}
              className="text-xs font-medium underline underline-offset-2 shrink-0 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {activePage === 'dashboard' && (
          <DashboardPage
            mode={mode}
            onModeChange={setMode}
            onNavigate={setActivePage}
            tasks={tasks}
            habits={habits}
            trips={trips}
            loading={dataLoading}
            onAddTask={handleAddTask}
            onToggleTask={handleToggleTask}
            onDeleteTask={handleDeleteTask}
            onAddHabit={handleAddHabit}
            onToggleHabit={handleToggleHabit}
            onDeleteHabit={handleDeleteHabit}
            onUpdateTripPacking={handleUpdateTripPacking}
          />
        )}

        {activePage === 'habits' && (
          <HabitsPage
            mode={mode}
            habits={habits}
            loading={dataLoading}
            onAddHabit={handleAddHabit}
            onToggleHabit={handleToggleHabit}
            onDeleteHabit={handleDeleteHabit}
          />
        )}

        {activePage === 'trips' && (
          <TripsPage
            mode={mode}
            trips={trips}
            loading={dataLoading}
            onCreateTrip={handleCreateTrip}
            onUpdateTripPacking={handleUpdateTripPacking}
            onDeleteTrip={handleDeleteTrip}
          />
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ShiftErrorBoundary>
      <AuthProvider>
        <ShiftWorkspace />
      </AuthProvider>
    </ShiftErrorBoundary>
  );
}
