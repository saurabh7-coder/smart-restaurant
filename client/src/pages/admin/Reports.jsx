import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { Alert, EmptyState, Field, Spinner, Stars } from '../../components/ui.jsx';
import { ORDER_TYPE_ICON, ORDER_TYPE_LABEL, money, paise } from '../../utils/format.js';

export default function Reports() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'Reports — Admin';
  }, []);

  useEffect(() => {
    setLoading(true);
    api
      .getReports({ days })
      .then((res) => setData(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [days]);

  if (loading) return <Spinner />;
  if (error) return <Alert kind="error">{error}</Alert>;

  const maxDaily = Math.max(...data.dailyTrend.map((d) => d.bookings), 1);
  const maxPeak = Math.max(...data.peakHours.map((p) => p.bookings), 1);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Reports &amp; analytics</h1>
          <p>Last {data.rangeDays} days</p>
        </div>
        <Field label="Range" id="r-days">
          <select id="r-days" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last year</option>
          </select>
        </Field>
      </div>

      <section className="card">
        <div className="card-head">
          <h3>Bookings per day</h3>
        </div>
        <div className="card-body">
          {data.dailyTrend.length === 0 ? (
            <EmptyState emoji="📈" title="No bookings in this range" />
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                gap: 4,
                height: 180,
                overflowX: 'auto',
                paddingBottom: '1.5rem',
              }}
            >
              {data.dailyTrend.map((d) => (
                <div
                  key={d.date}
                  title={`${d.date}: ${d.bookings} bookings, ${d.guests} guests`}
                  style={{ flex: '1 0 22px', textAlign: 'center', position: 'relative' }}
                >
                  <div
                    style={{
                      height: `${(d.bookings / maxDaily) * 150}px`,
                      background: 'var(--brand)',
                      borderRadius: '4px 4px 0 0',
                      minHeight: 3,
                    }}
                  />
                  <span
                    className="faint"
                    style={{ fontSize: '0.65rem', position: 'absolute', bottom: -18, left: 0, right: 0 }}
                  >
                    {d.date.slice(8)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="grid-2" style={{ marginTop: '1.5rem', alignItems: 'start' }}>
        <section className="card">
          <div className="card-head">
            <h3>Peak seating times</h3>
          </div>
          <div className="card-body stack-sm">
            {data.peakHours.length === 0 ? (
              <p className="muted">No data yet.</p>
            ) : (
              data.peakHours.map((p) => (
                <div key={p.time}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span>{p.time}</span>
                    <span className="faint">{p.bookings} bookings</span>
                  </div>
                  <div style={{ height: 8, background: 'var(--surface-2)', borderRadius: 999 }}>
                    <div
                      style={{
                        width: `${(p.bookings / maxPeak) * 100}%`,
                        height: '100%',
                        background: 'var(--accent)',
                        borderRadius: 999,
                      }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h3>Party sizes</h3>
          </div>
          <div className="card-body stack-sm">
            {data.partySizes.length === 0 ? (
              <p className="muted">No data yet.</p>
            ) : (
              data.partySizes.map((p) => (
                <div key={p.guests} className="row" style={{ justifyContent: 'space-between' }}>
                  <span>
                    {p.guests} {p.guests === 1 ? 'guest' : 'guests'}
                  </span>
                  <strong>{p.bookings}</strong>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <div className="grid-2" style={{ marginTop: '1.5rem', alignItems: 'start' }}>
        <section className="card">
          <div className="card-head">
            <h3>Best sellers</h3>
            <div className="spacer" />
            <span className="badge">by units ordered</span>
          </div>
          <div className="card-body">
            {data.topSellingDishes.length === 0 ? (
              <p className="muted">No orders in this range yet.</p>
            ) : (
              <div className="table-wrap" style={{ border: 'none' }}>
                <table style={{ minWidth: 0 }}>
                  <thead>
                    <tr>
                      <th>Dish</th>
                      <th>Units</th>
                      <th>Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topSellingDishes.map((d) => (
                      <tr key={d._id}>
                        <td>{d.name}</td>
                        <td className="nowrap">{d.unitsSold}</td>
                        <td className="nowrap">{paise(d.revenuePaise)}</td>
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
            <h3>Orders by channel</h3>
          </div>
          <div className="card-body stack-sm">
            {data.ordersByType.length === 0 ? (
              <p className="muted">No orders in this range yet.</p>
            ) : (
              data.ordersByType.map((o) => (
                <div key={o.orderType} className="bill-row">
                  <span>
                    {ORDER_TYPE_ICON[o.orderType]} {ORDER_TYPE_LABEL[o.orderType]}
                  </span>
                  <span>
                    <strong>{o.orders}</strong>{' '}
                    <span className="faint">· {paise(o.revenuePaise)}</span>
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <div className="grid-2" style={{ marginTop: '1.5rem', alignItems: 'start' }}>
        <section className="card">
          <div className="card-head">
            <h3>Highest rated dishes</h3>
          </div>
          <div className="card-body">
            {data.topRatedDishes.length === 0 ? (
              <p className="muted">No rated dishes yet.</p>
            ) : (
              <div className="table-wrap" style={{ border: 'none' }}>
                <table style={{ minWidth: 0 }}>
                  <tbody>
                    {data.topRatedDishes.map((d) => (
                      <tr key={d._id}>
                        <td>{d.name}</td>
                        <td className="nowrap">{money(d.price)}</td>
                        <td>
                          <Stars value={d.rating.average} count={d.rating.count} />
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
            <h3>Most reviewed dishes</h3>
          </div>
          <div className="card-body">
            {data.mostReviewedDishes.length === 0 ? (
              <p className="muted">No reviews yet.</p>
            ) : (
              <div className="table-wrap" style={{ border: 'none' }}>
                <table style={{ minWidth: 0 }}>
                  <tbody>
                    {data.mostReviewedDishes.map((d) => (
                      <tr key={d._id}>
                        <td>{d.name}</td>
                        <td className="nowrap">{d.reviews} reviews</td>
                        <td className="nowrap">★ {d.avg}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>

      <Alert kind="info">
        Best sellers and channel revenue come from real orders. Ratings and review counts are shown
        separately because a dish can sell well without being reviewed, and vice versa.
      </Alert>
    </>
  );
}
