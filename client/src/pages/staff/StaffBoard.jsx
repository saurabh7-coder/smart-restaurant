import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { useToast } from '../../context/ToastContext.jsx';
import { Alert, EmptyState, Field, Spinner, StatusBadge } from '../../components/ui.jsx';
import { formatTime, toDateInput } from '../../utils/format.js';

const NEXT_ACTION = {
  pending: [['confirmed', 'Confirm']],
  confirmed: [
    ['arrived', 'Guest arrived'],
    ['no_show', 'No-show'],
  ],
  arrived: [['completed', 'Table cleared']],
};

const TABLE_STATUSES = ['available', 'occupied', 'reserved', 'maintenance'];

export default function StaffBoard() {
  const toast = useToast();

  const [date, setDate] = useState(toDateInput());
  const [reservations, setReservations] = useState([]);
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([api.getTodayBoard({ date }), api.getTables()])
      .then(([board, tableList]) => {
        setReservations(board.data.reservations);
        setTables(tableList.data);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [date]);

  useEffect(() => {
    document.title = 'Service board — Staff';
    load();
  }, [load]);

  async function advance(reservation, status) {
    try {
      await api.setReservationStatus(reservation._id, status);
      toast.success(`${reservation.contact.name} → ${status.replace('_', ' ')}.`);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function setTableStatus(table, status) {
    try {
      await api.setTableStatus(table._id, status);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  // Group the day's bookings by seating time so the board reads like a service sheet.
  const bySlot = reservations.reduce((groups, r) => {
    const key = formatTime(r.slotStart);
    (groups[key] ||= []).push(r);
    return groups;
  }, {});

  if (loading) return <Spinner />;

  return (
    <div className="container page">
      <div className="page-head">
        <div>
          <h1>Service board</h1>
          <p>{reservations.length} bookings · {reservations.reduce((n, r) => n + r.guests, 0)} guests expected</p>
        </div>
        <Field label="Date" id="sb-date">
          <input id="sb-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>

      <Alert kind="error">{error}</Alert>

      {reservations.length === 0 ? (
        <EmptyState emoji="🍽️" title="No bookings for this date">
          Enjoy the quiet.
        </EmptyState>
      ) : (
        Object.entries(bySlot).map(([time, group]) => (
          <section key={time} style={{ marginBottom: '1.5rem' }}>
            <div className="row" style={{ marginBottom: '0.5rem' }}>
              <h2 style={{ margin: 0 }}>{time}</h2>
              <span className="badge">{group.length} tables</span>
              <span className="badge">{group.reduce((n, r) => n + r.guests, 0)} guests</span>
            </div>

            <div className="grid">
              {group.map((r) => (
                <article key={r._id} className="card">
                  <div className="card-head">
                    <strong>Table {r.table?.tableNumber}</strong>
                    <div className="spacer" />
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="card-body stack-sm">
                    <div>
                      <strong>{r.contact.name}</strong>
                      <div className="faint">{r.contact.phone}</div>
                    </div>
                    <div className="chip-row">
                      <span className="badge">👥 {r.guests}</span>
                      <span className="badge">{r.table?.location}</span>
                      <code className="badge">{r.reservationId}</code>
                    </div>
                    {r.specialRequest && (
                      <div className="alert alert-warn" style={{ margin: 0 }}>
                        📝 {r.specialRequest}
                      </div>
                    )}
                    <div className="row">
                      {(NEXT_ACTION[r.status] || []).map(([status, label]) => (
                        <button
                          key={status}
                          type="button"
                          className={`btn btn-sm ${status === 'no_show' ? 'btn-danger' : ''}`}
                          onClick={() => advance(r, status)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))
      )}

      <section style={{ marginTop: '2rem' }}>
        <h2>Floor status</h2>
        <p className="muted">Update the live state of each table as service runs.</p>
        <div className="grid">
          {tables.map((t) => (
            <div key={t._id} className="panel">
              <div className="row">
                <strong style={{ fontSize: '1.1rem' }}>{t.tableNumber}</strong>
                <span className="faint">{t.capacity} seats · {t.location}</span>
                <div className="spacer" />
                <StatusBadge status={t.status} />
              </div>
              <div className="chip-row" style={{ marginTop: '0.6rem' }}>
                {TABLE_STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`btn btn-sm ${t.status === s ? '' : 'btn-ghost'}`}
                    onClick={() => setTableStatus(t, s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
