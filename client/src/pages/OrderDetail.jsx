import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { useRestaurant } from '../context/RestaurantContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Alert, ConfirmDialog, Spinner, StatusBadge } from '../components/ui.jsx';
import { loadRazorpayCheckout, openRazorpayCheckout } from '../utils/razorpay.js';
import {
  ORDER_TYPE_ICON,
  ORDER_TYPE_LABEL,
  formatAddress,
  formatDateTime,
  mapLink,
  paise,
} from '../utils/format.js';

/** Delivery has one more stage than collection: a rider leg. */
const trackFor = (orderType) =>
  orderType === 'delivery'
    ? [
        ['placed', 'Placed'],
        ['accepted', 'Accepted'],
        ['preparing', 'Preparing'],
        ['ready', 'Packed'],
        ['out_for_delivery', 'On the way'],
        ['completed', 'Delivered'],
      ]
    : [
        ['placed', 'Placed'],
        ['accepted', 'Accepted'],
        ['preparing', 'Preparing'],
        ['ready', 'Ready'],
        ['completed', 'Completed'],
      ];

const LIVE = ['placed', 'accepted', 'preparing', 'ready', 'out_for_delivery'];

export default function OrderDetail() {
  const { id } = useParams();
  const { restaurant } = useRestaurant();
  const toast = useToast();

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payError, setPayError] = useState('');
  const [paying, setPaying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const load = useCallback(() => {
    api
      .getOrder(id)
      .then((res) => {
        setOrder(res.data);
        document.title = `${res.data.orderNumber} — Delicious Adda`;
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(load, [load]);

  // Keep the tracker honest while the kitchen works.
  useEffect(() => {
    if (!order || !LIVE.includes(order.status)) return undefined;
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [order, load]);

  async function payNow() {
    setPayError('');
    setPaying(true);
    try {
      const [{ data: session }, Razorpay] = await Promise.all([
        api.createPaymentSession(order._id),
        loadRazorpayCheckout(),
      ]);

      const response = await openRazorpayCheckout({
        Razorpay,
        session,
        restaurantName: restaurant?.name,
      });

      await api.verifyPayment({
        order: order._id,
        razorpay_order_id: response.razorpay_order_id,
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_signature: response.razorpay_signature,
      });

      toast.success('Payment received — your order is with the kitchen.');
      load();
    } catch (err) {
      setPayError(err.message);
    } finally {
      setPaying(false);
    }
  }

  async function doCancel() {
    setCancelling(true);
    try {
      await api.cancelOrder(order._id);
      toast.success('Order cancelled.');
      setConfirmCancel(false);
      load();
    } catch (err) {
      toast.error(err.message);
      setConfirmCancel(false);
    } finally {
      setCancelling(false);
    }
  }

  if (loading) return <Spinner />;
  if (error) {
    return (
      <div className="container page">
        <Alert kind="error">{error}</Alert>
        <Link to="/my-orders" className="btn btn-ghost">
          ← My orders
        </Link>
      </div>
    );
  }
  if (!order) return null;

  const TRACK = trackFor(order.orderType);
  const currentIndex = TRACK.findIndex(([s]) => s === order.status);
  const cancelled = order.status === 'cancelled';
  const canCancel = ['awaiting_payment', 'placed'].includes(order.status);

  return (
    <div className="container page">
      <Link to="/my-orders" className="muted">
        ← My orders
      </Link>

      <div className="page-head" style={{ marginTop: '0.75rem' }}>
        <div>
          <h1 style={{ marginBottom: '0.25rem' }}>{order.orderNumber}</h1>
          <p>
            {ORDER_TYPE_ICON[order.orderType]} {ORDER_TYPE_LABEL[order.orderType]} · placed{' '}
            {formatDateTime(order.createdAt)}
          </p>
        </div>
        <div className="row">
          <StatusBadge status={order.status} />
          <StatusBadge status={order.payment.status} />
        </div>
      </div>

      <Alert kind="error">{payError}</Alert>

      {order.status === 'awaiting_payment' && (
        <div className="alert alert-warn">
          <strong>Payment not completed.</strong> This order has not been sent to the kitchen yet.
          Complete payment below, or cancel it.
        </div>
      )}
      {cancelled && (
        <div className="alert alert-error">
          <strong>Cancelled.</strong> {order.cancelReason}
        </div>
      )}
      {order.status === 'ready' && (
        <div className="alert alert-ok">
          <strong>🎉 Ready!</strong>{' '}
          {order.orderType === 'takeaway'
            ? 'Please collect from the counter.'
            : order.orderType === 'delivery'
              ? 'Packed and waiting for a rider.'
              : 'It is on its way to your table.'}
        </div>
      )}
      {order.status === 'out_for_delivery' && (
        <div className="alert alert-ok">
          <strong>🛵 On the way.</strong> Your order has left the kitchen
          {order.deliveryAddress ? ` and is heading to ${order.deliveryAddress.label}.` : '.'}
          {order.riderNote ? ` ${order.riderNote}` : ''}
        </div>
      )}

      {!cancelled && order.status !== 'awaiting_payment' && (
        <section className="panel">
          <div className="track">
            {TRACK.map(([status, label], i) => (
              <div
                key={status}
                className="track-step"
                data-done={i < currentIndex}
                data-current={i === currentIndex}
              >
                <span className="dot">{i < currentIndex ? '✓' : i + 1}</span>
                {label}
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid-2" style={{ alignItems: 'start', marginTop: '1rem' }}>
        <section className="card">
          <div className="card-head">
            <h3>Items</h3>
          </div>
          <div className="card-body">
            {order.items.map((item) => (
              <div key={item.menuItem} className="cart-line">
                <div className="cart-thumb">
                  <span aria-hidden="true">🍽️</span>
                </div>
                <div>
                  <strong>{item.name}</strong>
                  <div className="faint">
                    {item.quantity} × {paise(item.unitPrice, order.currency)}
                  </div>
                  {item.note && <div className="faint">📝 {item.note}</div>}
                </div>
                <strong className="nowrap">{paise(item.lineTotal, order.currency)}</strong>
              </div>
            ))}

            {order.note && (
              <div className="alert alert-info" style={{ marginTop: '1rem', marginBottom: 0 }}>
                <strong>Note:</strong> {order.note}
              </div>
            )}
          </div>
        </section>

        <aside className="stack">
          <section className="panel">
            <h3>Bill</h3>
            <div className="bill">
              <div className="bill-row">
                <span>Subtotal</span>
                <span>{paise(order.amounts.subtotal, order.currency)}</span>
              </div>
              {order.amounts.discount > 0 && (
                <div className="bill-row">
                  <span className="discount">Discount ({order.offerCode})</span>
                  <span className="discount">−{paise(order.amounts.discount, order.currency)}</span>
                </div>
              )}
              {order.orderType === 'delivery' && (
                <div className="bill-row">
                  <span>Delivery</span>
                  <span className={order.amounts.deliveryFee === 0 ? 'discount' : undefined}>
                    {order.amounts.deliveryFee === 0
                      ? 'Free'
                      : paise(order.amounts.deliveryFee, order.currency)}
                  </span>
                </div>
              )}
              <div className="bill-row">
                <span>GST ({order.amounts.taxPercent}%)</span>
                <span>{paise(order.amounts.tax, order.currency)}</span>
              </div>
              <div className="bill-row total">
                <span>Total</span>
                <span>{paise(order.amounts.total, order.currency)}</span>
              </div>
            </div>

            <p className="faint" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
              {order.payment.method === 'online'
                ? order.payment.status === 'paid'
                  ? `Paid online${order.payment.gatewayMethod ? ` by ${order.payment.gatewayMethod}` : ''} on ${formatDateTime(order.payment.paidAt)}`
                  : 'Online payment — not yet completed'
                : 'To be paid at the restaurant'}
            </p>
            {order.payment.status === 'refunded' && (
              <p className="faint" style={{ marginBottom: 0 }}>
                Refunded on {formatDateTime(order.payment.refundedAt)}
              </p>
            )}
          </section>

          <section className="panel">
            <h3>Details</h3>
            <div className="stack-sm">
              {order.table && (
                <div className="bill-row">
                  <span className="muted">Table</span>
                  <strong>
                    {order.table.tableNumber} ({order.table.location})
                  </strong>
                </div>
              )}
              {order.reservation && (
                <div className="bill-row">
                  <span className="muted">Booking</span>
                  <strong>{order.reservation.reservationId}</strong>
                </div>
              )}
              {order.pickupAt && (
                <div className="bill-row">
                  <span className="muted">Collect at</span>
                  <strong>{formatDateTime(order.pickupAt)}</strong>
                </div>
              )}
              {order.deliveryAddress && (
                <>
                  <div className="bill-row">
                    <span className="muted">Deliver to</span>
                    <strong>{order.deliveryAddress.label}</strong>
                  </div>
                  <p className="muted" style={{ margin: 0 }}>{formatAddress(order.deliveryAddress)}</p>
                  {order.deliveryAddress.directions && (
                    <p className="faint" style={{ margin: 0 }}>
                      🛵 {order.deliveryAddress.directions}
                    </p>
                  )}
                  <a
                    className="btn btn-ghost btn-sm"
                    href={mapLink(order.deliveryAddress)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open in maps
                  </a>
                  {order.deliveredAt && (
                    <p className="faint" style={{ margin: 0 }}>
                      Delivered {formatDateTime(order.deliveredAt)}
                    </p>
                  )}
                </>
              )}
              <div className="bill-row">
                <span className="muted">Name</span>
                <strong>{order.contact.name}</strong>
              </div>
              <div className="bill-row">
                <span className="muted">Phone</span>
                <strong>{order.contact.phone}</strong>
              </div>
            </div>
          </section>

          {(order.status === 'awaiting_payment' || canCancel) && (
            <section className="panel">
              {order.status === 'awaiting_payment' && order.payment.method === 'online' && (
                <button
                  type="button"
                  className="btn btn-lg btn-block"
                  onClick={payNow}
                  disabled={paying}
                >
                  {paying ? 'Opening checkout…' : `Pay ${paise(order.amounts.total, order.currency)}`}
                </button>
              )}
              {canCancel && (
                <button
                  type="button"
                  className="btn btn-danger btn-block"
                  style={{ marginTop: '0.5rem' }}
                  onClick={() => setConfirmCancel(true)}
                >
                  Cancel order
                </button>
              )}
            </section>
          )}
        </aside>
      </div>

      {confirmCancel && (
        <ConfirmDialog
          title="Cancel this order?"
          message={`Order ${order.orderNumber} will be cancelled. This cannot be undone.`}
          confirmLabel="Cancel order"
          danger
          busy={cancelling}
          onCancel={() => setConfirmCancel(false)}
          onConfirm={doCancel}
        />
      )}
    </div>
  );
}
