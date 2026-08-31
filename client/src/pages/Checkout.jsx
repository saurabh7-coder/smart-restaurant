import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useRestaurant } from '../context/RestaurantContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Alert, Field, Spinner } from '../components/ui.jsx';
import { PromoCode } from '../components/PromoCode.jsx';
import { loadRazorpayCheckout, openRazorpayCheckout } from '../utils/razorpay.js';
import { AddressForm, BLANK_ADDRESS } from '../components/AddressForm.jsx';
import { formatAddress, formatClock, formatDate, formatDateTime, formatTime, money, paise } from '../utils/format.js';

const TYPES = [
  ['delivery', '🛵', 'Delivery', 'Brought to your door'],
  ['takeaway', '🥡', 'Takeaway', 'Collect from the counter'],
  ['dine_in', '🪑', 'Dine-in', 'Ordering from your table right now'],
  ['pre_order', '🍽️', 'Pre-order', 'Ready when you arrive for your booking'],
];

export default function Checkout() {
  const { user } = useAuth();
  const cart = useCart();
  const { lines, isEmpty, toPayload, clear } = cart;
  const { restaurant } = useRestaurant();
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const config = restaurant?.ordering;
  const onlineAvailable = Boolean(config?.onlinePaymentEnabled);

  const [orderType, setOrderType] = useState('');
  const [reservationId, setReservationId] = useState('');
  const [tableId, setTableId] = useState(params.get('table') || cart.tableId || '');
  const [pickupAt, setPickupAt] = useState('');
  const [addresses, setAddresses] = useState([]);
  const [savedAddressId, setSavedAddressId] = useState('');
  const [newAddress, setNewAddress] = useState(BLANK_ADDRESS);
  const [paymentMethod, setPaymentMethod] = useState('at_restaurant');
  const [redeemPoints, setRedeemPoints] = useState(0);

  const [reservations, setReservations] = useState([]);
  const [tables, setTables] = useState([]);
  const [quote, setQuote] = useState(null);

  const [form, setForm] = useState({ name: '', phone: '', email: '', note: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState('');

  // Comes from the persisted cart, not navigation state — so it survives a
  // refresh and is present even when checkout is opened straight from a table
  // QR link. Previously it silently vanished and the order went out full price.
  const { offerCode } = cart;

  useEffect(() => {
    document.title = 'Checkout — Delicious Adda';
  }, []);

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

  // A QR code on the table links straight here with ?table=<id>, so dine-in is
  // pre-selected and the guest only has to confirm.
  useEffect(() => {
    if (params.get('table') || cart.tableId) setOrderType('dine_in');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, cart.tableId]);

  /*
   * Keep the payment method valid for the chosen channel. "Pay at the
   * restaurant" is meaningless for a delivery, and cash on delivery is
   * meaningless for anything else — so switching channel switches the pay-later
   * option with it rather than leaving an impossible combination selected.
   */
  useEffect(() => {
    if (!orderType) return;
    setPaymentMethod((current) => {
      if (current === 'online') return current;
      return orderType === 'delivery' ? 'cod' : 'at_restaurant';
    });
  }, [orderType]);

  useEffect(() => {
    if (!user) return;
    Promise.all([api.getMyReservations({ scope: 'upcoming' }), api.getTables(), api.getAddresses()])
      .then(([r, t, a]) => {
        setReservations(r.data);
        setTables(t.data);
        setAddresses(a.data);
        if (r.data.length === 1 && !params.get('table')) setReservationId(r.data[0]._id);
        // Preselect the customer's default address so a returning customer can
        // reach "Place order" without retyping anything.
        const def = a.data.find((x) => x.isDefault) || a.data[0];
        if (def) setSavedAddressId(def._id);
      })
      .catch(() => {});
  }, [user, params]);

  useEffect(() => {
    if (!user || isEmpty) return;
    api
      .quoteOrder({
        items: toPayload(),
        offerCode: offerCode || undefined,
        orderType: orderType || undefined,
        redeemPoints: redeemPoints || undefined,
      })
      .then((res) => setQuote(res.data))
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, lines, offerCode, orderType, redeemPoints]);

  const earliestPickup = useMemo(() => {
    const lead = config?.takeawayLeadMinutes ?? 30;
    const d = new Date(Date.now() + lead * 60_000);
    d.setSeconds(0, 0);
    // datetime-local wants local wall time, not a UTC ISO string.
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }, [config]);

  if (!user) {
    return (
      <div className="container page" style={{ maxWidth: 520 }}>
        <h1>Checkout</h1>
        <Alert kind="info">
          Please <Link to="/login" state={{ from: '/checkout' }}>log in</Link> to place your order.
        </Alert>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="container page" style={{ maxWidth: 520 }}>
        <h1>Checkout</h1>
        <Alert kind="warn">Your cart is empty.</Alert>
        <Link to="/menu" className="btn">
          Browse the menu
        </Link>
      </div>
    );
  }

  const codCap = config?.delivery?.codMaxOrderValue || 0;
  const overCodCap = codCap > 0 && quote ? quote.amounts.total / 100 > codCap : false;
  const codAvailable = config?.delivery?.codEnabled !== false && !overCodCap;

  const typeEnabled = {
    pre_order: config?.preOrderEnabled !== false,
    dine_in: config?.dineInEnabled !== false,
    takeaway: config?.takeawayEnabled !== false,
    delivery: config?.deliveryEnabled !== false,
  };

  async function placeOrder(e) {
    e.preventDefault();
    setError('');
    setFieldErrors({});

    if (!orderType) {
      setError('Please choose how you would like to order.');
      return;
    }

    setBusy(true);
    setStage('Placing your order…');

    let order;
    try {
      const res = await api.createOrder({
        items: toPayload(),
        orderType,
        offerCode: offerCode || undefined,
        paymentMethod,
        redeemPoints: redeemPoints || undefined,
        reservation: orderType === 'pre_order' ? reservationId : undefined,
        table: orderType === 'dine_in' ? tableId : undefined,
        // datetime-local has no timezone; converting through Date attaches the
        // browser's offset so the server receives an unambiguous instant.
        pickupAt: orderType === 'takeaway' && pickupAt ? new Date(pickupAt).toISOString() : undefined,
        ...(orderType === 'delivery'
          ? savedAddressId
            ? { savedAddressId }
            : { deliveryAddress: newAddress }
          : {}),
        name: form.name,
        phone: form.phone,
        email: form.email,
        note: form.note,
      });
      order = res.data;
    } catch (err) {
      setError(err.message);
      setFieldErrors(err.details || {});
      setBusy(false);
      setStage('');
      return;
    }

    // Pay at the restaurant: nothing more to do.
    if (paymentMethod !== 'online') {
      clear();
      toast.success(`Order ${order.orderNumber} placed.`);
      navigate(`/orders/${order._id}`, { replace: true });
      return;
    }

    /* ---- online payment ---- */
    try {
      setStage('Opening secure checkout…');
      const [{ data: session }, Razorpay] = await Promise.all([
        api.createPaymentSession(order._id),
        loadRazorpayCheckout(),
      ]);

      const response = await openRazorpayCheckout({
        Razorpay,
        session,
        restaurantName: restaurant?.name,
      });

      setStage('Confirming your payment…');
      // The browser saying "paid" proves nothing — the server verifies the
      // signature before the order reaches the kitchen.
      await api.verifyPayment({
        order: order._id,
        razorpay_order_id: response.razorpay_order_id,
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_signature: response.razorpay_signature,
      });

      clear();
      toast.success('Payment received — your order is with the kitchen.');
      navigate(`/orders/${order._id}`, { replace: true });
    } catch (err) {
      // The order exists and is saved; only payment did not complete. Send the
      // customer to it so they can retry rather than losing the order.
      setError(`${err.message} Your order ${order.orderNumber} is saved — you can pay from My orders.`);
      clear();
      setBusy(false);
      setStage('');
      setTimeout(() => navigate(`/orders/${order._id}`), 2500);
    }
  }

  return (
    <div className="container page">
      <div className="page-head">
        <div>
          <h1>Checkout</h1>
          <p>
            {lines.length} {lines.length === 1 ? 'dish' : 'dishes'} ·{' '}
            {quote ? paise(quote.amounts.total, quote.currency) : '…'}
          </p>
        </div>
        <Link to="/cart" className="btn btn-ghost btn-sm">
          ← Back to cart
        </Link>
      </div>

      <Alert kind="error">{error}</Alert>

      <form onSubmit={placeOrder}>
        <div className="grid-2" style={{ alignItems: 'start', gridTemplateColumns: '1.5fr 1fr' }}>
          <div className="stack">
            {/* ---------- order type ---------- */}
            <section className="panel">
              <h3>1 · How would you like to order?</h3>
              <div className="type-grid">
                {TYPES.map(([value, emoji, label, hint]) => (
                  <button
                    key={value}
                    type="button"
                    className="type-tile"
                    aria-pressed={orderType === value}
                    disabled={!typeEnabled[value]}
                    onClick={() => setOrderType(value)}
                  >
                    <span className="emoji" aria-hidden="true">
                      {emoji}
                    </span>
                    <strong>{label}</strong>
                    <small>{typeEnabled[value] ? hint : 'Currently unavailable'}</small>
                  </button>
                ))}
              </div>
            </section>

            {/* ---------- type-specific detail ---------- */}
            {orderType === 'pre_order' && (
              <section className="panel">
                <h3>2 · Which booking is this for?</h3>
                {reservations.length === 0 ? (
                  <Alert kind="warn">
                    You have no upcoming bookings.{' '}
                    <Link to="/reservation">Reserve a table</Link> first, or choose takeaway.
                  </Alert>
                ) : (
                  <Field label="Booking" id="res" error={fieldErrors.reservation}>
                    <select
                      id="res"
                      value={reservationId}
                      onChange={(e) => setReservationId(e.target.value)}
                      required
                    >
                      <option value="">Choose a booking…</option>
                      {reservations.map((r) => (
                        <option key={r._id} value={r._id}>
                          {r.reservationId} — {formatDate(r.slotStart)} at {formatTime(r.slotStart)}, table{' '}
                          {r.table?.tableNumber} ({r.guests} guests)
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                <p className="faint" style={{ margin: 0 }}>
                  The kitchen starts your food so it is ready as you sit down.
                </p>
              </section>
            )}

            {orderType === 'dine_in' && (
              <section className="panel">
                <h3>2 · Which table are you at?</h3>
                <Field label="Table" id="tbl" error={fieldErrors.table}>
                  <select id="tbl" value={tableId} onChange={(e) => setTableId(e.target.value)} required>
                    <option value="">Choose your table…</option>
                    {tables.map((t) => (
                      <option key={t._id} value={t._id}>
                        {t.tableNumber} — {t.location}, seats {t.capacity}
                      </option>
                    ))}
                  </select>
                </Field>
                <p className="faint" style={{ margin: 0 }}>
                  Scanning the QR code on your table fills this in automatically.
                </p>
              </section>
            )}

            {orderType === 'delivery' && (
              <section className="panel">
                <h3>2 · Where should we deliver?</h3>

                {addresses.length > 0 && (
                  <div className="stack-sm" style={{ marginBottom: '1rem' }}>
                    {addresses.map((a) => (
                      <button
                        key={a._id}
                        type="button"
                        className="address-card"
                        aria-pressed={savedAddressId === a._id}
                        onClick={() => setSavedAddressId(a._id)}
                      >
                        <span style={{ fontSize: '1.2rem' }}>
                          {a.label === 'Work' ? '🏢' : a.label === 'Home' ? '🏠' : '📍'}
                        </span>
                        <span className="body">
                          <strong>{a.label}</strong>
                          {a.isDefault && <span className="badge badge-ok" style={{ marginLeft: '0.4rem' }}>Default</span>}
                          {a.lat != null && <span className="badge" style={{ marginLeft: '0.4rem' }}>📍 pinned</span>}
                          <p>{formatAddress(a)}</p>
                        </span>
                      </button>
                    ))}

                    <button
                      type="button"
                      className="address-card"
                      aria-pressed={savedAddressId === ''}
                      onClick={() => setSavedAddressId('')}
                    >
                      <span style={{ fontSize: '1.2rem' }}>➕</span>
                      <span className="body">
                        <strong>Deliver somewhere else</strong>
                        <p>Enter a new address</p>
                      </span>
                    </button>
                  </div>
                )}

                {savedAddressId === '' && (
                  <AddressForm value={newAddress} onChange={setNewAddress} errors={fieldErrors} />
                )}

                <p className="faint" style={{ marginBottom: 0 }}>
                  {config?.delivery?.radiusEnforced
                    ? `We deliver within ${config.delivery.radiusKm} km. Sharing your location lets us check that instantly and helps the rider find you.`
                    : 'Sharing your location helps the rider find you.'}
                  {config?.delivery?.etaMinutes
                    ? ` Typical delivery time is about ${config.delivery.etaMinutes} minutes.`
                    : ''}
                </p>
              </section>
            )}

            {orderType === 'takeaway' && (
              <section className="panel">
                <h3>2 · When will you collect?</h3>
                <Field
                  label="Collection time"
                  id="pickup"
                  error={fieldErrors.pickupAt}
                  hint={`We need at least ${config?.takeawayLeadMinutes ?? 30} minutes. Kitchen open ${formatClock(config?.openTime)}–${formatClock(config?.closeTime)}.`}
                >
                  <input
                    id="pickup"
                    type="datetime-local"
                    value={pickupAt}
                    min={earliestPickup}
                    onChange={(e) => setPickupAt(e.target.value)}
                    required
                  />
                </Field>
              </section>
            )}

            {/* ---------- contact ---------- */}
            <section className="panel">
              <h3>3 · Contact details</h3>
              <div className="grid-2">
                <Field label="Name" id="c-name" error={fieldErrors.name}>
                  <input
                    id="c-name"
                    value={form.name}
                    required
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </Field>
                <Field label="Phone" id="c-phone" error={fieldErrors.phone}>
                  <input
                    id="c-phone"
                    value={form.phone}
                    required
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </Field>
              </div>
              <Field label="Email" id="c-email" error={fieldErrors.email}>
                <input
                  id="c-email"
                  type="email"
                  value={form.email}
                  required
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </Field>
              <Field label="Note for the kitchen (optional)" id="c-note">
                <textarea
                  id="c-note"
                  maxLength={500}
                  value={form.note}
                  placeholder="Allergies, spice level, anything else…"
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                />
              </Field>
            </section>

            {/* ---------- payment ---------- */}
            <section className="panel">
              <h3>4 · Payment</h3>
              <div className="type-grid">
                {orderType === 'delivery' ? (
                  <button
                    type="button"
                    className="type-tile"
                    aria-pressed={paymentMethod === 'cod'}
                    disabled={!codAvailable}
                    onClick={() => setPaymentMethod('cod')}
                  >
                    <span className="emoji" aria-hidden="true">
                      💵
                    </span>
                    <strong>Cash on delivery</strong>
                    <small>
                      {!config?.delivery?.codEnabled
                        ? 'Not available right now'
                        : codCap > 0 && overCodCap
                          ? `Only for orders up to ${money(codCap)}`
                          : 'Pay the rider at your door'}
                    </small>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="type-tile"
                    aria-pressed={paymentMethod === 'at_restaurant'}
                    onClick={() => setPaymentMethod('at_restaurant')}
                  >
                    <span className="emoji" aria-hidden="true">
                      🧾
                    </span>
                    <strong>Pay at the restaurant</strong>
                    <small>Card, UPI or cash when you arrive</small>
                  </button>
                )}

                <button
                  type="button"
                  className="type-tile"
                  aria-pressed={paymentMethod === 'online'}
                  disabled={!onlineAvailable}
                  onClick={() => setPaymentMethod('online')}
                >
                  <span className="emoji" aria-hidden="true">
                    💳
                  </span>
                  <strong>Pay online now</strong>
                  <small>
                    {onlineAvailable
                      ? 'Card, UPI, netbanking or wallet via Razorpay'
                      : 'Not configured on this server'}
                  </small>
                </button>
              </div>

              {!onlineAvailable && (
                <p className="faint" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
                  Online payment appears once Razorpay keys are set in{' '}
                  <code>server/.env</code>. Everything else works without them.
                </p>
              )}
            </section>
          </div>

          {/* ---------- summary ---------- */}
          <aside className="panel" style={{ position: 'sticky', top: 'calc(var(--header-h) + 1rem)' }}>
            <h3>Your order</h3>

            <div className="stack-sm" style={{ marginBottom: '1rem' }}>
              {lines.map((l) => (
                <div key={l.menuItem} className="bill-row">
                  <span>
                    {l.quantity} × {l.name}
                  </span>
                  <span className="nowrap">{money(l.price * l.quantity)}</span>
                </div>
              ))}
            </div>

            {quote ? (
              <div className="bill">
                <div className="bill-row">
                  <span>Subtotal</span>
                  <span>{paise(quote.amounts.subtotal, quote.currency)}</span>
                </div>
                {quote.amounts.discount > 0 && (
                  <div className="bill-row">
                    <span className="discount">Discount ({quote.offer?.code})</span>
                    <span className="discount">−{paise(quote.amounts.discount, quote.currency)}</span>
                  </div>
                )}
                <div className="bill-row">
                  <span>GST ({quote.amounts.taxPercent}%)</span>
                  <span>{paise(quote.amounts.tax, quote.currency)}</span>
                </div>
                {quote.amounts.pointsDiscount > 0 && (
                  <div className="bill-row">
                    <span className="discount">
                      Loyalty points ({quote.loyalty?.redeemed})
                    </span>
                    <span className="discount">
                      −{paise(quote.amounts.pointsDiscount, quote.currency)}
                    </span>
                  </div>
                )}
                {orderType === 'delivery' && (
                  <div className="bill-row">
                    <span>Delivery</span>
                    <span className={quote.amounts.deliveryFee === 0 ? 'discount' : undefined}>
                      {quote.amounts.deliveryFee === 0
                        ? 'Free'
                        : paise(quote.amounts.deliveryFee, quote.currency)}
                    </span>
                  </div>
                )}
                <div className="bill-row total">
                  <span>Total</span>
                  <span>{paise(quote.amounts.total, quote.currency)}</span>
                </div>
              </div>
            ) : (
              <Spinner />
            )}

            {quote?.loyalty?.enabled && quote.loyalty.points > 0 && (
              <div className="loyalty-redeem">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span>
                    ⭐ <strong>{quote.loyalty.points}</strong> points available
                  </span>
                  {redeemPoints > 0 ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setRedeemPoints(0)}
                    >
                      Don’t use
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-soft btn-sm"
                      onClick={() => setRedeemPoints(quote.loyalty.points)}
                      disabled={quote.loyalty.points < quote.loyalty.minRedeemPoints}
                    >
                      Use points
                    </button>
                  )}
                </div>
                {quote.loyalty.points < quote.loyalty.minRedeemPoints ? (
                  <p className="faint" style={{ margin: '0.35rem 0 0' }}>
                    {quote.loyalty.minRedeemPoints - quote.loyalty.points} more points needed before
                    you can redeem.
                  </p>
                ) : (
                  quote.loyalty.redeemNote && (
                    <p className="faint" style={{ margin: '0.35rem 0 0' }}>
                      {quote.loyalty.redeemNote}
                    </p>
                  )
                )}
                {quote.loyalty.wouldEarn > 0 && (
                  <p className="faint" style={{ margin: '0.35rem 0 0' }}>
                    This order earns you {quote.loyalty.wouldEarn} points once it arrives.
                  </p>
                )}
              </div>
            )}

            {/* Applying a code here as well as in the cart — a customer who
                skipped it earlier should not have to go back for it. */}
            {quote && (
              <div style={{ marginTop: '1rem' }}>
                <PromoCode appliedOffer={quote.offer} onApplied={(data) => setQuote(data)} />
              </div>
            )}

            {orderType === 'delivery' && quote?.delivery && !quote.delivery.isFree && quote.delivery.freeAbove > 0 && (
              <p className="faint" style={{ marginTop: '0.6rem' }}>
                Add {money(quote.delivery.freeAbove - quote.amounts.taxable / 100)} more for free delivery.
              </p>
            )}

            {orderType === 'takeaway' && pickupAt && (
              <p className="faint" style={{ marginTop: '0.75rem' }}>
                Collect at {formatDateTime(new Date(pickupAt))}
              </p>
            )}

            <button
              type="submit"
              className="btn btn-lg btn-block"
              disabled={busy || !quote || !orderType}
              style={{ marginTop: '1rem' }}
            >
              {busy
                ? stage || 'Working…'
                : paymentMethod === 'online'
                  ? `Pay ${quote ? paise(quote.amounts.total, quote.currency) : ''}`
                  : paymentMethod === 'cod'
                    ? `Place order · pay ${quote ? paise(quote.amounts.total, quote.currency) : ''} on delivery`
                    : 'Place order'}
            </button>

            <p className="faint center" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
              {paymentMethod === 'online'
                ? 'You will be redirected to Razorpay’s secure checkout. We never see your card details.'
                : paymentMethod === 'cod'
                  ? 'Pay the rider in cash when your order arrives. Please keep the exact amount handy.'
                  : 'Pay when you arrive. No card details needed now.'}
            </p>
          </aside>
        </div>
      </form>
    </div>
  );
}
