import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { useToast } from '../../context/ToastContext.jsx';
import {
  Alert,
  EmptyState,
  Field,
  Modal,
  Pagination,
  Spinner,
  StatusBadge,
} from '../../components/ui.jsx';
import { formatDate, formatTime, toDateInput } from '../../utils/format.js';

/** Which actions each status allows, mirroring the server's transition rules. */
const ACTIONS = {
  pending: [
    ['confirmed', 'Confirm', ''],
    ['cancelled', 'Reject', 'btn-danger'],
  ],
  confirmed: [
    ['arrived', 'Mark arrived', ''],
    ['no_show', 'No-show', 'btn-danger'],
    ['cancelled', 'Cancel', 'btn-danger'],
  ],
  arrived: [['completed', 'Complete', '']],
  completed: [],
  cancelled: [],
  no_show: [],
};

const STATUS_FILTERS = [
  ['', 'All statuses'],
  ['pending', 'Pending'],
  ['confirmed', 'Confirmed'],
  ['arrived', 'Arrived'],
  ['completed', 'Completed'],
  ['cancelled', 'Cancelled'],
  ['no_show', 'No-show'],
];

export default function ReservationManage() {
  const toast = useToast();

  const [reservations, setReservations] = useState([]);
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0 });
  const [filters, setFilters] = useState({ date: '', status: '', q: '' });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [moving, setMoving] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api
      .listReservations({ ...filters, page, limit: 25 })
      .then((res) => {
        setReservations(res.data);
        setMeta(res.meta);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [filters, page]);

  useEffect(() => {
    document.title = 'Reservations — Admin';
  }, []);

  useEffect(load, [load]);

  async function act(reservation, status) {
    try {
      await api.setReservationStatus(reservation._id, status);
      toast.success(`${reservation.reservationId} → ${status}.`);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Reservations</h1>
          <p>{meta.total} matching bookings</p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => setFilters({ date: toDateInput(), status: '', q: '' })}>
          Today only
        </button>
      </div>

      <Alert kind="error">{error}</Alert>

      <div className="filter-bar">
        <Field label="Date" id="f-date">
          <input
            id="f-date"
            type="date"
            value={filters.date}
            onChange={(e) => {
              setPage(1);
              setFilters({ ...filters, date: e.target.value });
            }}
          />
        </Field>
        <Field label="Status" id="f-status">
          <select
            id="f-status"
            value={filters.status}
            onChange={(e) => {
              setPage(1);
              setFilters({ ...filters, status: e.target.value });
            }}
          >
            {STATUS_FILTERS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Search" id="f-q" hint="Booking ID, name or phone">
          <input
            id="f-q"
            type="search"
            value={filters.q}
            onChange={(e) => {
              setPage(1);
              setFilters({ ...filters, q: e.target.value });
            }}
          />
        </Field>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setFilters({ date: '', status: '', q: '' })}
          >
            Clear
          </button>
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : reservations.length === 0 ? (
        <EmptyState emoji="📅" title="No reservations match those filters" />
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Booking</th>
                  <th>Customer</th>
                  <th>When</th>
                  <th>Party</th>
                  <th>Table</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {reservations.map((r) => (
                  <tr key={r._id}>
                    <td className="nowrap">
                      <code>{r.reservationId}</code>
                      {r.offerCode && (
                        <div>
                          <span className="badge badge-brand">{r.offerCode}</span>
                        </div>
                      )}
                    </td>
                    <td>
                      <strong>{r.contact.name}</strong>
                      <div className="faint">{r.contact.phone}</div>
                      {r.specialRequest && (
                        <div className="faint" title={r.specialRequest}>
                          📝 {r.specialRequest.slice(0, 40)}
                          {r.specialRequest.length > 40 ? '…' : ''}
                        </div>
                      )}
                    </td>
                    <td className="nowrap">
                      {formatDate(r.slotStart)}
                      <div className="faint">
                        {formatTime(r.slotStart)} – {formatTime(r.slotEnd)}
                      </div>
                    </td>
                    <td>{r.guests}</td>
                    <td className="nowrap">
                      {r.table?.tableNumber}
                      <div className="faint">{r.table?.location}</div>
                    </td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="nowrap">
                      {(ACTIONS[r.status] || []).map(([status, label, cls]) => (
                        <button
                          key={status}
                          type="button"
                          className={`btn btn-sm ${cls || 'btn-ghost'}`}
                          onClick={() => act(r, status)}
                        >
                          {label}
                        </button>
                      ))}
                      {['pending', 'confirmed'].includes(r.status) && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setMoving(r)}
                        >
                          Move
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={meta.page} pages={meta.pages} onChange={setPage} />
        </>
      )}

      {moving && (
        <MoveModal
          reservation={moving}
          onClose={() => setMoving(null)}
          onSaved={() => {
            setMoving(null);
            load();
          }}
        />
      )}
    </>
  );
}

function MoveModal({ reservation, onClose, onSaved }) {
  const toast = useToast();

  const [date, setDate] = useState(toDateInput(reservation.slotStart));
  const [time, setTime] = useState('');
  const [tableId, setTableId] = useState('');
  const [slots, setSlots] = useState([]);
  const [tables, setTables] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .getAvailability({ date, guests: reservation.guests })
      .then((res) => setSlots(res.data.slots))
      .catch((err) => setError(err.message));
  }, [date, reservation.guests]);

  useEffect(() => {
    if (!time) return;
    api
      .getAvailability({ date, time, guests: reservation.guests })
      .then((res) => setTables(res.data.tables))
      .catch((err) => setError(err.message));
  }, [date, time, reservation.guests]);

  async function save() {
    setError('');
    setBusy(true);
    try {
      await api.updateReservation(reservation._id, {
        date,
        time: time || undefined,
        table: tableId || undefined,
      });
      toast.success('Reservation moved.');
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`Move ${reservation.reservationId}`}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Move booking'}
          </button>
        </>
      }
    >
      <Alert kind="error">{error}</Alert>
      <p className="muted">
        {reservation.contact.name} · {reservation.guests} guests · currently table{' '}
        {reservation.table?.tableNumber} on {formatDate(reservation.slotStart)} at{' '}
        {formatTime(reservation.slotStart)}
      </p>

      <Field label="New date" id="mv-date">
        <input
          id="mv-date"
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setTime('');
            setTableId('');
          }}
        />
      </Field>

      <Field label="New seating time">
        <div className="slot-grid">
          {slots.map((s) => (
            <button
              key={s.time}
              type="button"
              className="slot"
              aria-pressed={time === s.time}
              disabled={!s.isBookable}
              onClick={() => {
                setTime(s.time);
                setTableId('');
              }}
            >
              <strong>{s.label}</strong>
              <small>{s.isPast ? 'Passed' : `${s.availableTables} free`}</small>
            </button>
          ))}
        </div>
      </Field>

      {time && (
        <Field label="New table">
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
    </Modal>
  );
}
