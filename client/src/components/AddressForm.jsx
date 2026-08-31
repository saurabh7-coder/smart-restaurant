import { useState } from 'react';
import { Alert, Field } from './ui.jsx';

export const BLANK_ADDRESS = {
  label: 'Home',
  line1: '',
  line2: '',
  landmark: '',
  city: '',
  pincode: '',
  lat: null,
  lng: null,
  accuracy: null,
  locationSource: null,
  directions: '',
};

const LABELS = ['Home', 'Work', 'Other'];

/**
 * Delivery address form, with an optional precise pin from the browser.
 *
 * The pin is what a rider actually navigates by — a typed address is often
 * ambiguous down a lane — and it is also what the delivery-radius check
 * measures. It stays optional on purpose: browsers can refuse the permission,
 * and nobody should be unable to order because they declined a prompt.
 */
export function AddressForm({ value, onChange, errors = {}, compact = false }) {
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState('');

  const set = (key) => (e) => onChange({ ...value, [key]: e.target.value });

  function useMyLocation() {
    setLocateError('');

    if (!navigator.geolocation) {
      setLocateError('This browser cannot share a location. Please type the address instead.');
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange({
          ...value,
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
          accuracy: Math.round(pos.coords.accuracy),
          locationSource: 'gps',
        });
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        // Each failure needs a different remedy, so name it rather than
        // showing one generic "could not get location".
        const reason =
          err.code === err.PERMISSION_DENIED
            ? 'Location permission was denied. You can still type the address below.'
            : err.code === err.POSITION_UNAVAILABLE
              ? 'Your location is unavailable right now. Please type the address below.'
              : 'Finding your location took too long. Please type the address below.';
        setLocateError(reason);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  }

  const hasPin = value.lat != null && value.lng != null;

  return (
    <div className="stack-sm">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="chip-row">
          {LABELS.map((l) => (
            <button
              key={l}
              type="button"
              className={`btn btn-sm ${value.label === l ? '' : 'btn-ghost'}`}
              onClick={() => onChange({ ...value, label: l })}
            >
              {l}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-soft btn-sm" onClick={useMyLocation} disabled={locating}>
          {locating ? 'Locating…' : '📍 Use my location'}
        </button>
      </div>

      {locateError && <Alert kind="warn">{locateError}</Alert>}

      {hasPin && (
        <div className="pin-chip">
          <span>
            📍 Pin saved
            {value.accuracy ? ` · accurate to about ${value.accuracy} m` : ''}
            {value.locationSource === 'gps' ? ' · from your device' : ''}
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() =>
              onChange({ ...value, lat: null, lng: null, accuracy: null, locationSource: null })
            }
          >
            Clear pin
          </button>
        </div>
      )}

      <Field label="House / flat and street" id="a-line1" error={errors.line1 || errors.deliveryAddress}>
        <input
          id="a-line1"
          value={value.line1}
          onChange={set('line1')}
          placeholder="12B, Rose Apartments, 4th Cross"
          required
        />
      </Field>

      {!compact && (
        <Field label="Area / locality (optional)" id="a-line2">
          <input id="a-line2" value={value.line2} onChange={set('line2')} placeholder="Indiranagar" />
        </Field>
      )}

      <div className="grid-2">
        <Field label="City" id="a-city" error={errors.city}>
          <input id="a-city" value={value.city} onChange={set('city')} placeholder="Bengaluru" required />
        </Field>
        <Field label="PIN code" id="a-pin" error={errors.pincode}>
          <input
            id="a-pin"
            value={value.pincode}
            onChange={set('pincode')}
            placeholder="560038"
            inputMode="numeric"
            maxLength={6}
            required
          />
        </Field>
      </div>

      <div className="grid-2">
        <Field label="Landmark (optional)" id="a-mark" hint="Helps the rider find you.">
          <input id="a-mark" value={value.landmark} onChange={set('landmark')} placeholder="Opposite the park" />
        </Field>
        <Field label="Directions for the rider (optional)" id="a-dir">
          <input
            id="a-dir"
            value={value.directions}
            onChange={set('directions')}
            placeholder="Second gate, ring the bell twice"
            maxLength={300}
          />
        </Field>
      </div>
    </div>
  );
}
