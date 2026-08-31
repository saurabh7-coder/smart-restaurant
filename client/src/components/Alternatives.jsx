import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { FoodCard } from './FoodCard.jsx';

/**
 * "Chicken Burger is unavailable — would you like Paneer Burger?"
 *
 * Shown prominently when the dish is off, and quietly as a "similar dishes"
 * row when it is available. The wording changes with it: a guest looking at a
 * sold-out dish needs a replacement, while a guest looking at an available one
 * is just browsing.
 */
export function Alternatives({ dish, limit = 3 }) {
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState(null);

  useEffect(() => {
    if (!dish?._id) return;
    let cancelled = false;

    api
      .getAlternatives(dish._id, { limit })
      .then((res) => {
        if (cancelled) return;
        setItems(res.data);
        setMeta(res.meta);
      })
      .catch(() => setItems([]));

    return () => {
      cancelled = true;
    };
  }, [dish?._id, limit]);

  if (items.length === 0) return null;

  const unavailable = dish.isAvailable === false;

  return (
    <section className={unavailable ? 'panel' : ''} style={{ marginTop: '2rem' }}>
      <div className="section-head-row">
        <div>
          <h2 style={{ fontSize: '1.3rem', margin: 0 }}>
            {unavailable ? `${dish.name} is unavailable right now` : 'Similar dishes'}
          </h2>
          <p>
            {unavailable
              ? 'Here is the closest thing on tonight’s menu.'
              : `Others our guests order instead of ${dish.name}.`}
          </p>
        </div>
      </div>

      <div className="rail">
        {items.map((item) => (
          <div key={item._id} className="rec-card">
            <FoodCard item={item} />
            <p className="rec-reason">
              💡 {item.reason}
              {item.priceDifference !== 0 && (
                <> · {item.priceDifference > 0 ? `₹${item.priceDifference} more` : `₹${Math.abs(item.priceDifference)} less`}</>
              )}
            </p>
          </div>
        ))}
      </div>

      {meta && (
        <p className="faint" style={{ marginBottom: 0 }}>
          Matched on category, ingredients and price — and never across a dietary line, so a
          vegetarian dish is only ever swapped for another one.
        </p>
      )}
    </section>
  );
}
