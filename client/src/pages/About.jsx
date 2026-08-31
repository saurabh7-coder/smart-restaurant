import { useEffect } from 'react';
import { formatClock } from '../utils/format.js';
import { Link } from 'react-router-dom';
import { useRestaurant } from '../context/RestaurantContext.jsx';

export default function About() {
  const { restaurant } = useRestaurant();

  useEffect(() => {
    document.title = 'About us — Delicious Adda';
  }, []);

  return (
    <div className="container page">
      <h1>About {restaurant?.name || 'us'}</h1>
      <p className="lede muted" style={{ maxWidth: '60ch' }}>
        {restaurant?.description ||
          'A neighbourhood kitchen serving food cooked to order, with a digital menu and online table booking.'}
      </p>

      <div className="grid-3" style={{ marginTop: '2rem' }}>
        <div className="panel">
          <h3>🕐 Opening hours</h3>
          <p className="muted">
            Every day, {formatClock(restaurant?.openTime || '11:00')} – {formatClock(restaurant?.closeTime || '23:00')}
          </p>
          {restaurant?.booking && (
            <p className="faint">
              Seatings run in {restaurant.booking.slotMinutes}-minute sittings, so every table gets
              the same unhurried service.
            </p>
          )}
        </div>

        <div className="panel">
          <h3>📍 Where to find us</h3>
          <p className="muted">{restaurant?.address || 'Address coming soon.'}</p>
          <p className="muted">{restaurant?.phone}</p>
        </div>

        <div className="panel">
          <h3>🌱 Dietary needs</h3>
          <p className="muted">
            Every dish is labelled veg, non-veg or vegan, and lists its ingredients and declared
            allergens. Tell us about allergies when you book.
          </p>
        </div>
      </div>

      <section className="panel" style={{ marginTop: '2rem' }}>
        <h2>About this project</h2>
        <p className="muted">
          This site is a full-stack demonstration of a restaurant menu and reservation system: a
          React frontend, an Express REST API, and MongoDB. The reservation engine enforces its
          no-double-booking rule at the database level, so two guests can never be given the same
          table for the same sitting — even if they press “Confirm” at the same instant.
        </p>
        <p className="faint">
          All restaurant details, dishes, prices and reviews shown here are fictional demo data.
        </p>
        <Link to="/reservation" className="btn">
          Try booking a table
        </Link>
      </section>
    </div>
  );
}
