import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useRestaurant } from '../context/RestaurantContext.jsx';
import { formatClock } from '../utils/format.js';

/** Local YYYY-MM-DD — never toISOString(), which shifts the date across UTC. */
const isoDate = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const minutesNow = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + (m || 0);
};

const GUEST_OPTIONS = [2, 3, 4, 6];

/**
 * The hero's invitation: the headline, and the fastest possible route to a table.
 *
 * ── What changed and why ─────────────────────────────────────────────────────
 * The badge used to read "Now taking online reservations" — a claim, always the
 * same, true whether or not a single table was free. It asked the guest to take
 * it on faith and then go and find out for themselves on another page.
 *
 * It now states what is actually true this minute: whether the kitchen is open,
 * and when the next table for their party is free. Underneath, the real times
 * are offered as buttons, so choosing a party size and a slot happens here and
 * the reservation page opens already filled in. The headline stopped being a
 * poster and became the first step of the booking.
 */
export function HeroInvite() {
  const { restaurant } = useRestaurant();
  const navigate = useNavigate();

  const [guests, setGuests] = useState(2);
  const [slots, setSlots] = useState(null);   // null = still loading
  const [forDate, setForDate] = useState(isoDate(0));

  /*
   * Ask for today; if nothing is left this evening, ask again for tomorrow.
   * A guest looking at "no times available" with no next step would simply
   * leave, so there is always something bookable on offer.
   */
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const today = await api.getAvailability({ date: isoDate(0), guests });
        if (cancelled) return;

        const open = today.data.slots.filter((s) => s.isBookable);
        if (open.length > 0) {
          setForDate(isoDate(0));
          setSlots(open);
          return;
        }

        const tomorrow = await api.getAvailability({ date: isoDate(1), guests });
        if (cancelled) return;
        setForDate(isoDate(1));
        setSlots(tomorrow.data.slots.filter((s) => s.isBookable));
      } catch {
        if (!cancelled) setSlots([]);   // the hero still renders without this
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [guests]);

  /** Open now, by the clock, against the restaurant's own hours. */
  const openNow = useMemo(() => {
    if (!restaurant?.openTime || !restaurant?.closeTime) return null;
    const now = minutesNow();
    return now >= toMinutes(restaurant.openTime) && now < toMinutes(restaurant.closeTime);
  }, [restaurant]);

  const isToday = forDate === isoDate(0);
  const next = slots?.[0];

  let status;
  if (slots === null) status = 'Checking tonight’s tables…';
  else if (openNow === null) status = 'Book a table online';
  else if (openNow && next && isToday) status = `Open now · next table ${next.label}`;
  else if (openNow) status = `Open now · fully booked tonight`;
  else if (next) status = `Closed · opens ${formatClock(restaurant.openTime)}${isToday ? '' : ', booking tomorrow'}`;
  else status = `Closed · opens ${formatClock(restaurant.openTime)}`;

  const book = (slot) =>
    navigate(`/reservation?date=${forDate}&time=${slot.time}&guests=${guests}`);

  return (
    <div className="hero-invite">
      <Link to="/reservation" className="hero-status" data-open={openNow === true}>
        <span className="dot" aria-hidden="true" />
        {status}
      </Link>

      <h1>{restaurant?.tagline || 'Where every meal is a gathering'}</h1>

      <p className="lede">
        {restaurant?.description ||
          'Browse the full menu, order food, and book your table in under a minute.'}
      </p>

      {/* The booking itself, inline. */}
      <div className="hero-book">
        <div className="hero-book-row">
          <span className="hero-book-label">Table for</span>
          <div className="guest-pills" role="group" aria-label="Number of guests">
            {GUEST_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={guests === n}
                className={guests === n ? 'is-active' : ''}
                onClick={() => setGuests(n)}
              >
                {n}
              </button>
            ))}
            <Link to="/reservation" className="more" title="Larger party">
              {GUEST_OPTIONS[GUEST_OPTIONS.length - 1]}+
            </Link>
          </div>
        </div>

        <div className="hero-book-row">
          <span className="hero-book-label">
            {slots === null ? 'Looking…' : isToday ? 'Today' : 'Tomorrow'}
          </span>

          {slots === null ? (
            <div className="slot-pills is-loading" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          ) : slots.length === 0 ? (
            <Link to="/reservation" className="btn btn-sm btn-ghost">
              See other days
            </Link>
          ) : (
            <div className="slot-pills">
              {slots.slice(0, 3).map((slot) => (
                <button
                  key={slot.time}
                  type="button"
                  onClick={() => book(slot)}
                  title={`${slot.availableTables} of ${slot.totalTables} tables free`}
                >
                  {slot.label}
                </button>
              ))}
              <Link to="/reservation" className="more">
                More
              </Link>
            </div>
          )}
        </div>
      </div>

      <div className="hero-actions">
        <Link to="/menu" className="btn btn-lg">
          View menu
        </Link>
        <Link to="/meal-planner" className="btn btn-lg btn-ghost">
          Plan a meal
        </Link>
      </div>
    </div>
  );
}
