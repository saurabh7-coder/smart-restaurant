import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useCart } from '../context/CartContext.jsx';
import { Field } from '../components/ui.jsx';

/**
 * Promo code entry, shared by the cart and the checkout page so a customer can
 * apply or remove a code from either — and sees the same behaviour in both.
 *
 * The code is stored on the cart (and therefore persisted), not in navigation
 * state, so it survives a refresh. `onApplied` lets the parent re-price.
 */
export function PromoCode({ onApplied, appliedOffer }) {
  const { offerCode, setOfferCode, toPayload, isEmpty } = useCart();
  const [draft, setDraft] = useState(offerCode);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Keep the box in step if the code is cleared elsewhere (e.g. cart emptied).
  useEffect(() => setDraft(offerCode), [offerCode]);

  async function apply(e) {
    e.preventDefault();
    setError('');

    const code = draft.trim().toUpperCase();
    if (!code) {
      setError('Enter a promo code first.');
      return;
    }
    if (isEmpty) {
      setError('Add something to your cart before applying a code.');
      return;
    }

    setBusy(true);
    try {
      // Validated against the real cart, so a code with a minimum-spend or
      // party-size rule fails here rather than at the moment of ordering.
      const res = await api.quoteOrder({ items: toPayload(), offerCode: code });
      setOfferCode(code);
      onApplied?.(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeCode() {
    setError('');
    setBusy(true);
    try {
      const res = await api.quoteOrder({ items: toPayload() });
      setOfferCode('');
      setDraft('');
      onApplied?.(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (offerCode && appliedOffer) {
    return (
      <div className="promo-applied">
        <div>
          <strong>{appliedOffer.code}</strong> applied
          {appliedOffer.description && <div className="faint">{appliedOffer.description}</div>}
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={removeCode} disabled={busy}>
          Remove
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={apply}>
      <Field label="Promo code" id="promo" error={error}>
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <input
            id="promo"
            value={draft}
            placeholder="e.g. WELCOME25"
            autoComplete="off"
            style={{ flex: 1, textTransform: 'uppercase' }}
            onChange={(e) => {
              setDraft(e.target.value);
              setError('');
            }}
          />
          <button type="submit" className="btn btn-ghost" disabled={busy}>
            {busy ? '…' : 'Apply'}
          </button>
        </div>
      </Field>
    </form>
  );
}
