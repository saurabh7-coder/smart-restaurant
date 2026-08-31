import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { useToast } from '../../context/ToastContext.jsx';
import { Alert, ConfirmDialog, EmptyState, Field, Modal, Spinner } from '../../components/ui.jsx';
import { formatDate, money, toDateInput, addDays } from '../../utils/format.js';

const BLANK = {
  code: '',
  description: '',
  discountType: 'percent',
  discountValue: 10,
  minGuests: 1,
  startDate: toDateInput(),
  endDate: addDays(30),
  usageLimit: '',
  perCustomerLimit: 1,
  isActive: true,
};

/**
 * Why a code is or isn't currently usable.
 *
 * "Active" alone is misleading: an offer can be active, in date, and still
 * refuse every customer because it has run out of uses or has not started yet.
 * Showing the real reason here saves guessing at the customer's error message.
 */
function statusBadge(offer) {
  const now = Date.now();

  if (!offer.isActive) return <span className="badge badge-danger">Inactive</span>;
  if (offer.usageLimit !== null && offer.usedCount >= offer.usageLimit) {
    return (
      <span className="badge badge-danger" title="Every customer is now refused this code">
        Limit reached
      </span>
    );
  }
  if (new Date(offer.startDate).getTime() > now) {
    return <span className="badge badge-warn">Not started</span>;
  }
  if (new Date(offer.endDate).getTime() < now) {
    return <span className="badge badge-danger">Expired</span>;
  }
  return <span className="badge badge-ok">Active</span>;
}

