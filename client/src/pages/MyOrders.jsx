import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { Alert, EmptyState, Spinner, StatusBadge } from '../components/ui.jsx';
import { RateWhatYouAte } from '../components/RateWhatYouAte.jsx';
import { ORDER_TYPE_ICON, ORDER_TYPE_LABEL, formatAddress, formatDateTime, paise } from '../utils/format.js';

const LIVE = ['placed', 'accepted', 'preparing', 'ready', 'out_for_delivery'];

export default function MyOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api
      .getMyOrders()
      .then((res) => setOrders(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    document.title = 'My orders — Delicious Adda';
    load();
  }, [load]);

  // Live orders change while the customer watches, so poll gently.
  useEffect(() => {
    if (!orders.some((o) => LIVE.includes(o.status))) return undefined;
    const timer = setInterval(load, 20000);
    return () => clearInterval(timer);
  }, [orders, load]);

  if (loading) return <Spinner />;

  const active = orders.filter((o) => LIVE.includes(o.status) || o.status === 'awaiting_payment');
  const past = orders.filter((o) => !active.includes(o));

  return (
    <div className="container page">
      <div className="page-head">
        <div>
          <h1>My orders</h1>
          <p>Track what the kitchen is doing with your food.</p>
        </div>
        <Link to="/menu" className="btn">
          Order more
        </Link>
      </div>

      <Alert kind="error">{error}</Alert>

      <div style={{ marginBottom: '1.5rem' }}>
        <RateWhatYouAte limit={4} />
      </div>

      {orders.length === 0 ? (
        <EmptyState
          emoji="🥡"
          title="No orders yet"
          action={
            <Link to="/menu" className="btn">
              Browse the menu
            </Link>
          }
        >
          Order food for your booking, your table, or to take away.
        </EmptyState>
      ) : (
        <>
          {active.length > 0 && (
            <>
              <h2>In progress</h2>
              <div className="grid">
                {active.map((order) => (
                  <OrderCard key={order._id} order={order} />
                ))}
              </div>
            </>
          )}

          {past.length > 0 && (
            <>
              <h2 style={{ marginTop: '2.5rem' }}>Past orders</h2>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Type</th>
                      <th>Placed</th>
                      <th>Items</th>
                      <th>Total</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {past.map((o) => (
                      <tr key={o._id}>
                        <td className="nowrap">
                          <code>{o.orderNumber}</code>
                        </td>
                        <td className="nowrap">
                          {ORDER_TYPE_ICON[o.orderType]} {ORDER_TYPE_LABEL[o.orderType]}
                        </td>
                        <td className="nowrap">{formatDateTime(o.createdAt)}</td>
                        <td>{o.items.reduce((n, i) => n + i.quantity, 0)}</td>
                        <td className="nowrap">{paise(o.amounts.total, o.currency)}</td>
                        <td>
                          <StatusBadge status={o.status} />
                        </td>
                        <td>
                          <Link to={`/orders/${o._id}`} className="btn btn-ghost btn-sm">
                            View
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function OrderCard({ order }) {
  const items = order.items.reduce((n, i) => n + i.quantity, 0);

  return (
    <article className="card">
      <div className="card-head">
        <code>{order.orderNumber}</code>
        <div className="spacer" />
        <StatusBadge status={order.status} />
      </div>
      <div className="card-body stack-sm">
        <div className="row">
          <span style={{ fontSize: '1.5rem' }}>{ORDER_TYPE_ICON[order.orderType]}</span>
          <div>
            <strong>{ORDER_TYPE_LABEL[order.orderType]}</strong>
            <div className="muted">
              {items} {items === 1 ? 'item' : 'items'} · {paise(order.amounts.total, order.currency)}
            </div>
          </div>
        </div>

        {order.orderType === 'takeaway' && order.pickupAt && (
          <p className="muted" style={{ margin: 0 }}>
            🕐 Collect at {formatDateTime(order.pickupAt)}
          </p>
        )}
        {order.table && (
          <p className="muted" style={{ margin: 0 }}>
            🪑 Table {order.table.tableNumber}
          </p>
        )}
        {order.deliveryAddress && (
          <p className="muted" style={{ margin: 0 }}>
            🛵 {order.deliveryAddress.label} · {formatAddress(order.deliveryAddress)}
          </p>
        )}

        {order.status === 'awaiting_payment' && (
          <div className="alert alert-warn" style={{ margin: 0 }}>
            Payment not completed — the kitchen has not started this order.
          </div>
        )}
        {order.status === 'ready' && (
          <div className="alert alert-ok" style={{ margin: 0 }}>
            🎉 Your order is ready!
          </div>
        )}
        {order.status === 'out_for_delivery' && (
          <div className="alert alert-ok" style={{ margin: 0 }}>
            🛵 Out for delivery
          </div>
        )}

        <Link to={`/orders/${order._id}`} className="btn btn-soft btn-sm btn-block">
          {order.status === 'awaiting_payment' ? 'Complete payment' : 'Track order'}
        </Link>
      </div>
    </article>
  );
}
