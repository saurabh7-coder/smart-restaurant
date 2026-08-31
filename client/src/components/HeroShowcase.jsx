import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../context/CartContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { money } from '../utils/format.js';
import { Stars } from './ui.jsx';

const ROTATE_MS = 4500;

/**
 * The hero: a live dish spotlight the guest can actually use.
 *
 * ── Why this replaced the scrolling collage ──────────────────────────────────
 * The previous hero was a wall of dish photos drifting behind a dark scrim. It
 * looked busy, but it was `aria-hidden` and `pointer-events: none` — decoration
 * with nothing to do. Worse, the scrim that made the headline readable also
 * dimmed the food to near-silhouettes, so the one thing a restaurant home page
 * exists to show was the thing you could not see.
 *
 * This shows one dish at a time, undimmed and large, with its name, rating and
 * price, and two things to do about it: add it to the cart, or open it. It
 * advances on its own so the page feels alive, and every part of that is
 * interruptible — hovering, focusing, or picking a thumbnail hands control to
 * the guest, which is the difference between a showcase and a carousel that
 * yanks the content away mid-read.
 */
export function HeroShowcase({ dishes = [] }) {
  const cart = useCart();
  const toast = useToast();

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const stage = useRef(null);

  // Honour the OS setting: no auto-advance and no tilt for anyone who has asked
  // for less motion. They can still step through the dishes themselves.
  const reducedMotion = useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  const items = useMemo(() => dishes.filter((d) => d?.image).slice(0, 6), [dishes]);
  const active = items[index];

  const go = useCallback(
    (next) => setIndex((cur) => (next + items.length) % items.length),
    [items.length],
  );

  /* ---- auto-advance ---- */
  useEffect(() => {
    if (paused || reducedMotion || items.length < 2) return undefined;
    const id = setTimeout(() => go(index + 1), ROTATE_MS);
    return () => clearTimeout(id);
  }, [index, paused, reducedMotion, items.length, go]);

  /* ---- preload the next photo so the crossfade never flashes a gap ---- */
  useEffect(() => {
    const next = items[(index + 1) % items.length];
    if (next?.image) {
      const img = new Image();
      img.src = next.image;
    }
  }, [index, items]);

  /* ---- pointer parallax ---- */
  function handleMove(e) {
    if (reducedMotion || !stage.current) return;
    const box = stage.current.getBoundingClientRect();
    // -1..1 from the centre, so the plate leans towards the cursor.
    const x = (e.clientX - box.left) / box.width - 0.5;
    const y = (e.clientY - box.top) / box.height - 0.5;
    setTilt({ x: x * 16, y: y * -16 });
  }

  if (items.length === 0) return null;

  function addActive() {
    cart.add(active, 1);
    toast.success(`${active.name} added to your cart.`);
  }

  return (
    <div
      className="hero-stage"
      ref={stage}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => {
        setPaused(false);
        setTilt({ x: 0, y: 0 });
      }}
      onMouseMove={handleMove}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {/* The plate. Every dish is stacked and cross-faded, so there is no
          unmounting flicker and the browser keeps all of them decoded. */}
      <div
        className="hero-plate"
        style={{ transform: `perspective(900px) rotateY(${tilt.x}deg) rotateX(${tilt.y}deg)` }}
      >
        {items.map((dish, i) => (
          <img
            key={dish._id}
            src={dish.image}
            alt={i === index ? dish.name : ''}
            aria-hidden={i !== index}
            className={i === index ? 'is-active' : ''}
            loading={i === 0 ? 'eager' : 'lazy'}
            decoding="async"
          />
        ))}

        <span className="hero-plate-ring" aria-hidden="true" />
      </div>

      {/* The details, announced politely so a screen reader hears the dish
          change without the rotation interrupting whatever is being read. */}
      <div className="hero-details" aria-live="polite">
        <h2>
          <span className={`food-dot ${active.foodType}`} aria-hidden="true" />
          <Link to={`/menu/${active._id}`}>{active.name}</Link>
        </h2>
        <div className="hero-details-meta">
          <strong>{money(active.price)}</strong>
          {active.rating?.count > 0 && <Stars value={active.rating.average} count={active.rating.count} />}
        </div>
        <div className="hero-details-actions">
          <button type="button" className="btn btn-sm" onClick={addActive}>
            Add to cart
          </button>
          <Link to={`/menu/${active._id}`} className="btn btn-ghost btn-sm">
            See the dish
          </Link>
        </div>
      </div>

      {/* Thumbnails double as the progress indicator: the active one fills over
          the rotation interval, so the wait is visible rather than a surprise. */}
      <div className="hero-thumbs" role="tablist" aria-label="Featured dishes">
        {items.map((dish, i) => (
          <button
            key={dish._id}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={dish.name}
            title={dish.name}
            className={i === index ? 'is-active' : ''}
            onClick={() => setIndex(i)}
          >
            <img src={dish.image} alt="" loading="lazy" decoding="async" />
            {i === index && !paused && !reducedMotion && (
              <span
                className="hero-thumb-progress"
                style={{ animationDuration: `${ROTATE_MS}ms` }}
                aria-hidden="true"
              />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
