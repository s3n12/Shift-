import { useState, type FormEvent } from 'react';
import { Calendar, Check, Plus, Trash2, X } from 'lucide-react';
import {
  TRIP_COVERS,
  daysUntil,
  formatReadableDate,
  getTripCoverSrc,
  type PackingItem,
  type PlannerMode,
  type TripItem,
} from '../types.ts';
import { MediaImage } from '../components/MediaImage.tsx';

interface TripsPageProps {
  mode: PlannerMode;
  trips: TripItem[];
  loading: boolean;
  onCreateTrip: (data: {
    destination: string;
    subtitle?: string;
    travelDate: string;
    coverKey: string;
    packingList: PackingItem[];
  }) => Promise<void>;
  onUpdateTripPacking: (trip: TripItem, nextList: PackingItem[]) => Promise<void>;
  onDeleteTrip: (id: number) => Promise<void>;
}

function defaultFutureDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

export function TripsPage({
  mode,
  trips,
  loading,
  onCreateTrip,
  onUpdateTripPacking,
  onDeleteTrip,
}: TripsPageProps) {
  const isWork = mode === 'work';
  const [showForm, setShowForm] = useState(false);
  const [destination, setDestination] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [travelDate, setTravelDate] = useState(defaultFutureDate);
  const [coverKey, setCoverKey] = useState('kyoto');
  const [initialItemsText, setInitialItemsText] = useState(
    'Passport, Linen shirt, Camera, Travel adapter'
  );
  const [creating, setCreating] = useState(false);

  const [draftPackByTrip, setDraftPackByTrip] = useState<Record<number, string>>({});

  const sortedTrips = [...trips].sort((a, b) =>
    a.travelDate.localeCompare(b.travelDate)
  );
  const nextTrip = sortedTrips[0] || null;
  const nextDays = nextTrip ? Math.max(0, daysUntil(nextTrip.travelDate)) : null;

  const handleCreateTrip = async (e: FormEvent) => {
    e.preventDefault();
    if (!destination.trim() || !travelDate || creating) return;
    setCreating(true);
    try {
      const packingList: PackingItem[] = initialItemsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((label) => ({
          id: crypto.randomUUID(),
          label,
          packed: false,
        }));

      await onCreateTrip({
        destination: destination.trim(),
        subtitle: subtitle.trim() || undefined,
        travelDate,
        coverKey,
        packingList,
      });

      setDestination('');
      setSubtitle('');
      setTravelDate(defaultFutureDate());
      setCoverKey('kyoto');
      setInitialItemsText('Passport, Comfortable shoes, Sunglasses, Charger');
      setShowForm(false);
    } finally {
      setCreating(false);
    }
  };

  const handleToggleItem = async (trip: TripItem, itemId: string) => {
    const nextList = trip.packingList.map((item) =>
      item.id === itemId ? { ...item, packed: !item.packed } : item
    );
    await onUpdateTripPacking(trip, nextList);
  };

  const handleDeleteItem = async (trip: TripItem, itemId: string) => {
    const nextList = trip.packingList.filter((item) => item.id !== itemId);
    await onUpdateTripPacking(trip, nextList);
  };

  const handleAddItem = async (e: FormEvent, trip: TripItem) => {
    e.preventDefault();
    const label = (draftPackByTrip[trip.id] || '').trim();
    if (!label) return;
    const nextList: PackingItem[] = [
      ...trip.packingList,
      { id: crypto.randomUUID(), label, packed: false },
    ];
    setDraftPackByTrip((prev) => ({ ...prev, [trip.id]: '' }));
    await onUpdateTripPacking(trip, nextList);
  };

  return (
    <div className="space-y-8">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p
            className={`text-xs font-medium mb-1 transition-colors duration-300 ${
              isWork ? 'text-[#1E293B]' : 'text-[#D97757]'
            }`}
          >
            Visual Getaway Board
          </p>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-[#1E293B]">
            Upcoming Trips
          </h1>
          <p className="text-sm text-[#64748B] mt-1 tabular-nums">
            {sortedTrips.length} planned{' '}
            {sortedTrips.length === 1 ? 'getaway' : 'getaways'}
            {nextDays !== null && nextTrip && (
              <>
                <span aria-hidden="true" className="mx-2">
                  ·
                </span>
                Next departure to {nextTrip.destination} in {nextDays} days
              </>
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowForm((prev) => !prev)}
          className={`inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full text-white text-sm font-medium active:scale-[0.98] transition-all duration-200 whitespace-nowrap shrink-0 cursor-pointer ${
            isWork
              ? 'bg-[#1E293B] hover:bg-[#0F172A]'
              : 'bg-[#D97757] hover:bg-[#BF6243]'
          }`}
        >
          {showForm ? (
            <>
              <X className="w-4 h-4" />
              <span>Close Form</span>
            </>
          ) : (
            <>
              <Plus className="w-4 h-4" />
              <span>Plan New Trip</span>
            </>
          )}
        </button>
      </div>

      {/* Collapsible New Trip Bento Card */}
      {showForm && (
        <section className="bg-white rounded-[24px] border border-[#E7E1D8] shadow-[0_8px_30px_rgba(30,41,59,0.04)] p-6 sm:p-8">
          <h2 className="font-display text-xl font-semibold text-[#1E293B] mb-5">
            Add an Upcoming Getaway
          </h2>

          <form onSubmit={handleCreateTrip} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="trip-destination"
                  className="block text-xs font-medium text-[#475569] mb-1.5"
                >
                  Destination
                </label>
                <input
                  id="trip-destination"
                  type="text"
                  required
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="Lisbon, Portugal"
                  className="w-full px-4 py-3 rounded-2xl bg-[#FAF8F5] border border-[#E3DBD0] text-sm text-[#1E293B] placeholder:text-[#94A3B8] focus:outline-none focus:bg-white focus:border-[#D97757] transition"
                />
              </div>

              <div>
                <label
                  htmlFor="trip-date"
                  className="block text-xs font-medium text-[#475569] mb-1.5"
                >
                  Departure Date
                </label>
                <input
                  id="trip-date"
                  type="date"
                  required
                  value={travelDate}
                  onChange={(e) => setTravelDate(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl bg-[#FAF8F5] border border-[#E3DBD0] text-sm text-[#1E293B] tabular-nums focus:outline-none focus:bg-white focus:border-[#D97757] transition"
                />
              </div>

              <div>
                <label
                  htmlFor="trip-subtitle"
                  className="block text-xs font-medium text-[#475569] mb-1.5"
                >
                  Trip Note (optional)
                </label>
                <input
                  id="trip-subtitle"
                  type="text"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  placeholder="Coastal trams, tilework & espresso"
                  className="w-full px-4 py-3 rounded-2xl bg-[#FAF8F5] border border-[#E3DBD0] text-sm text-[#1E293B] placeholder:text-[#94A3B8] focus:outline-none focus:bg-white focus:border-[#D97757] transition"
                />
              </div>
            </div>

            {/* Cover Photo Selector */}
            <div>
              <p className="text-xs font-medium text-[#475569] mb-2">
                Choose Board Cover Atmosphere
              </p>
              <div className="grid grid-cols-3 gap-3">
                {Object.entries(TRIP_COVERS).map(([key, cover]) => {
                  const selected = coverKey === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setCoverKey(key)}
                      className={`relative h-24 sm:h-28 rounded-2xl overflow-hidden text-left transition-all cursor-pointer ${
                        selected
                          ? 'ring-2 ring-offset-2 ring-[#D97757]'
                          : 'opacity-80 hover:opacity-100'
                      }`}
                    >
                      <MediaImage
                        src={cover.src}
                        alt={cover.label}
                        fallbackLabel={cover.label}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-transparent" />
                      <span className="absolute bottom-2 left-3 text-xs font-medium text-white">
                        {cover.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label
                htmlFor="trip-packing"
                className="block text-xs font-medium text-[#475569] mb-1.5"
              >
                Starter Packing List (comma-separated)
              </label>
              <input
                id="trip-packing"
                type="text"
                value={initialItemsText}
                onChange={(e) => setInitialItemsText(e.target.value)}
                placeholder="Passport, Camera, Walking shoes, Sunscreen"
                className="w-full px-4 py-3 rounded-2xl bg-[#FAF8F5] border border-[#E3DBD0] text-sm text-[#1E293B] placeholder:text-[#94A3B8] focus:outline-none focus:bg-white focus:border-[#D97757] transition"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-5 py-2.5 rounded-full bg-[#F4F0EA] text-sm font-medium text-[#1E293B] hover:bg-[#E7E0D6] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating || !destination.trim()}
                className={`px-6 py-2.5 rounded-full text-white text-sm font-medium transition-colors disabled:opacity-50 cursor-pointer ${
                  isWork
                    ? 'bg-[#1E293B] hover:bg-[#0F172A]'
                    : 'bg-[#D97757] hover:bg-[#BF6243]'
                }`}
              >
                {creating ? 'Saving...' : 'Save Getaway'}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Visual Getaways Bento Grid */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-96 rounded-[24px] bg-[#EFEAE2] animate-pulse"
            />
          ))}
        </div>
      ) : sortedTrips.length === 0 ? (
        <section className="bg-white rounded-[24px] border border-[#E7E1D8] p-12 text-center">
          <h2 className="font-display text-2xl font-semibold text-[#1E293B]">
            Your travel board is wide open
          </h2>
          <p className="text-sm text-[#64748B] mt-2 mb-6 max-w-md mx-auto">
            Add your next weekend escape or holiday to see a live countdown and organize your packing checklist.
          </p>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="px-6 py-3 rounded-full bg-[#D97757] text-white text-sm font-medium hover:bg-[#BF6243] transition-colors cursor-pointer"
          >
            Plan Your First Trip
          </button>
        </section>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {sortedTrips.map((trip) => {
            const remaining = daysUntil(trip.travelDate);
            const packedCount = trip.packingList.filter((i) => i.packed).length;
            const totalCount = trip.packingList.length;
            const pct =
              totalCount > 0 ? Math.round((packedCount / totalCount) * 100) : 0;

            return (
              <article
                key={trip.id}
                className="bg-white rounded-[24px] border border-[#E7E1D8] shadow-[0_8px_30px_rgba(30,41,59,0.04)] overflow-hidden"
              >
                {/* Cover Photo Header */}
                <div className="relative h-56 sm:h-64 w-full">
                  <MediaImage
                    src={getTripCoverSrc(trip.coverKey)}
                    alt={trip.destination}
                    fallbackLabel={trip.destination}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#1E293B]/85 via-[#1E293B]/20 to-transparent" />

                  <button
                    type="button"
                    onClick={() => onDeleteTrip(trip.id)}
                    aria-label={`Delete trip to ${trip.destination}`}
                    className="absolute top-4 right-4 p-2.5 rounded-full bg-black/35 text-white/90 hover:bg-black/55 backdrop-blur-sm transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" strokeWidth={1.8} />
                  </button>

                  <div className="absolute bottom-5 left-6 right-6 text-white flex items-end justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-xs text-white/85 inline-flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 shrink-0" />
                        <span>{formatReadableDate(trip.travelDate)}</span>
                      </p>
                      <h2 className="font-display text-2xl sm:text-[26px] font-semibold leading-tight mt-1 truncate">
                        {trip.destination}
                      </h2>
                      {trip.subtitle && (
                        <p className="text-xs text-white/80 mt-0.5 line-clamp-1">
                          {trip.subtitle}
                        </p>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      <p className="font-display text-3xl font-semibold leading-none tabular-nums">
                        {remaining >= 0 ? remaining : 0}
                      </p>
                      <p className="text-[11px] text-white/80 mt-1">
                        {remaining === 1 ? 'day away' : 'days away'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Packing Checklist Body */}
                <div className="p-6">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <h3 className="font-display text-base font-semibold text-[#1E293B]">
                      Packing Checklist
                    </h3>
                    <span className="text-xs text-[#64748B] tabular-nums">
                      {packedCount} of {totalCount} packed ({pct}%)
                    </span>
                  </div>

                  <div className="h-1.5 w-full rounded-full bg-[#F1ECE4] overflow-hidden mb-4">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        isWork ? 'bg-[#1E293B]' : 'bg-[#D97757]'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  {trip.packingList.length === 0 ? (
                    <p className="text-sm text-[#848D98] py-4">
                      No packing items yet. Add your essentials below.
                    </p>
                  ) : (
                    <ul className="divide-y divide-[#F3EFE8]">
                      {trip.packingList.map((item) => (
                        <li
                          key={item.id}
                          className="group py-2.5 flex items-center justify-between gap-3"
                        >
                          <button
                            type="button"
                            onClick={() => handleToggleItem(trip, item.id)}
                            className="flex items-center gap-3 min-w-0 text-left flex-1 cursor-pointer"
                          >
                            <span
                              className={`w-5 h-5 rounded-full flex items-center justify-center border transition-colors shrink-0 ${
                                item.packed
                                  ? isWork
                                    ? 'bg-[#1E293B] border-[#1E293B] text-white'
                                    : 'bg-[#4A6B5D] border-[#4A6B5D] text-white'
                                  : 'bg-white border-[#CBD5E1] group-hover:border-[#4A6B5D]'
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
                            onClick={() => handleDeleteItem(trip, item.id)}
                            aria-label={`Remove "${item.label}"`}
                            className="p-1.5 rounded-full text-[#94A3B8] hover:text-[#B91C1C] opacity-70 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  <form
                    onSubmit={(e) => handleAddItem(e, trip)}
                    className="mt-4 pt-4 border-t border-[#EFEAE2] flex gap-2"
                  >
                    <input
                      type="text"
                      value={draftPackByTrip[trip.id] || ''}
                      onChange={(e) =>
                        setDraftPackByTrip((prev) => ({
                          ...prev,
                          [trip.id]: e.target.value,
                        }))
                      }
                      placeholder="Add packing item..."
                      className="flex-1 px-4 py-2.5 rounded-full bg-[#FAF8F5] border border-[#E3DBD0] text-sm text-[#1E293B] placeholder:text-[#94A3B8] focus:outline-none focus:bg-white focus:border-[#D97757] transition"
                    />
                    <button
                      type="submit"
                      disabled={!(draftPackByTrip[trip.id] || '').trim()}
                      className={`px-5 py-2.5 rounded-full text-white text-sm font-medium transition-colors disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer ${
                        isWork
                          ? 'bg-[#1E293B] hover:bg-[#0F172A]'
                          : 'bg-[#D97757] hover:bg-[#BF6243]'
                      }`}
                    >
                      Add
                    </button>
                  </form>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
