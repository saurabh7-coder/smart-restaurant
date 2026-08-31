import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { useRestaurant } from '../../context/RestaurantContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { Alert, Field, Spinner } from '../../components/ui.jsx';

export default function Settings() {
  const { restaurant, refresh } = useRestaurant();
  const toast = useToast();

  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = 'Settings — Admin';
  }, []);

  useEffect(() => {
    if (restaurant) {
      const { booking, _id, key, createdAt, updatedAt, __v, ...editable } = restaurant;
      setForm(editable);
    }
  }, [restaurant]);

  if (!form) return <Spinner />;

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const setDelivery = (key) => (e) =>
    setForm({ ...form, delivery: { ...(form.delivery || {}), [key]: e.target.value } });
  const setLoyalty = (key) => (e) =>
    setForm({ ...form, loyalty: { ...(form.loyalty || {}), [key]: e.target.value } });

  async function save(e) {
    e.preventDefault();
    setError('');
    setErrors({});
    setBusy(true);
    try {
      // GET /restaurant returns a computed `ordering` block (tax, hours, whether
      // payment is configured) for convenience. Only the three channel switches
      // are actually stored on the document, so send just those back.
      await api.updateRestaurant({
        ...form,
        avgSpendPerGuest: Number(form.avgSpendPerGuest),
        taxPercent: Number(form.taxPercent),
        minOrderValue: Number(form.minOrderValue),
        takeawayLeadMinutes: Number(form.takeawayLeadMinutes),
        lat: form.lat === '' || form.lat == null ? null : Number(form.lat),
        lng: form.lng === '' || form.lng == null ? null : Number(form.lng),
        delivery: {
          fee: Number(form.delivery?.fee ?? 0),
          freeAbove: Number(form.delivery?.freeAbove ?? 0),
          minOrderValue: Number(form.delivery?.minOrderValue ?? 0),
          radiusKm: Number(form.delivery?.radiusKm ?? 0),
          etaMinutes: Number(form.delivery?.etaMinutes ?? 0),
          codEnabled: form.delivery?.codEnabled !== false,
          codMaxOrderValue: Number(form.delivery?.codMaxOrderValue ?? 0),
        },
        loyalty: {
          enabled: form.loyalty?.enabled !== false,
          rupeesPerPoint: Number(form.loyalty?.rupeesPerPoint ?? 10),
          pointValue: Number(form.loyalty?.pointValue ?? 1),
          minRedeemPoints: Number(form.loyalty?.minRedeemPoints ?? 0),
          maxRedeemPercent: Number(form.loyalty?.maxRedeemPercent ?? 100),
          signupBonus: Number(form.loyalty?.signupBonus ?? 0),
        },
        ordering: {
          preOrderEnabled: form.ordering?.preOrderEnabled !== false,
          dineInEnabled: form.ordering?.dineInEnabled !== false,
          takeawayEnabled: form.ordering?.takeawayEnabled !== false,
          deliveryEnabled: form.ordering?.deliveryEnabled !== false,
        },
      });
      await refresh();
      toast.success('Settings saved.');
    } catch (err) {
      setError(err.message);
      setErrors(err.details || {});
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Restaurant settings</h1>
          <p>These details appear across the public site.</p>
        </div>
      </div>

      <form onSubmit={save} className="panel">
        <Alert kind="error">{error}</Alert>

        <Field label="Restaurant name" id="st-name" error={errors.name}>
          <input id="st-name" value={form.name} onChange={set('name')} required />
        </Field>

        <Field label="Tagline" id="st-tag">
          <input id="st-tag" value={form.tagline} onChange={set('tagline')} />
        </Field>

        <Field label="Description" id="st-desc">
          <textarea id="st-desc" maxLength={2000} value={form.description} onChange={set('description')} />
        </Field>

        <div className="grid-2">
          <Field label="Phone" id="st-phone">
            <input id="st-phone" value={form.phone} onChange={set('phone')} />
          </Field>
          <Field label="Email" id="st-email" error={errors.email}>
            <input id="st-email" type="email" value={form.email} onChange={set('email')} />
          </Field>
        </div>

        <Field label="Address" id="st-addr">
          <input id="st-addr" value={form.address} onChange={set('address')} />
        </Field>

        <div className="grid-2">
          <Field label="Opens at" id="st-open" error={errors.openTime} hint="Display only — see note below.">
            <input id="st-open" value={form.openTime} onChange={set('openTime')} placeholder="11:00" />
          </Field>
          <Field label="Closes at" id="st-close" error={errors.closeTime} hint="Display only — see note below.">
            <input id="st-close" value={form.closeTime} onChange={set('closeTime')} placeholder="23:00" />
          </Field>
        </div>

        <Alert kind="warn">
          <strong>Note:</strong> the times above are what customers see on the site. The bookable
          seating slots themselves come from <code>OPEN_TIME</code>, <code>CLOSE_TIME</code> and{' '}
          <code>SLOT_MINUTES</code> in <code>server/.env</code>, because changing the slot grid while
          bookings exist would strand those bookings off-grid. Change the .env values and restart the
          API to alter real availability.
        </Alert>

        <Field
          label="Average spend per guest (₹)"
          id="st-spend"
          error={errors.avgSpendPerGuest}
          hint="Used only for the estimated-revenue tile on the dashboard."
        >
          <input
            id="st-spend"
            type="number"
            min="0"
            value={form.avgSpendPerGuest}
            onChange={set('avgSpendPerGuest')}
          />
        </Field>

        <Field label="Google Maps embed URL" id="st-map" hint="Optional — shown on the contact page.">
          <input id="st-map" value={form.mapEmbedUrl} onChange={set('mapEmbedUrl')} />
        </Field>

        <fieldset>
          <legend>Food ordering</legend>

          <div className="grid-3">
            <Field
              label="GST / tax (%)"
              id="st-tax"
              error={errors.taxPercent}
              hint="Applied after any discount."
            >
              <input
                id="st-tax"
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={form.taxPercent ?? 5}
                onChange={set('taxPercent')}
              />
            </Field>

            <Field
              label="Minimum order (₹)"
              id="st-min"
              error={errors.minOrderValue}
              hint="0 = no minimum."
            >
              <input
                id="st-min"
                type="number"
                min="0"
                value={form.minOrderValue ?? 0}
                onChange={set('minOrderValue')}
              />
            </Field>

            <Field
              label="Takeaway lead time (min)"
              id="st-lead"
              error={errors.takeawayLeadMinutes}
              hint="Earliest collection from now."
            >
              <input
                id="st-lead"
                type="number"
                min="0"
                max="480"
                value={form.takeawayLeadMinutes ?? 30}
                onChange={set('takeawayLeadMinutes')}
              />
            </Field>
          </div>

          <p className="faint">Pause a channel without redeploying:</p>
          {[
            ['preOrderEnabled', 'Pre-ordering with a booking'],
            ['dineInEnabled', 'Dine-in ordering at the table'],
            ['takeawayEnabled', 'Takeaway collection orders'],
            ['deliveryEnabled', 'Delivery to the customer'],
          ].map(([key, label]) => (
            <div className="checkline" key={key}>
              <input
                id={`st-${key}`}
                type="checkbox"
                checked={form.ordering?.[key] !== false}
                onChange={(e) =>
                  setForm({
                    ...form,
                    ordering: { ...(form.ordering || {}), [key]: e.target.checked },
                  })
                }
              />
              <label htmlFor={`st-${key}`}>{label}</label>
            </div>
          ))}

          <Alert kind={restaurant?.ordering?.onlinePaymentEnabled ? 'ok' : 'info'}>
            {restaurant?.ordering?.onlinePaymentEnabled ? (
              <>
                <strong>Online payment is live</strong> via Razorpay. Customers can pay by card, UPI,
                netbanking or wallet.
              </>
            ) : (
              <>
                <strong>Online payment is off.</strong> Every order is pay-at-restaurant. To enable
                it, set <code>PAYMENT_PROVIDER=razorpay</code> plus your key id and secret in{' '}
                <code>server/.env</code> and restart the API. Keys are never editable from this
                screen — secrets belong in the environment, not the database.
              </>
            )}
          </Alert>
        </fieldset>

        <fieldset>
          <legend>Loyalty</legend>

          <div className="checkline">
            <input
              id="l-on"
              type="checkbox"
              checked={form.loyalty?.enabled !== false}
              onChange={(e) =>
                setForm({ ...form, loyalty: { ...(form.loyalty || {}), enabled: e.target.checked } })
              }
            />
            <label htmlFor="l-on">Run a loyalty points scheme</label>
          </div>

          <div className="grid-3">
            <Field label="₹ per point earned" id="l-per" error={errors['loyalty.rupeesPerPoint']}>
              <input id="l-per" type="number" min="1" value={form.loyalty?.rupeesPerPoint ?? 10}
                onChange={setLoyalty('rupeesPerPoint')} />
            </Field>
            <Field label="₹ a point is worth" id="l-val" error={errors['loyalty.pointValue']}>
              <input id="l-val" type="number" min="0" step="0.5" value={form.loyalty?.pointValue ?? 1}
                onChange={setLoyalty('pointValue')} />
            </Field>
            <Field label="Minimum to redeem" id="l-min" error={errors['loyalty.minRedeemPoints']}>
              <input id="l-min" type="number" min="0" value={form.loyalty?.minRedeemPoints ?? 0}
                onChange={setLoyalty('minRedeemPoints')} />
            </Field>
          </div>

          <Field
            label="Points may cover at most (% of a bill)"
            id="l-max"
            hint="Stops a bill being paid entirely in points."
            error={errors['loyalty.maxRedeemPercent']}
          >
            <input id="l-max" type="number" min="0" max="100" value={form.loyalty?.maxRedeemPercent ?? 100}
              onChange={setLoyalty('maxRedeemPercent')} />
          </Field>

          <Alert kind="info">
            Points are earned on the <strong>food value</strong> — after any discount, before tax and
            delivery — and are awarded when the order is handed over, not when it is placed. A
            cancelled order therefore never earns, and any points spent on it are returned. Tiers
            come from lifetime points, so redeeming never demotes a customer.
          </Alert>
        </fieldset>

        <fieldset>
          <legend>Delivery</legend>

          <div className="grid-3">
            <Field label="Delivery fee (₹)" id="d-fee" error={errors['delivery.fee']}>
              <input
                id="d-fee"
                type="number"
                min="0"
                value={form.delivery?.fee ?? 0}
                onChange={setDelivery('fee')}
              />
            </Field>
            <Field
              label="Free above (₹)"
              id="d-free"
              hint="0 = never free"
              error={errors['delivery.freeAbove']}
            >
              <input
                id="d-free"
                type="number"
                min="0"
                value={form.delivery?.freeAbove ?? 0}
                onChange={setDelivery('freeAbove')}
              />
            </Field>
            <Field
              label="Minimum order (₹)"
              id="d-min"
              hint="Usually higher than for collection."
              error={errors['delivery.minOrderValue']}
            >
              <input
                id="d-min"
                type="number"
                min="0"
                value={form.delivery?.minOrderValue ?? 0}
                onChange={setDelivery('minOrderValue')}
              />
            </Field>
          </div>

          <div className="grid-2">
            <Field
              label="Delivery radius (km)"
              id="d-rad"
              hint="Straight-line. Set it tighter than your real road range."
              error={errors['delivery.radiusKm']}
            >
              <input
                id="d-rad"
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={form.delivery?.radiusKm ?? 0}
                onChange={setDelivery('radiusKm')}
              />
            </Field>
            <Field label="Typical delivery time (min)" id="d-eta" error={errors['delivery.etaMinutes']}>
              <input
                id="d-eta"
                type="number"
                min="0"
                max="240"
                value={form.delivery?.etaMinutes ?? 0}
                onChange={setDelivery('etaMinutes')}
              />
            </Field>
          </div>

          <div className="grid-2">
            <Field label="Restaurant latitude" id="d-lat" error={errors.lat}>
              <input
                id="d-lat"
                type="number"
                step="0.000001"
                value={form.lat ?? ''}
                onChange={set('lat')}
                placeholder="12.971599"
              />
            </Field>
            <Field label="Restaurant longitude" id="d-lng" error={errors.lng}>
              <input
                id="d-lng"
                type="number"
                step="0.000001"
                value={form.lng ?? ''}
                onChange={set('lng')}
                placeholder="77.594566"
              />
            </Field>
          </div>

          <div className="checkline">
            <input
              id="d-cod"
              type="checkbox"
              checked={form.delivery?.codEnabled !== false}
              onChange={(e) =>
                setForm({
                  ...form,
                  delivery: { ...(form.delivery || {}), codEnabled: e.target.checked },
                })
              }
            />
            <label htmlFor="d-cod">Accept cash on delivery</label>
          </div>

          <Field
            label="Cash on delivery limit (₹)"
            id="d-codmax"
            hint="0 = no limit. Caps how much cash a rider carries."
            error={errors['delivery.codMaxOrderValue']}
          >
            <input
              id="d-codmax"
              type="number"
              min="0"
              value={form.delivery?.codMaxOrderValue ?? 0}
              onChange={setDelivery('codMaxOrderValue')}
            />
          </Field>

          <Alert kind={form.lat != null && form.lng != null ? 'ok' : 'warn'}>
            {form.lat != null && form.lng != null ? (
              <>
                <strong>Radius checking is on.</strong> Addresses further than{' '}
                {form.delivery?.radiusKm} km from this point are refused at checkout.
              </>
            ) : (
              <>
                <strong>No restaurant coordinates set.</strong> Without them there is nothing to
                measure against, so the delivery radius cannot be enforced and any address is
                accepted. Paste your own latitude and longitude from Google Maps above.
              </>
            )}
          </Alert>
        </fieldset>

        <button type="submit" className="btn" disabled={busy}>
          {busy ? 'Saving…' : 'Save settings'}
        </button>
      </form>
    </>
  );
}