export default function OfferManage() {
  const toast = useToast();

  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api
      .getOffers()
      .then((res) => setOffers(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    document.title = 'Offers — Admin';
    load();
  }, [load]);

  async function remove() {
    setBusy(true);
    try {
      await api.deleteOffer(deleting._id);
      toast.success('Offer deleted.');
      setDeleting(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner />;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Offers &amp; coupons</h1>
          <p>{offers.length} promo codes</p>
        </div>
        <button type="button" className="btn" onClick={() => setEditing({ ...BLANK })}>
          + New offer
        </button>
      </div>

      <Alert kind="error">{error}</Alert>

      {offers.some((o) => o.usageLimit !== null && o.usedCount >= o.usageLimit) && (
        <Alert kind="warn">
          <strong>One or more codes have reached their usage limit</strong> and are now being refused
          for every customer. Raise or clear the <em>Usage limit</em> on those offers to make them
          work again — leave it blank for unlimited.
        </Alert>
      )}

      <Alert kind="info">
        A promo code discounts a food order, and can also be attached to a table booking as a record
        of entitlement (a booking has no bill of its own). Each order that uses a code consumes one
        of its uses; cancelling that order gives the use back.
      </Alert>

      {offers.length === 0 ? (
        <EmptyState emoji="🎁" title="No offers yet" />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Discount</th>
                <th>Conditions</th>
                <th>Valid</th>
                <th>Used</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {offers.map((o) => (
                <tr key={o._id}>
                  <td>
                    <code>{o.code}</code>
                    <div className="faint">{o.description}</div>
                  </td>
                  <td className="nowrap">
                    {o.discountType === 'percent' ? `${o.discountValue}%` : money(o.discountValue)}
                  </td>
                  <td className="nowrap">
                    Min {o.minGuests} guests
                    <div className="faint">
                      {o.perCustomerLimit ? `${o.perCustomerLimit} per customer` : "unlimited per customer"}
                    </div>
                  </td>
                  <td className="nowrap">
                    {formatDate(o.startDate)}
                    <div className="faint">to {formatDate(o.endDate)}</div>
                  </td>
                  <td>
                    {o.usedCount}
                    {o.usageLimit ? ` / ${o.usageLimit}` : ''}
                  </td>
                  <td>{statusBadge(o)}</td>
                  <td className="nowrap">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() =>
                        setEditing({
                          ...o,
                          startDate: toDateInput(o.startDate),
                          endDate: toDateInput(o.endDate),
                          usageLimit: o.usageLimit ?? '',
                          perCustomerLimit: o.perCustomerLimit ?? '',
                        })
                      }
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => setDeleting(o)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <OfferModal
          offer={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete this offer?"
          message={`Promo code ${deleting.code} will stop working immediately.`}
          confirmLabel="Delete"
          danger
          busy={busy}
          onCancel={() => setDeleting(null)}
          onConfirm={remove}
        />
      )}
    </>
  );
}

function OfferModal({ offer, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(offer);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const isNew = !offer._id;
  const set = (key) => (e) =>
    setForm({ ...form, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function save(e) {
    e.preventDefault();
    setError('');
    setErrors({});
    setBusy(true);
    try {
      const payload = {
        code: form.code.toUpperCase().trim(),
        description: form.description,
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
        minGuests: Number(form.minGuests),
        startDate: form.startDate,
        endDate: form.endDate,
        usageLimit: form.usageLimit === '' ? null : Number(form.usageLimit),
        perCustomerLimit: form.perCustomerLimit === '' ? null : Number(form.perCustomerLimit),
        isActive: form.isActive,
      };
      if (isNew) await api.createOffer(payload);
      else await api.updateOffer(offer._id, payload);
      toast.success(isNew ? 'Offer created.' : 'Offer updated.');
      onSaved();
    } catch (err) {
      setError(err.message);
      setErrors(err.details || {});
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={isNew ? 'New offer' : `Edit ${offer.code}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="offer-form" className="btn" disabled={busy}>
            {busy ? 'Saving…' : 'Save offer'}
          </button>
        </>
      }
    >
      <form id="offer-form" onSubmit={save}>
        <Alert kind="error">{error}</Alert>

        <Field label="Code" id="o-code" error={errors.code} hint="Shown to customers, e.g. WELCOME10">
          <input
            id="o-code"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
            required
          />
        </Field>

        <Field label="Description" id="o-desc">
          <input id="o-desc" maxLength={300} value={form.description} onChange={set('description')} />
        </Field>

        <div className="grid-3">
          <Field label="Type" id="o-type">
            <select id="o-type" value={form.discountType} onChange={set('discountType')}>
              <option value="percent">Percentage</option>
              <option value="flat">Flat amount</option>
            </select>
          </Field>
          <Field label="Value" id="o-val" error={errors.discountValue}>
            <input id="o-val" type="number" min="0" value={form.discountValue} onChange={set('discountValue')} required />
          </Field>
          <Field label="Min guests" id="o-min">
            <input id="o-min" type="number" min="1" value={form.minGuests} onChange={set('minGuests')} />
          </Field>
        </div>

        <div className="grid-2">
          <Field label="Starts" id="o-start" error={errors.startDate}>
            <input id="o-start" type="date" value={form.startDate} onChange={set('startDate')} required />
          </Field>
          <Field label="Ends" id="o-end" error={errors.endDate}>
            <input id="o-end" type="date" value={form.endDate} onChange={set('endDate')} required />
          </Field>
        </div>

        <div className="grid-2">
          <Field
            label="Per-customer limit"
            id="o-per"
            hint="1 = each customer may use it once. Blank = unlimited."
          >
            <input
              id="o-per"
              type="number"
              min="1"
              value={form.perCustomerLimit}
              onChange={set('perCustomerLimit')}
            />
          </Field>
          <Field
            label="Total uses (all customers)"
            id="o-limit"
            hint="Blank = unlimited. Only for genuinely scarce offers."
          >
            <input id="o-limit" type="number" min="1" value={form.usageLimit} onChange={set('usageLimit')} />
          </Field>
        </div>

        <Alert kind="info">
          For a welcome offer, set <strong>per-customer limit to 1</strong> and leave the total
          blank — every customer then gets it once. Setting a small <em>total</em> instead means the
          first few customers use it up and everyone after them is refused.
        </Alert>

        <div className="checkline">
          <input id="o-active" type="checkbox" checked={form.isActive} onChange={set('isActive')} />
          <label htmlFor="o-active">Offer is active</label>
        </div>
      </form>
    </Modal>
  );
}
