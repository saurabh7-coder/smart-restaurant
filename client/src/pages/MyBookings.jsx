import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import {
  Alert,
  ConfirmDialog,
  EmptyState,
  Field,
  Modal,
  Spinner,
  StatusBadge,
} from '../components/ui.jsx';
import { addDays, formatDate, formatTime, toDateInput } from '../utils/format.js';

export default function MyBookings() {
  const toast = useToast();

  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [cancelTarget, setCancelTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api
      .getMyReservations()
      .then((res) => setReservations(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    document.title = 'My bookings — Delicious Adda';
    load();
  }, [load]);

  async function confirmCancel() {
    setBusy(true);
    try {
      await api.cancelReservation(cancelTarget._id);
      toast.success(`Booking ${cancelTarget.reservationId} cancelled.`);
      setCancelTarget(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  const now = Date.now();
  const upcoming = reservations.filter(
    (r) => new Date(r.slotStart).getTime() >= now && ['pending', 'confirmed'].includes(r.status),
  );
  const past = reservations.filter((r) => !upcoming.includes(r));

  if (loading) return <Spinner />;

  return (
    <div className="container page">
      <div className="page-head">
        <div>
          <h1>My bookings</h1>
          <p>Change or cancel any upcoming reservation yourself.</p>
        </div>
        <Link to="/reservation" className="btn">
          New reservation
        </Link>
      </div>

      <Alert kind="error">{error}</Alert>

      <h2>Upcoming</h2>
      {upcoming.length === 0 ? (
        <EmptyState
          emoji="📅"
          title="No upcoming reservations"
          action={
            <Link to="/reservation" className="btn">
              Reserve a table
            </Link>
          }
        >
          Book a table and it will appear here.
        </EmptyState>
      ) : (
        <div className="grid">
          {upcoming.map((r) => (
            <BookingCard
              key={r._id}
              reservation={r}
              onEdit={() => setEditTarget(r)}
              onCancel={() => setCancelTarget(r)}
            />
          ))}
        </div>
      )}

      {past.length > 0 && (
        <>
          <h2 style={{ marginTop: '2.5rem' }}>Previous</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Booking ID</th>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Guests</th>
                  <th>Table</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {past.map((r) => (
                  <tr key={r._id}>
                    <td className="nowrap">
                      <code>{r.reservationId}</code>
                    </td>
                    <td className="nowrap">{formatDate(r.slotStart)}</td>
                    <td className="nowrap">{formatTime(r.slotStart)}</td>
                    <td>{r.guests}</td>
                    <td>{r.table?.tableNumber || '—'}</td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {cancelTarget && (
        <ConfirmDialog
          title="Cancel this reservation?"
          message={`Booking ${cancelTarget.reservationId} for ${cancelTarget.guests} guests on ${formatDate(cancelTarget.slotStart)} will be cancelled and the table released.`}
          confirmLabel="Cancel booking"
          danger
          busy={busy}
          onCancel={() => setCancelTarget(null)}
          onConfirm={confirmCancel}
        />
      )}

      {editTarget && (
        <EditBookingModal
          reservation={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function BookingCard({ reservation, onEdit, onCancel }) {
  return (
    <article className="card">
      <div className="card-head">
        <code>{reservation.reservationId}</code>
        <div className="spacer" />
        <StatusBadge status={reservation.status} />
      </div>
      <div className="card-body stack-sm">
        <div className="row">
          <span style={{ fontSize: '1.5rem' }}>🍽️</span>
          <div>
            <strong>{formatDate(reservation.slotStart)}</strong>
            <div className="muted">
              {formatTime(reservation.slotStart)} – {formatTime(reservation.slotEnd)}
            </div>
          </div>
        </div>

        <div className="chip-row">
          <span className="badge">
            👥 {reservation.guests} {reservation.guests === 1 ? 'guest' : 'guests'}
          </span>
          <span className="badge">🪑 Table {reservation.table?.tableNumber}</span>
          <span className="badge">{reservation.table?.location}</span>
        </div>

        {reservation.specialRequest && (
          <p className="muted" style={{ margin: 0 }}>
            <strong>Note:</strong> {reservation.specialRequest}
          </p>
        )}

        {reservation.status === 'pending' && (
          <p className="faint" style={{ margin: 0 }}>
            Awaiting confirmation from the restaurant.
          </p>
        )}

        <div className="row" style={{ marginTop: '0.5rem' }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onEdit}>
            Modify
          </button>
          <button type="button" className="btn btn-danger btn-sm" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </article>
  );
}

function EditBookingModal({ reservation, onClose, onSaved }) {
  const toast = useToast();

  const [date, setDate] = useState(toDateInput(reservation.slotStart));
  const [guests, setGuests] = useState(reservation.guests);
  const [time, setTime] = useState('');
  const [tableId, setTableId] = useState('');
  const [specialRequest, setSpecialRequest] = useState(reservation.specialRequest || '');

  const [slots, setSlots] = useState([]);
  const [tables, setTables] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Reload the slot grid whenever the date or party size changes.
  useEffect(() => {
    let cancelled = false;
    api
      .getAvailability({ date, guests })
      .then((res) => !cancelled && setSlots(res.data.slots))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [date, guests]);

  useEffect(() => {
    if (!time) return undefined;
    let cancelled = false;
    api
      .getAvailability({ date, time, guests })
      .then((res) => !cancelled && setTables(res.data.tables))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [date, time, guests]);

  async function save() {
    setError('');
    setBusy(true);
    try {
      await api.updateReservation(reservation._id, {
        date,
        time: time || undefined,
        guests: Number(guests),
        table: tableId || undefined,
        specialRequest,
      });
      toast.success('Reservation updated.');
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`Modify ${reservation.reservationId}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Close
          </button>
          <button type="button" className="btn" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </>
      }
    >
      <Alert kind="error">{error}</Alert>

      <div className="grid-2">
        <Field label="Date" id="e-date">
          <input
            id="e-date"
            type="date"
            value={date}
            min={toDateInput()}
            max={addDays(60)}
            onChange={(e) => {
              setDate(e.target.value);
              setTime('');
              setTableId('');
            }}
          />
        </Field>
        <Field label="Guests" id="e-guests">
          <select
            id="e-guests"
            value={guests}
            onChange={(e) => {
              setGuests(Number(e.target.value));
              setTableId('');
            }}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Seating time" hint="Leave unselected to keep your current time.">
        <div className="slot-grid">
          {slots.map((slot) => (
            <button
              key={slot.time}
              type="button"
              className="slot"
              aria-pressed={time === slot.time}
              disabled={!slot.isBookable}
              onClick={() => {
                setTime(slot.time);
                setTableId('');
              }}
            >
              <strong>{slot.label}</strong>
              <small>{slot.isPast ? 'Passed' : `${slot.availableTables} free`}</small>
            </button>
          ))}
        </div>
      </Field>

      {time && tables.length > 0 && (
        <Field label="Table" hint="Leave unselected to keep your current table if it is free.">
          <div className="table-grid">
            {tables.map((t) => (
              <button
                key={t.id}
                type="button"
                className="table-tile"
                aria-pressed={tableId === t.id}
                disabled={!t.isAvailable}
                onClick={() => setTableId(t.id)}
              >
                <strong>{t.tableNumber}</strong>
                <small>
                  {t.capacity} seats · {t.location}
                </small>
              </button>
            ))}
          </div>
        </Field>
      )}

      <Field label="Special request" id="e-note">
        <textarea
          id="e-note"
          maxLength={500}
          value={specialRequest}
          onChange={(e) => setSpecialRequest(e.target.value)}
        />
      </Field>
    </Modal>
  );
}
