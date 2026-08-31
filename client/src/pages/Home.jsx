import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { useRestaurant } from '../context/RestaurantContext.jsx';
import { FoodCard } from '../components/FoodCard.jsx';
import { HeroShowcase } from '../components/HeroShowcase.jsx';
import { HeroInvite } from '../components/HeroInvite.jsx';
import { Spinner, Stars } from '../components/ui.jsx';
import { Recommendations } from '../components/Recommendations.jsx';
import { formatClock, formatDate, money } from '../utils/format.js';

const CATEGORY_GLYPH = {
  Starters: '🥟',
  Soups: '🍲',
  Salads: '🥗',
  'Main Course': '🍛',
  Biryani: '🍚',
  Pizza: '🍕',
  Burger: '🍔',
  Pasta: '🍝',
  Breads: '🫓',
  'Rice & Noodles': '🍜',
  Desserts: '🍮',
  Beverages: '🥤',
};

/** Section header with an optional "see all" link. */
function SectionHead({ title, sub, to, linkLabel = 'See all' }) {
  return (
    <div className="section-head-row">
      <div>
        <h2>{title}</h2>
        {sub && <p>{sub}</p>}
      </div>
      {to && (
        <Link to={to} className="btn btn-ghost btn-sm">
          {linkLabel} →
        </Link>
      )}
    </div>
  );
}

