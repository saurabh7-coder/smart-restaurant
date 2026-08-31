import { useEffect, useState } from 'react';
import { formatClock } from '../utils/format.js';
import { Link } from 'react-router-dom';
import { useRestaurant } from '../context/RestaurantContext.jsx';
import { Alert, Field } from '../components/ui.jsx';

export default function Contact() {
  const { restaurant } = useRestaurant();
  const [sent, setSent] = useState(false);

  useEffect(() => {
    document.title = 'Contact — Delicious Adda';
  }, []);

  return (
    <div className="container page">
      <h1>Contact us</h1>
      <p className="muted">For bookings, use the reservation page — it is instant.</p>

      <div className="grid-2" style={{ marginTop: '1.5rem', alignItems: 'start' }}>
        <div className="panel">
          <h3>Get in touch</h3>
          <p className="muted">
            <strong>Address</strong>
            <br />
            {restaurant?.address || '—'}
          </p>
          <p className="muted">
            <strong>Phone</strong>
            <br />
            {restaurant?.phone || '—'}
          </p>
          <p className="muted">
            <strong>Email</strong>
            <br />
            {restaurant?.email || '—'}
          </p>
          <p className="muted">
            <strong>Hours</strong>
            <br />
            Daily {formatClock(restaurant?.openTime)} – {formatClock(restaurant?.closeTime)}
          </p>

          <Link to="/reservation" className="btn">
            Reserve a table
          </Link>
        </div>

        <div className="panel">
          <h3>Send a message</h3>

          {sent ? (
            <Alert kind="ok">
              Thanks — your message has been noted. Please call us for anything urgent.
            </Alert>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setSent(true);
              }}
            >
              <Field label="Your name" id="c-name">
                <input id="c-name" required />
              </Field>
              <Field label="Email" id="c-email">
                <input id="c-email" type="email" required />
              </Field>
              <Field label="Message" id="c-message">
                <textarea id="c-message" required maxLength={800} />
              </Field>
              <button type="submit" className="btn">
                Send message
              </button>
            </form>
          )}

          <p className="faint" style={{ marginTop: '1rem', marginBottom: 0 }}>
            Note: this contact form is a front-end demonstration only — messages are not stored or
            emailed anywhere. Reservations, by contrast, are fully functional.
          </p>
        </div>
      </div>

      {restaurant?.mapEmbedUrl && (
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <iframe
            title="Restaurant location"
            src={restaurant.mapEmbedUrl}
            style={{ width: '100%', height: 320, border: 0 }}
            loading="lazy"
          />
        </div>
      )}
    </div>
  );
}
