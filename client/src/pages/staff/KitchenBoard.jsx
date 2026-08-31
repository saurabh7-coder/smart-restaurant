import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { useToast } from '../../context/ToastContext.jsx';
import { Alert, EmptyState, Spinner } from '../../components/ui.jsx';
import {
  ORDER_TYPE_ICON,
  ORDER_TYPE_LABEL,
  formatAddress,
  formatTime,
  mapLink,
  paise,
} from '../../utils/format.js';

const COLUMNS = [
  ['placed', 'New', 'accepted', 'Accept'],
  ['accepted', 'Accepted', 'preparing', 'Start cooking'],
  ['preparing', 'Preparing', 'ready', 'Mark ready'],
  ['ready', 'Ready', 'completed', 'Hand over'],
  ['out_for_delivery', 'On the road', 'completed', 'Delivered'],
];

/**
 * A delivery leaves the pass to a rider rather than to the customer, so its
 * "ready" ticket advances to out_for_delivery instead of straight to completed.
 */
const nextFor = (order, fallback) =>
  order.orderType === 'delivery' && order.status === 'ready' ? 'out_for_delivery' : fallback;
const actionFor = (order, fallback) =>
  order.orderType === 'delivery' && order.status === 'ready' ? 'Send with rider' : fallback;

/** Minutes since an order was placed — drives the "running late" highlight. */
const ageMinutes = (order) => Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000);

export default function KitchenBoard() {
  const toast = useToast();

  const [board, setBoard] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const load = useCallback(
    (showSpinner = false) => {
      if (showSpinner) setLoading(true);
      api
        .getKitchenBoard()
        .then((res) => setBoard(res.data))
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    },
    [],
  );

  useEffect(() => {
    document.title = 'Kitchen — Delicious Adda';
    load(true);
  }, [load]);

  // A kitchen screen is left open all service, so it refreshes itself.
  useEffect(() => {
    if (!autoRefresh) return undefined;
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, [autoRefresh, load]);

  async function advance(order, status) {
    try {
      await api.setOrderStatus(order._id, status);
      toast.success(`${order.orderNumber} → ${status}`);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  if (loading) return <Spinner />;

  return (
    <div className="container page">
      <div className="page-head">
        <div>
          <h1>Kitchen</h1>
          <p>
            {board?.total || 0} live {board?.total === 1 ? 'ticket' : 'tickets'} ·{' '}
            {board?.itemsInProgress || 0} items on the pass
          </p>
        </div>
        <div className="row">
          <label className="checkline">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            <span>Auto-refresh</span>
          </label>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => load(true)}>
            Refresh now
          </button>
        </div>
      </div>

      <Alert kind="error">{error}</Alert>

      {board?.total === 0 ? (
        <EmptyState emoji="👨‍🍳" title="No live orders">
          New orders appear here the moment they are placed and paid.
        </EmptyState>
      ) : (
        <div className="kitchen-board">
          {COLUMNS.map(([status, title, nextStatus, actionLabel]) => {
            const tickets = board?.columns?.[status] || [];
            return (
              <div key={status} className="kitchen-col">
                <h3>
                  {title} <span className="badge">{tickets.length}</span>
                </h3>

                {tickets.length === 0 && <p className="faint">—</p>}

                {tickets.map((order) => {
                  const age = ageMinutes(order);
                  return (
                    <article
                      key={order._id}
                      className="ticket"
                      data-type={order.orderType}
                      data-age={age > 25 ? 'late' : 'ok'}
                    >
                      <div className="row" style={{ gap: '0.4rem' }}>
                        <strong>{order.orderNumber.split('-').pop()}</strong>
                        <span className="badge">
                          {ORDER_TYPE_ICON[order.orderType]} {ORDER_TYPE_LABEL[order.orderType]}
                        </span>
                        <div className="spacer" />
                        <span className={age > 25 ? 'badge badge-danger' : 'faint'}>{age}m</span>
                      </div>

                      <div className="faint">
                        {order.table
                          ? `Table ${order.table.tableNumber}`
                          : order.pickupAt
                            ? `Collect ${formatTime(order.pickupAt)}`
                            : order.contact.name}
                      </div>

                      {order.deliveryAddress && (
                        <div className="ticket-address">
                          <strong>🛵 {formatAddress(order.deliveryAddress)}</strong>
                          {order.deliveryAddress.directions && (
                            <div>↳ {order.deliveryAddress.directions}</div>
                          )}
                          <div className="row" style={{ gap: '0.4rem', marginTop: '0.25rem' }}>
                            <a href={mapLink(order.deliveryAddress)} target="_blank" rel="noreferrer">
                              Open in maps
                            </a>
                            <span>·</span>
                            <a href={`tel:${order.contact.phone}`}>{order.contact.phone}</a>
                            {order.deliveryDistanceKm != null && (
                              <span className="badge">{order.deliveryDistanceKm} km</span>
                            )}
                          </div>
                        </div>
                      )}

                      <ul>
                        {order.items.map((item) => (
                          <li key={item.menuItem}>
                            <strong>{item.quantity}×</strong> {item.name}
                            {item.note && <div className="faint">↳ {item.note}</div>}
                          </li>
                        ))}
                      </ul>

                      {order.note && (
                        <div className="alert alert-warn" style={{ margin: '0.4rem 0', padding: '0.4rem 0.6rem', fontSize: '0.82rem' }}>
                          📝 {order.note}
                        </div>
                      )}

                      <div className="row" style={{ justifyContent: 'space-between' }}>
                        <span className="faint">{paise(order.amounts.total, order.currency)}</span>
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => advance(order, nextFor(order, nextStatus))}
                        >
                          {actionFor(order, actionLabel)}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      <p className="faint" style={{ marginTop: '1.5rem' }}>
        Tickets turn red after 25 minutes. Orders paid online only appear once the payment has been
        verified by the server.
      </p>
    </div>
  );
}