export default function Home() {
  const { restaurant } = useRestaurant();
  const [menu, setMenu] = useState([]);
  const [categories, setCategories] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = `${restaurant?.name || 'Delicious Adda'} — Menu & Reservations`;
  }, [restaurant]);

  useEffect(() => {
    let cancelled = false;

    // One full-menu fetch feeds every section below. Slicing it locally is far
    // cheaper than a separate round trip per row, and keeps the sections
    // consistent with each other.
    Promise.all([
      api.getMenu({ limit: 120, sort: 'popular' }),
      api.getCategories(),
      api.getReviews({ limit: 8 }),
    ])
      .then(([m, c, r]) => {
        if (cancelled) return;
        setMenu(m.data);
        setCategories(c.data);
        setReviews(r.data.filter((review) => review.comment));
      })
      .catch(() => {
        /* the page still renders its static sections without these */
      })
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, []);

  const sections = useMemo(() => {
    const byRating = [...menu].sort(
      (a, b) => (b.rating?.average || 0) - (a.rating?.average || 0),
    );

    // A representative photo per category, taken from its own dishes.
    const thumbs = new Map();
    for (const dish of menu) {
      const name = dish.category?.name;
      if (name && dish.image && !thumbs.has(name)) thumbs.set(name, dish.image);
    }

    const counts = new Map();
    for (const dish of menu) {
      const name = dish.category?.name;
      if (name) counts.set(name, (counts.get(name) || 0) + 1);
    }

    return {
      // The spotlight leads with today's specials, topped up with the most
      // popular dishes — what the kitchen wants seen, then what sells.
      spotlight: [
        ...menu.filter((d) => d.isTodaysSpecial && d.image),
        ...menu.filter((d) => d.isPopular && d.image && !d.isTodaysSpecial),
        ...menu.filter((d) => d.image),
      ]
        .filter((d, i, arr) => arr.findIndex((x) => x._id === d._id) === i)
        .slice(0, 6),
      specials: menu.filter((d) => d.isTodaysSpecial).slice(0, 8),
      popular: menu.filter((d) => d.isPopular).slice(0, 10),
      chefsPicks: byRating.filter((d) => (d.rating?.count || 0) > 0).slice(0, 10),
      quickBites: [...menu].filter((d) => d.price <= 200).sort((a, b) => a.price - b.price).slice(0, 10),
      plantBased: menu.filter((d) => d.foodType === 'vegan').slice(0, 10),
      categories: categories
        .filter((c) => counts.get(c.name))
        .map((c) => ({ ...c, image: thumbs.get(c.name), count: counts.get(c.name) })),
    };
  }, [menu, categories]);

  return (
    <>
      <section className={`hero${sections.spotlight.length ? ' hero-split' : ''}`}>
        <div className="container">
          <HeroInvite />

          <HeroShowcase dishes={sections.spotlight} />
        </div>
      </section>

      {loading ? (
        <Spinner />
      ) : (
        <>
          {/* ---------- browse by category ---------- */}
          {sections.categories.length > 0 && (
            <section className="section">
              <div className="container">
                <SectionHead
                  title="What are you in the mood for?"
                  sub={`${menu.length} dishes across ${sections.categories.length} categories`}
                  to="/menu"
                  linkLabel="Full menu"
                />
                <div className="category-rail">
                  {sections.categories.map((c) => (
                    <Link key={c._id} to={`/menu?category=${c._id}`} className="category-tile">
                      <div className="category-thumb">
                        {c.image ? (
                          <img src={c.image} alt="" loading="lazy" />
                        ) : (
                          <span aria-hidden="true">{CATEGORY_GLYPH[c.name] || '🍽️'}</span>
                        )}
                      </div>
                      <strong>{c.name}</strong>
                      <small>{c.count} dishes</small>
                    </Link>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* ---------- recommended ---------- */}
          <Recommendations limit={8} />

          {/* ---------- today's specials ---------- */}
          {sections.specials.length > 0 && (
            <section className="section" style={{ background: 'var(--surface-2)' }}>
              <div className="container">
                <SectionHead
                  title="Today's specials"
                  sub="Chosen by the kitchen this morning."
                  to="/menu?special=true"
                />
                <div className="grid-food">
                  {sections.specials.map((item) => (
                    <FoodCard key={item._id} item={item} />
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* ---------- popular ---------- */}
          {sections.popular.length > 0 && (
            <section className="section">
              <div className="container">
                <SectionHead
                  title="Popular dishes"
                  sub="What our regulars order most."
                  to="/menu?popular=true"
                />
                <div className="rail">
                  {sections.popular.map((item) => (
                    <FoodCard key={item._id} item={item} />
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* ---------- chef's picks ---------- */}
          {sections.chefsPicks.length > 0 && (
            <section className="section" style={{ background: 'var(--surface-2)' }}>
              <div className="container">
                <SectionHead
                  title="Highest rated"
                  sub="Ranked by what guests actually scored them."
                  to="/menu?sort=rating"
                />
                <div className="rail">
                  {sections.chefsPicks.map((item) => (
                    <FoodCard key={item._id} item={item} />
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* ---------- plant based ---------- */}
          {sections.plantBased.length > 0 && (
            <section className="section">
              <div className="container">
                <SectionHead
                  title="Plant based"
                  sub="Fully vegan, no dairy — labelled on every dish."
                  to="/menu?foodType=vegan"
                />
                <div className="rail">
                  {sections.plantBased.map((item) => (
                    <FoodCard key={item._id} item={item} />
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* ---------- value ---------- */}
          {sections.quickBites.length > 0 && (
            <section className="section" style={{ background: 'var(--surface-2)' }}>
              <div className="container">
                <SectionHead
                  title={`Light bites under ${money(200)}`}
                  sub="Breads, sides and drinks to round out the table."
                  to="/menu?maxPrice=200&sort=price_asc"
                />
                <div className="rail">
                  {sections.quickBites.map((item) => (
                    <FoodCard key={item._id} item={item} />
                  ))}
                </div>
              </div>
            </section>
          )}
        </>
      )}

      <section className="section">
        <div className="container">
          <div className="section-head">
            <h2>Why book with us</h2>
          </div>
          <div className="grid-3">
            <div className="feature">
              <div className="emoji">🪑</div>
              <h3>Real table availability</h3>
              <p className="muted">
                You see exactly which tables are free — and a booked table can never be given away
                twice.
              </p>
            </div>
            <div className="feature">
              <div className="emoji">🥡</div>
              <h3>Order how you like</h3>
              <p className="muted">
                Pre-order for your booking, order from the table, or take it away — the kitchen sees
                it either way.
              </p>
            </div>
            <div className="feature">
              <div className="emoji">⚡</div>
              <h3>Change plans freely</h3>
              <p className="muted">
                Move or cancel your booking yourself, any time before your seating slot begins.
              </p>
            </div>
          </div>
        </div>
      </section>

      {reviews.length > 0 && (
        <section className="section" style={{ background: 'var(--surface-2)' }}>
          <div className="container">
            <div className="section-head">
              <h2>What guests say</h2>
            </div>
            <div className="grid">
              {reviews.slice(0, 3).map((review) => (
                <div key={review._id} className="panel">
                  <Stars value={review.rating} />
                  <p style={{ marginTop: '0.75rem' }}>“{review.comment}”</p>
                  <p className="faint" style={{ margin: 0 }}>
                    {review.user?.name || 'Guest'} · {formatDate(review.createdAt)}
                    {review.menuItem?.name ? ` · on ${review.menuItem.name}` : ''}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="section">
        <div className="container grid-2">
          <div className="panel">
            <h3>Opening hours</h3>
            <p className="muted">
              Open daily from <strong>{formatClock(restaurant?.openTime || '11:00')}</strong> to{' '}
              <strong>{formatClock(restaurant?.closeTime || '23:00')}</strong>.
            </p>
            {restaurant?.booking && (
              <>
                <p className="muted" style={{ marginBottom: '0.5rem' }}>
                  Seatings are {restaurant.booking.slotMinutes} minutes long:
                </p>
                <div className="chip-row">
                  {restaurant.booking.slots.map((s) => (
                    <span key={s.time} className="badge">
                      {s.label}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="panel">
            <h3>Find us</h3>
            <p className="muted">{restaurant?.address || 'Address coming soon.'}</p>
            <p className="muted">
              {restaurant?.phone} · {restaurant?.email}
            </p>
            <Link to="/contact" className="btn btn-ghost btn-sm">
              Contact &amp; directions
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
