import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import { Alert, Spinner, StatusBadge } from '../../components/ui.jsx';
import { formatTime, money, paise, toDateInput } from '../../utils/format.js';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [today, setToday] = useState([]);
  const [occupancy, setOccupancy] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = 'Dashboard — Admin';

    Promise.all([api.getDashboard(), api.getTodayBoard(), api.getOccupancy()])
      .then(([s, t, o]) => {
        setStats(s.data);
        setToday(t.data.reservations);
        setOccupancy(o.data);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  if (error) return <Alert kind="error">{error}</Alert>;

  const t = stats.totals;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>Today is {toDateInput()}</p>
        </div>
        <Link to="/admin/reservations" className="btn btn-ghost">
          Manage reservations →
        </Link>
      </div>

      <div className="grid-3">
        <Stat label="Total reservations" value={t.reservations} />
        <Stat label="Today's bookings" value={t.todaysBookings} />
        <Stat
          label="Tables free now"
          value={t.availableTables}
          note={`of ${t.totalTables} in service`}
        />
        <Stat label="Customers" value={t.customers} />
        <Stat label="Menu items" value={t.menuItems} />
        <Stat
          label="Orders today"
          value={stats.orders.today}
          note={`${stats.orders.live} live in the kitchen`}
        />
      </div>

      <div className="grid-2" style={{ marginTop: '1rem' }}>
        <div className="stat">
          <div className="label">Billed revenue this month</div>
          <div className="value">
            {paise(stats.billedRevenue.amountPaise, stats.billedRevenue.currency)}
          </div>
          <div className="note">
            {stats.billedRevenue.completedOrders} completed orders ·{' '}
            {paise(stats.billedRevenue.onlinePaidPaise, stats.billedRevenue.currency)} online ·{' '}
            {paise(stats.billedRevenue.cashCollectedPaise ?? 0, stats.billedRevenue.currency)} cash
            on delivery
          </div>
        </div>
        <div className="stat">
          <div className="label">Estimated dine-in spend</div>
          <div className="value">
            {money(stats.estimatedRevenue.amount, stats.estimatedRevenue.currency)}
          </div>
          <div className="note">{stats.estimatedRevenue.basis}</div>
        </div>
      </div>

      <Alert kind="info">
        <strong>Two different numbers, on purpose.</strong> “Billed revenue” is real money from
        completed orders placed through the app. “Estimated dine-in spend” is a rough figure for
        seated guests who ordered verbally — seated guests × the average spend set in Settings — and
        is clearly an estimate, not a measurement.
      </Alert>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <section className="card">
          <div className="card-head">
            <h3>Today&apos;s bookings</h3>
            <div className="spacer" />
            <span className="badge">{today.length}</span>
          </div>
          <div className="card-body">
            {today.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                Nothing booked for today yet.
              </p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Guest</th>
                      <th>Party</th>
                      <th>Table</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {today.map((r) => (
                      <tr key={r._id}>
                        <td className="nowrap">{formatTime(r.slotStart)}</td>
                        <td>{r.contact.name}</td>
                        <td>{r.guests}</td>
                        <td>{r.table?.tableNumber}</td>
                        <td>
                          <StatusBadge status={r.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h3>Occupancy by seating</h3>
          </div>
          <div className="card-body stack-sm">
            {!occupancy || occupancy.slots.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                No seatings booked today.
              </p>
            ) : (
              occupancy.slots.map((slot) => (
                <div key={slot.time}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span>{slot.time}</span>
                    <span className="faint">
                      {slot.booked}/{occupancy.totalTables} tables · {slot.guests} guests
                    </span>
                  </div>
                  <div
                    style={{
                      height: 8,
                      background: 'var(--surface-2)',
                      borderRadius: 999,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.min(slot.occupancyPercent, 100)}%`,
                        height: '100%',
                        background: 'var(--brand)',
                      }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <section style={{ marginTop: '1.5rem' }}>
        <h3>Reservations by status</h3>
        <div className="chip-row">
          {Object.entries(stats.reservationsByStatus).map(([status, count]) => (
            <span key={status} className="row" style={{ gap: '0.35rem' }}>
              <StatusBadge status={status} />
              <strong>{count}</strong>
            </span>
          ))}
        </div>
      </section>
    </>
  );
}

function Stat({ label, value, note }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {note && <div className="note">{note}</div>}
    </div>
  );
}
