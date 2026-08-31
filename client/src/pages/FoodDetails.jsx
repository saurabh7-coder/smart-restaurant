import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { Alternatives } from '../components/Alternatives.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Alert, EmptyState, Field, FoodTypeTag, Spinner, Stars } from '../components/ui.jsx';
import { AddToCart } from '../components/AddToCart.jsx';
import { formatDate, money } from '../utils/format.js';

export default function FoodDetails() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();

  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState('');

  const load = () => {
    setLoading(true);
    api
      .getMenuItem(id)
      .then((res) => {
        setItem(res.data);
        document.title = `${res.data.name} — Delicious Adda`;
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  async function submitReview(e) {
    e.preventDefault();
    setReviewError('');
    setSubmitting(true);
    try {
      await api.createReview({ menuItem: id, rating: Number(rating), comment });
      toast.success('Thanks for your review.');
      setComment('');
      load();
    } catch (err) {
      setReviewError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <Spinner />;
  if (error) {
    return (
      <div className="container page">
        <Alert kind="error">{error}</Alert>
        <Link to="/menu" className="btn btn-ghost">
          ← Back to menu
        </Link>
      </div>
    );
  }
  if (!item) return null;

  return (
    <div className="container page">
      <Link to="/menu" className="muted">
        ← Back to menu
      </Link>

      <div className="grid-2" style={{ marginTop: '1rem', alignItems: 'start' }}>
        <div className="card">
          <div className="food-thumb" style={{ aspectRatio: '1 / 1', fontSize: '9rem' }}>
            {item.image ? <img src={item.image} alt={item.name} /> : <span>🍽️</span>}
          </div>
        </div>

        <div>
          <div className="row">
            <FoodTypeTag type={item.foodType} />
            {item.category?.name && <span className="badge">{item.category.name}</span>}
            {item.isPopular && <span className="badge badge-warn">Popular</span>}
            {item.isTodaysSpecial && <span className="badge badge-brand">Today&apos;s special</span>}
            {!item.isAvailable && <span className="badge badge-danger">Currently unavailable</span>}
          </div>

          <h1 style={{ marginTop: '0.75rem' }}>{item.name}</h1>
          <div className="row">
            <span style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--brand)' }}>
              {money(item.price)}
            </span>
            <Stars value={item.rating?.average || 0} count={item.rating?.count} />
          </div>

          <p style={{ marginTop: '1rem' }}>{item.description}</p>

          <div className="grid-2" style={{ marginTop: '1.5rem' }}>
            {item.ingredients?.length > 0 && (
              <div className="panel">
                <h3>Ingredients</h3>
                <div className="chip-row">
                  {item.ingredients.map((ing) => (
                    <span key={ing} className="badge">
                      {ing}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="panel">
              <h3>Good to know</h3>
              <p className="muted" style={{ margin: 0 }}>
                <strong>Allergens:</strong>{' '}
                {item.allergens?.length ? item.allergens.join(', ') : 'None declared'}
              </p>
              {item.calories != null && (
                <p className="muted" style={{ margin: 0 }}>
                  <strong>Calories:</strong> {item.calories} kcal
                </p>
              )}
              <p className="faint" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
                Please tell our staff about any allergies when you arrive.
              </p>
            </div>
          </div>

          <div className="row" style={{ marginTop: '1.5rem' }}>
            <AddToCart item={item} size="btn-lg" />
            <Link to="/cart" className="btn btn-lg btn-soft">
              Go to cart
            </Link>
            <Link to="/reservation" className="btn btn-lg btn-ghost">
              Reserve a table
            </Link>
          </div>
        </div>
      </div>

      <section style={{ marginTop: '3rem' }}>
        {item && <Alternatives dish={item} />}

      <h2>Reviews</h2>

        {user ? (
          <form onSubmit={submitReview} className="panel" style={{ marginBottom: '1.5rem' }}>
            <h3>Leave a review</h3>
            <Alert kind="error">{reviewError}</Alert>
            <div className="grid-2">
              <Field label="Rating" id="rating">
                <select id="rating" value={rating} onChange={(e) => setRating(e.target.value)}>
                  {[5, 4, 3, 2, 1].map((n) => (
                    <option key={n} value={n}>
                      {'★'.repeat(n)} ({n})
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Your thoughts" id="comment">
              <textarea
                id="comment"
                value={comment}
                maxLength={800}
                placeholder="How was it?"
                onChange={(e) => setComment(e.target.value)}
              />
            </Field>
            <button type="submit" className="btn" disabled={submitting}>
              {submitting ? 'Posting…' : 'Post review'}
            </button>
            <p className="faint" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
              Reviews are open to guests who have dined with us at least once.
            </p>
          </form>
        ) : (
          <p className="muted">
            <Link to="/login">Log in</Link> to leave a review.
          </p>
        )}

        {item.reviews?.length ? (
          <div className="grid">
            {item.reviews.map((review) => (
              <div key={review._id} className="panel">
                <Stars value={review.rating} />
                {review.comment && <p style={{ marginTop: '0.6rem' }}>{review.comment}</p>}
                <p className="faint" style={{ margin: 0 }}>
                  {review.user?.name || 'Guest'} · {formatDate(review.createdAt)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState emoji="💬" title="No reviews yet">
            Be the first to review this dish.
          </EmptyState>
        )}
      </section>
    </div>
  );
}
