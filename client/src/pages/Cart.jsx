import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useCart } from '../context/CartContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { Alert, EmptyState, Spinner } from '../components/ui.jsx';
import { Stepper } from '../components/AddToCart.jsx';
import { PromoCode } from '../components/PromoCode.jsx';
import { money, paise } from '../utils/format.js';

export default function Cart() {
  const { lines, isEmpty, setQuantity, setNote, remove, clear, toPayload, offerCode } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [quote, setQuote] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = 'Your cart — Delicious Adda';
  }, []);

  /**
   * The bill is always priced by the server. The numbers beside each line are a
   * local convenience; these totals are the real ones.
   */
  const refreshQuote = useCallback(async () => {
    if (isEmpty) {
      setQuote(null);
      return;
    }
    if (!user) return; // quoting requires auth; the sign-in prompt handles this

    setLoading(true);
    setError('');
    try {
      const res = await api.quoteOrder({
        items: toPayload(),
        offerCode: offerCode || undefined,
      });
      setQuote(res.data);
    } catch (err) {
      // A code that has expired or no longer meets its conditions must not
      // block the cart — report it and fall back to an undiscounted quote.
      setError(err.message);
      try {
        const plain = await api.quoteOrder({ items: toPayload() });
        setQuote(plain.data);
      } catch {
        setQuote(null);
      }
    } finally {
      setLoading(false);
    }
  }, [isEmpty, user, toPayload, offerCode]);

  useEffect(() => {
    refreshQuote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, user, offerCode]);

  if (isEmpty) {
    return (
      <div className="container page">
        <h1>Your cart</h1>
        <EmptyState
          emoji="🛒"
          title="Your cart is empty"
          action={
            <Link to="/menu" className="btn">
              Browse the menu
            </Link>
          }
        >
          Add a few dishes and they will show up here.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="container page">
      <div className="page-head">
        <div>
          <h1>Your cart</h1>
          <p>
            {lines.length} {lines.length === 1 ? 'dish' : 'dishes'} · prices confirmed by the kitchen
          </p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={clear}>
          Clear cart
        </button>
      </div>

      <Alert kind="error">{error}</Alert>

      <div className="grid-2" style={{ alignItems: 'start', gridTemplateColumns: '1.6fr 1fr' }}>
        <section className="panel">
          {lines.map((line) => (
            <div key={line.menuItem} className="cart-line">
              <div className="cart-thumb">
                {line.image ? <img src={line.image} alt="" /> : <span aria-hidden="true">🍽️</span>}
              </div>

              <div>
                <div className="row" style={{ gap: '0.5rem' }}>
                  <Link to={`/menu/${line.menuItem}`}>
                    <strong>{line.name}</strong>
                  </Link>
                  {line.foodType && <span className={`food-dot ${line.foodType}`} aria-hidden="true" />}
                </div>
                <div className="faint">{money(line.price)} each</div>
                <input
                  type="text"
                  value={line.note}
                  maxLength={200}
                  placeholder="Any note for the kitchen? (e.g. less spicy)"
                  onChange={(e) => setNote(line.menuItem, e.target.value)}
                  style={{ marginTop: '0.4rem', fontSize: '0.85rem', padding: '0.35rem 0.5rem' }}
                />
              </div>

              <div className="stack-sm" style={{ justifyItems: 'end' }}>
                <strong>{money(line.price * line.quantity)}</strong>
                <Stepper
                  value={line.quantity}
                  min={1}
                  onChange={(q) => setQuantity(line.menuItem, q)}
                  label={line.name}
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => remove(line.menuItem)}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}

          <Link to="/menu" className="btn btn-ghost btn-sm" style={{ marginTop: '1rem' }}>
            + Add more dishes
          </Link>
        </section>

        <aside className="panel">
          <h3>Bill</h3>

          {!user ? (
            <Alert kind="info">
              <Link to="/login" state={{ from: '/cart' }}>
                Log in
              </Link>{' '}
              to see your total and place the order.
            </Alert>
          ) : loading && !quote ? (
            <Spinner />
          ) : quote ? (
            <>
              <div className="bill">
                <div className="bill-row">
                  <span>Subtotal</span>
                  <span>{paise(quote.amounts.subtotal, quote.currency)}</span>
                </div>
                {quote.amounts.discount > 0 && (
                  <div className="bill-row">
                    <span className="discount">Discount ({quote.offer?.code})</span>
                    <span className="discount">
                      −{paise(quote.amounts.discount, quote.currency)}
                    </span>
                  </div>
                )}
                <div className="bill-row">
                  <span>
                    GST ({quote.amounts.taxPercent}%)
                  </span>
                  <span>{paise(quote.amounts.tax, quote.currency)}</span>
                </div>
                <div className="bill-row total">
                  <span>Total</span>
                  <span>{paise(quote.amounts.total, quote.currency)}</span>
                </div>
              </div>

              <div style={{ marginTop: '1rem' }}>
                <PromoCode appliedOffer={quote.offer} onApplied={(data) => setQuote(data)} />
              </div>

              {!quote.meetsMinimum && (
                <Alert kind="warn">
                  Minimum order is {money(quote.minOrderValue)}. Please add a little more.
                </Alert>
              )}

              <button
                type="button"
                className="btn btn-lg btn-block"
                disabled={!quote.meetsMinimum || loading}
                onClick={() => navigate('/checkout')}
              >
                Continue to checkout
              </button>

              <p className="faint center" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
                Totals are calculated by the restaurant, not your browser.
              </p>
            </>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
