import { useCallback, useEffect, useState, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useRestaurant } from '../context/RestaurantContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Alert, Field, Spinner } from '../components/ui.jsx';
import { addDays, formatDate, toDateInput } from '../utils/format.js';

const STEPS = ['Date & guests', 'Seating time', 'Table', 'Your details'];

export default function Reservation() {
  const { user } = useAuth();
  const { restaurant } = useRestaurant();
  const toast = useToast();
  const navigate = useNavigate();

  /*
   * The home page hands over a party size and a slot, so arriving here from the
   * hero lands on a form that is already filled in rather than one that throws
   * the choice away and asks again.
   */
  const [params] = useSearchParams();
  const [date, setDate] = useState(params.get('date') || addDays(1));
  const [guests, setGuests] = useState(Number(params.get('guests')) || 2);
  const [time, setTime] = useState(params.get('time') || '');

  /*
   * A time handed over in the URL has to survive the first availability load,
   * which clears the selection on purpose — the guest may have changed date or
   * party size, and a stale time would be a booking for a slot they never
   * chose. This re-applies it once, and only if it is genuinely still bookable.
   */
  const handedOverTime = useRef(params.get('time') || '');
  const [tableId, setTableId] = useState('');
  const [preferredLocation, setPreferredLocation] = useState('');

  const [availability, setAvailability] = useState(null);
  const [tables, setTables] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [loadingTables, setLoadingTables] = useState(false);

  const [form, setForm] = useState({ name: '', phone: '', email: '', specialRequest: '', offerCode: '' });
  const [offerStatus, setOfferStatus] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [booking, setBooking] = useState(null);

  const maxDate = addDays(restaurant?.booking?.maxBookingDaysAhead ?? 60);

  useEffect(() => {
    document.title = 'Reserve a table — Delicious Adda';
  }, []);

  // Prefill contact details from the signed-in account.
  useEffect(() => {
    if (user) {
      setForm((f) => ({
        ...f,
        name: f.name || user.name,
        phone: f.phone || user.phone,
        email: f.email || user.email,
      }));
    }
  }, [user]);

  /* ---- step 1 → 2 : load the slot grid for this date + party size ---- */
  const loadSlots = useCallback(async () => {
    setLoadingSlots(true);
    setError('');
    setTime('');
    setTableId('');
    setTables([]);
    try {
      const res = await api.getAvailability({ date, guests });
      setAvailability(res.data);

      if (handedOverTime.current) {
        const stillFree = res.data.slots.find(
          (s) => s.time === handedOverTime.current && s.isBookable,
        );
        if (stillFree) setTime(stillFree.time);
        handedOverTime.current = '';   // one-shot: never re-apply on a later change
      }
    } catch (err) {
      setError(err.message);
      setAvailability(null);
    } finally {
      setLoadingSlots(false);
    }
  }, [date, guests]);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  /* ---- step 2 → 3 : load per-table availability for the chosen slot ---- */
  async function chooseTime(slotTime) {
    setTime(slotTime);
    setTableId('');
    setLoadingTables(true);
    setError('');
    try {
      const res = await api.getAvailability({ date, time: slotTime, guests });
      setTables(res.data.tables);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingTables(false);
    }
  }

  async function checkOffer() {
    if (!form.offerCode.trim()) {
      setOfferStatus(null);
      return;
    }
    try {
      const res = await api.validateOffer(form.offerCode.trim(), guests);
      setOfferStatus({ ok: true, message: `${res.data.code} — ${res.data.description}` });
    } catch (err) {
      setOfferStatus({ ok: false, message: err.message });
    }
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    setFieldErrors({});
    setSubmitting(true);

    try {
      const res = await api.createReservation({
        date,
        time,
        guests: Number(guests),
        table: tableId || undefined,
        preferredLocation: tableId ? undefined : preferredLocation || undefined,
        name: form.name,
        phone: form.phone,
        email: form.email,
        specialRequest: form.specialRequest,
        offerCode: form.offerCode.trim() || undefined,
      });
      setBooking(res.data);
      toast.success(`Booking ${res.data.reservationId} created.`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err.message);
      setFieldErrors(err.details || {});
      // A 409 means someone else took the slot mid-flow, so refresh what's left.
      if (err.status === 409 && time) chooseTime(time);
    } finally {
      setSubmitting(false);
    }
  }

  /* ---------------- confirmation ---------------- */
  if (booking) {
    return (
      <div className="container page">
        <div className="confirmation">
          <div style={{ fontSize: '3rem' }}>🎉</div>
          <h1>Booking confirmed</h1>
          <p className="muted">We have sent the details to {booking.contact.email}.</p>
          <div className="booking-id">{booking.reservationId}</div>

          <dl>
            <dt>Table</dt>
            <dd>
              {booking.table.tableNumber} ({booking.table.location}, seats {booking.table.capacity})
            </dd>
            <dt>Date</dt>
            <dd>{formatDate(booking.slotStart)}</dd>
            <dt>Seating</dt>
            <dd>
              {new Date(booking.slotStart).toLocaleTimeString(undefined, {
                hour: 'numeric',
                minute: '2-digit',
              })}
              {' – '}
              {new Date(booking.slotEnd).toLocaleTimeString(undefined, {
                hour: 'numeric',
                minute: '2-digit',
              })}
            </dd>
            <dt>Guests</dt>
            <dd>{booking.guests}</dd>
            <dt>Status</dt>
            <dd>Awaiting restaurant confirmation</dd>
          </dl>
        </div>

        <div className="row-end" style={{ marginTop: '1.5rem' }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setBooking(null);
              loadSlots();
            }}
          >
            Book another table
          </button>
          <button type="button" className="btn" onClick={() => navigate('/my-bookings')}>
            View my bookings
          </button>
        </div>
      </div>
    );
  }

  const step = !time ? 1 : !tables.length && loadingTables ? 2 : tableId || tables.length ? 3 : 2;

  return (
    <div className="container page">
      <div className="page-head">
        <div>
          <h1>Reserve a table</h1>
          <p>
            Seatings last {restaurant?.booking?.slotMinutes ?? 90} minutes. Pick a time, choose your
            table, and you are done.
          </p>
        </div>
      </div>

      <div className="steps">
        {STEPS.map((label, i) => (
          <span
            key={label}
            className="step"
            data-state={step > i + 1 ? 'done' : step === i + 1 ? 'active' : 'todo'}
          >
            {step > i + 1 ? '✓' : i + 1} {label}
          </span>
        ))}
      </div>

      <Alert kind="error">{error}</Alert>

      {/* ---------- step 1 ---------- */}
      <section className="panel">
        <h3>1 · When are you coming?</h3>
        <div className="grid-2">
          <Field label="Date" id="date">
            <input
              id="date"
              type="date"
              value={date}
              min={toDateInput()}
              max={maxDate}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label="Guests" id="guests" hint="Larger parties? Call us and we will arrange it.">
            <select id="guests" value={guests} onChange={(e) => setGuests(Number(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? 'guest' : 'guests'}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      {/* ---------- step 2 ---------- */}
      <section className="panel" style={{ marginTop: '1rem' }}>
        <h3>2 · Choose a seating time</h3>
        {loadingSlots ? (
          <Spinner />
        ) : !availability ? (
          <p className="muted">Pick a date to see what is free.</p>
        ) : availability.message ? (
          <Alert kind="warn">{availability.message}</Alert>
        ) : (
          <>
            <div className="slot-grid">
              {availability.slots.map((slot) => (
                <button
                  key={slot.time}
                  type="button"
                  className="slot"
                  aria-pressed={time === slot.time}
                  disabled={!slot.isBookable}
                  onClick={() => chooseTime(slot.time)}
                  title={
                    slot.isPast
                      ? 'This seating has already started'
                      : slot.availableTables === 0
                        ? 'Fully booked'
                        : `${slot.availableTables} table(s) free`
                  }
                >
                  <strong>{slot.label}</strong>
                  <small>
                    {slot.isPast
                      ? 'Passed'
                      : slot.availableTables === 0
                        ? 'Full'
                        : `${slot.availableTables} free`}
                  </small>
                </button>
              ))}
            </div>
            <p className="faint" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
              Availability shown for {guests} {guests === 1 ? 'guest' : 'guests'} on{' '}
              {formatDate(date)}.
            </p>
          </>
        )}
      </section>

      {/* ---------- step 3 ---------- */}
      {time && (
        <section className="panel" style={{ marginTop: '1rem' }}>
          <h3>3 · Pick your table</h3>
          {loadingTables ? (
            <Spinner />
          ) : (
            <>
              <div className="table-grid">
                <button
                  type="button"
                  className="table-tile"
                  aria-pressed={tableId === ''}
                  onClick={() => setTableId('')}
                >
                  <strong>Any</strong>
                  <small>Best fit for {guests}</small>
                </button>

                {tables.map((table) => (
                  <button
                    key={table.id}
                    type="button"
                    className="table-tile"
                    aria-pressed={tableId === table.id}
                    disabled={!table.isAvailable}
                    onClick={() => setTableId(table.id)}
                  >
                    <strong>{table.tableNumber}</strong>
                    <small>
                      {table.capacity} seats · {table.location}
                    </small>
                    <span className="dot">{table.isAvailable ? '🟢' : '🔴'}</span>
                  </button>
                ))}
              </div>
              <div className="field" style={{ marginTop: '1rem' }}>
                <label htmlFor="pref">Seating preference (optional)</label>
                <div className="chip-row">
                  {['', 'window', 'outdoor', 'indoor', 'rooftop', 'private'].map((loc) => (
                    <button
                      key={loc || 'any'}
                      type="button"
                      className={`btn btn-sm ${preferredLocation === loc ? '' : 'btn-ghost'}`}
                      onClick={() => setPreferredLocation(loc)}
                      disabled={Boolean(tableId)}
                    >
                      {loc === '' ? 'No preference' : loc}
                    </button>
                  ))}
                </div>
              </div>

              <p className="faint" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
                🟢 free · 🔴 already booked for this seating. Choosing “Any” lets us allocate the
                best fit — we favour the smallest suitable table so larger ones stay free for larger
                parties, and honour your seating preference where we can.
              </p>
            </>
          )}
        </section>
      )}

      {/* ---------- step 4 ---------- */}
      {time && (
        <section className="panel" style={{ marginTop: '1rem' }}>
          <h3>4 · Your details</h3>

          {!user ? (
            <Alert kind="info">
              Please <Link to="/login" state={{ from: '/reservation' }}>log in</Link> or{' '}
              <Link to="/register">create an account</Link> to complete your booking — that is how
              you can change or cancel it later.
            </Alert>
          ) : (
            <form onSubmit={submit}>
              <div className="grid-2">
                <Field label="Name" id="name" error={fieldErrors.name}>
                  <input
                    id="name"
                    value={form.name}
                    required
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </Field>
                <Field label="Phone" id="phone" error={fieldErrors.phone}>
                  <input
                    id="phone"
                    value={form.phone}
                    required
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </Field>
              </div>

              <Field label="Email" id="email" error={fieldErrors.email}>
                <input
                  id="email"
                  type="email"
                  value={form.email}
                  required
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </Field>

              <Field
                label="Special request (optional)"
                id="specialRequest"
                hint="Birthday, wheelchair access, seating preference…"
              >
                <textarea
                  id="specialRequest"
                  maxLength={500}
                  value={form.specialRequest}
                  onChange={(e) => setForm({ ...form, specialRequest: e.target.value })}
                />
              </Field>

              <Field label="Promo code (optional)" id="offerCode" error={fieldErrors.offerCode}>
                <div className="row">
                  <input
                    id="offerCode"
                    value={form.offerCode}
                    placeholder="WELCOME10"
                    style={{ flex: 1 }}
                    onChange={(e) => {
                      setForm({ ...form, offerCode: e.target.value.toUpperCase() });
                      setOfferStatus(null);
                    }}
                  />
                  <button type="button" className="btn btn-ghost" onClick={checkOffer}>
                    Check
                  </button>
                </div>
              </Field>
              {offerStatus && (
                <Alert kind={offerStatus.ok ? 'ok' : 'error'}>{offerStatus.message}</Alert>
              )}

              <div className="alert alert-info">
                <strong>Summary:</strong> {guests} {guests === 1 ? 'guest' : 'guests'} on{' '}
                {formatDate(date)} at{' '}
                {availability?.slots.find((s) => s.time === time)?.label || time}
                {tableId
                  ? `, table ${tables.find((t) => t.id === tableId)?.tableNumber}`
                  : ', table assigned automatically'}
                .
              </div>

              <button type="submit" className="btn btn-lg btn-block" disabled={submitting}>
                {submitting ? 'Reserving…' : 'Confirm reservation'}
              </button>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
