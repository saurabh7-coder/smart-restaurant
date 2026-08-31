import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import { Alert } from './ui.jsx';

/**
 * "Rate what you ate."
 *
 * Asks about specific dishes from specific completed orders, rather than
 * offering a blank review form. Two reasons: the customer is far more likely to
 * answer a question about the biryani they had on Tuesday than to seek out a
 * review page, and every rating collected this way provably comes from someone
 * who ate the dish.
 *
 * Each dish disappears from the prompt as it is answered, so the list drains
 * instead of nagging.
 */
export function RateWhatYouAte({ limit = 4, compact = false }) {
  const toast = useToast();
  const [pending, setPending] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState(null);
  const [comment, setComment] = useState('');

  const load = () =>
    api
      .getPendingReviews()
      .then((res) => setPending(res.data))
      .catch(() => setPending([]));

  useEffect(() => {
    load();
  }, []);

  async function submit(item, rating) {
    setBusyId(item.menuItem);
    setError('');
    try {
      await api.createReview({
        menuItem: item.menuItem,
        rating,
        comment: openId === item.menuItem ? comment : '',
      });
      toast.success(`Thanks for rating ${item.name}.`);
      setOpenId(null);
      setComment('');
      // Drop it locally straight away rather than waiting for a round trip.
      setPending((cur) => cur.filter((p) => p.menuItem !== item.menuItem));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  if (pending.length === 0) return null;

  return (
    <section className={compact ? '' : 'panel'}>
      <div className="page-head" style={{ marginBottom: '0.75rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.3rem' }}>Rate what you ate</h2>
          <p>Only dishes you have actually been served appear here.</p>
        </div>
      </div>

      <Alert kind="error">{error}</Alert>

      <div className="stack-sm">
        {pending.slice(0, limit).map((item) => (
          <div key={item.menuItem} className="rate-row">
            <div className="cart-thumb">
              {item.dish?.image ? (
                <img src={item.dish.image} alt="" loading="lazy" />
              ) : (
                <span aria-hidden="true">🍽️</span>
              )}
            </div>

            <div className="body">
              <strong>{item.name}</strong>
              <div className="faint">from {item.orderNumber}</div>

              {openId === item.menuItem && (
                <input
                  type="text"
                  value={comment}
                  maxLength={800}
                  placeholder="Add a comment (optional), then pick a star"
                  onChange={(e) => setComment(e.target.value)}
                  style={{ marginTop: '0.4rem', fontSize: '0.85rem', padding: '0.35rem 0.5rem' }}
                />
              )}
            </div>

            <div className="rate-stars">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  disabled={busyId === item.menuItem}
                  onClick={() => submit(item, n)}
                  aria-label={`${n} star${n === 1 ? '' : 's'} for ${item.name}`}
                  title={`${n} / 5`}
                >
                  ★
                </button>
              ))}
              <button
                type="button"
                className="icon-btn"
                onClick={() => {
                  setOpenId(openId === item.menuItem ? null : item.menuItem);
                  setComment('');
                }}
                aria-label="Add a comment"
                title="Add a comment"
              >
                💬
              </button>
            </div>
          </div>
        ))}
      </div>

      {pending.length > limit && (
        <p className="faint" style={{ marginBottom: 0 }}>
          {pending.length - limit} more waiting.
        </p>
      )}
    </section>
  );
}
