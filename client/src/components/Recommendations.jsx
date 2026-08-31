import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { FoodCard } from './FoodCard.jsx';

/**
 * "Recommended for you" rail.
 *
 * Every card shows the reason it was suggested, and the section footer states
 * plainly how the list was produced. Recommendations that cannot explain
 * themselves are just an opaque nudge — and for a menu, an unexplained
 * suggestion is easy to mistake for an advert.
 */
export function Recommendations({ limit = 8, title = 'Recommended for you', exclude = [] }) {
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .getRecommendations({ limit, exclude: exclude.join(',') || undefined })
      .then((res) => {
        if (cancelled) return;
        setItems(res.data);
        setMeta(res.meta);
      })
      .catch(() => setItems([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit, exclude.join(',')]);

  if (loading || items.length === 0) return null;

  return (
    <section className="section">
      <div className="container">
        <div className="section-head-row">
          <div>
            <h2>{title}</h2>
            <p>
              {meta?.personalised
                ? 'Based on what you have ordered before.'
                : 'Our most ordered and best rated dishes.'}
            </p>
          </div>
          {meta?.personalised && <span className="badge badge-brand">Personalised</span>}
        </div>

        <div className="rail">
          {items.map((item) => (
            <div key={item._id} className="rec-card">
              <FoodCard item={item} />
              {item.reason && <p className="rec-reason">💡 {item.reason}</p>}
            </div>
          ))}
        </div>

        {meta?.method && <p className="faint">How these were chosen: {meta.method.toLowerCase()}.</p>}
      </div>
    </section>
  );
}
