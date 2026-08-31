import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Alert, ConfirmDialog, EmptyState, Field, Modal, Stars } from '../components/ui.jsx';
import { AddressForm, BLANK_ADDRESS } from '../components/AddressForm.jsx';
import { LoyaltyCard } from '../components/LoyaltyCard.jsx';
import { AllergyPicker } from '../components/AllergyPicker.jsx';
import { RateWhatYouAte } from '../components/RateWhatYouAte.jsx';
import { formatAddress, formatDate, initials, mapLink } from '../utils/format.js';

export default function Profile() {
  const { user, setUser } = useAuth();
  const toast = useToast();

  const [profile, setProfile] = useState({ name: user.name, phone: user.phone });
  const [profileErrors, setProfileErrors] = useState({});
  const [savingProfile, setSavingProfile] = useState(false);

  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [passwordErrors, setPasswordErrors] = useState({});
  const [passwordMessage, setPasswordMessage] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const [reviews, setReviews] = useState([]);
  const [addresses, setAddresses] = useState([]);
  const [editingAddress, setEditingAddress] = useState(null);
  const [deletingAddress, setDeletingAddress] = useState(null);

  const loadAddresses = () =>
    api.getAddresses().then((res) => setAddresses(res.data)).catch(() => setAddresses([]));

  useEffect(() => {
    document.title = 'My profile — Delicious Adda';
    api
      .getMyReviews()
      .then((res) => setReviews(res.data))
      .catch(() => setReviews([]));
    loadAddresses();
  }, []);

  async function makeDefault(id) {
    try {
      const res = await api.setDefaultAddress(id);
      setAddresses(res.data);
      toast.success(res.message);
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function removeAddress() {
    try {
      const res = await api.deleteAddress(deletingAddress._id);
      setAddresses(res.data);
      setDeletingAddress(null);
      toast.success('Address removed.');
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function saveProfile(e) {
    e.preventDefault();
    setProfileErrors({});
    setSavingProfile(true);
    try {
      const res = await api.updateProfile(profile);
      setUser(res.data);
      toast.success('Profile updated.');
    } catch (err) {
      setProfileErrors(err.details || { _: err.message });
      toast.error(err.message);
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword(e) {
    e.preventDefault();
    setPasswordErrors({});
    setPasswordMessage('');

    if (passwords.newPassword !== passwords.confirm) {
      setPasswordErrors({ confirm: 'Passwords do not match' });
      return;
    }

    setSavingPassword(true);
    try {
      await api.changePassword({
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword,
      });
      setPasswords({ currentPassword: '', newPassword: '', confirm: '' });
      setPasswordMessage('Password changed successfully.');
      toast.success('Password changed.');
    } catch (err) {
      setPasswordErrors(err.details || {});
      toast.error(err.message);
    } finally {
      setSavingPassword(false);
    }
  }

  async function removeReview(id) {
    try {
      await api.deleteReview(id);
      setReviews((current) => current.filter((r) => r._id !== id));
      toast.success('Review deleted.');
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <div className="container page">
      <div className="page-head">
        <div className="row">
          <span
            className="badge badge-brand"
            style={{ width: 48, height: 48, borderRadius: '50%', fontSize: '1.1rem', justifyContent: 'center' }}
          >
            {initials(user.name)}
          </span>
          <div>
            <h1 style={{ margin: 0 }}>{user.name}</h1>
            <p className="muted" style={{ margin: 0 }}>
              {user.email} · joined {formatDate(user.createdAt)} ·{' '}
              <span className="badge">{user.role}</span>
            </p>
          </div>
        </div>
        <Link to="/my-bookings" className="btn btn-ghost">
          My bookings →
        </Link>
      </div>

      <section style={{ marginBottom: '2rem' }}>
        <LoyaltyCard showLedger />
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <AllergyPicker />
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <RateWhatYouAte limit={5} />
      </section>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <form onSubmit={saveProfile} className="panel">
          <h3>Account details</h3>
          <Alert kind="error">{profileErrors._}</Alert>

          <Field label="Full name" id="p-name" error={profileErrors.name}>
            <input
              id="p-name"
              value={profile.name}
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
            />
          </Field>

          <Field label="Phone" id="p-phone" error={profileErrors.phone}>
            <input
              id="p-phone"
              value={profile.phone}
              onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
            />
          </Field>

          <Field label="Email" id="p-email" hint="Contact us to change the email on your account.">
            <input id="p-email" value={user.email} disabled />
          </Field>

          <button type="submit" className="btn" disabled={savingProfile}>
            {savingProfile ? 'Saving…' : 'Save changes'}
          </button>
        </form>

        <form onSubmit={savePassword} className="panel">
          <h3>Change password</h3>
          <Alert kind="ok">{passwordMessage}</Alert>

          <Field label="Current password" id="cur" error={passwordErrors.currentPassword}>
            <input
              id="cur"
              type="password"
              autoComplete="current-password"
              required
              value={passwords.currentPassword}
              onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}
            />
          </Field>

          <Field
            label="New password"
            id="new"
            error={passwordErrors.newPassword}
            hint="At least 8 characters, with a letter and a number."
          >
            <input
              id="new"
              type="password"
              autoComplete="new-password"
              required
              value={passwords.newPassword}
              onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
            />
          </Field>

          <Field label="Confirm new password" id="confirm" error={passwordErrors.confirm}>
            <input
              id="confirm"
              type="password"
              autoComplete="new-password"
              required
              value={passwords.confirm}
              onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
            />
          </Field>

          <button type="submit" className="btn" disabled={savingPassword}>
            {savingPassword ? 'Updating…' : 'Change password'}
          </button>
        </form>
      </div>

      <section style={{ marginTop: '2.5rem' }}>
        <div className="page-head">
          <div>
            <h2 style={{ margin: 0 }}>Delivery addresses</h2>
            <p>Saved here so checkout is one tap next time.</p>
          </div>
          <button
            type="button"
            className="btn"
            onClick={() => setEditingAddress({ ...BLANK_ADDRESS })}
          >
            + Add address
          </button>
        </div>

        {addresses.length === 0 ? (
          <EmptyState emoji="🏠" title="No saved addresses">
            Add one now, or enter it while ordering and it will be offered next time.
          </EmptyState>
        ) : (
          <div className="grid">
            {addresses.map((a) => (
              <div key={a._id} className="panel">
                <div className="row">
                  <strong>{a.label}</strong>
                  {a.isDefault && <span className="badge badge-ok">Default</span>}
                  {a.lat != null && <span className="badge">📍 pinned</span>}
                </div>
                <p className="muted" style={{ margin: '0.5rem 0' }}>{formatAddress(a)}</p>
                {a.directions && <p className="faint" style={{ margin: 0 }}>🛵 {a.directions}</p>}

                <div className="row" style={{ marginTop: '0.75rem' }}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setEditingAddress(a)}
                  >
                    Edit
                  </button>
                  {!a.isDefault && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => makeDefault(a._id)}
                    >
                      Make default
                    </button>
                  )}
                  <a className="btn btn-ghost btn-sm" href={mapLink(a)} target="_blank" rel="noreferrer">
                    Map
                  </a>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => setDeletingAddress(a)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {editingAddress && (
        <AddressModal
          address={editingAddress}
          onClose={() => setEditingAddress(null)}
          onSaved={() => {
            setEditingAddress(null);
            loadAddresses();
          }}
        />
      )}

      {deletingAddress && (
        <ConfirmDialog
          title="Delete this address?"
          message={`${deletingAddress.label} — ${formatAddress(deletingAddress)}`}
          confirmLabel="Delete"
          danger
          onCancel={() => setDeletingAddress(null)}
          onConfirm={removeAddress}
        />
      )}

      <section style={{ marginTop: '2.5rem' }}>
        <h2>My reviews</h2>
        {reviews.length === 0 ? (
          <EmptyState emoji="💬" title="You have not reviewed anything yet">
            Reviews open up after your first visit.
          </EmptyState>
        ) : (
          <div className="grid">
            {reviews.map((review) => (
              <div key={review._id} className="panel">
                <div className="row">
                  <Stars value={review.rating} />
                  <div className="spacer" />
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => removeReview(review._id)}
                    aria-label="Delete review"
                  >
                    🗑
                  </button>
                </div>
                <p style={{ marginTop: '0.6rem' }}>{review.comment || <em>No comment</em>}</p>
                <p className="faint" style={{ margin: 0 }}>
                  {review.menuItem ? (
                    <Link to={`/menu/${review.menuItem._id}`}>{review.menuItem.name}</Link>
                  ) : (
                    'General restaurant review'
                  )}{' '}
                  · {formatDate(review.createdAt)}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function AddressModal({ address, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(address);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const isNew = !address._id;

  async function save(e) {
    e.preventDefault();
    setError('');
    setErrors({});
    setBusy(true);
    try {
      if (isNew) await api.addAddress(form);
      else await api.updateAddress(address._id, form);
      toast.success(isNew ? 'Address saved.' : 'Address updated.');
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
      title={isNew ? 'Add a delivery address' : `Edit ${address.label}`}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="addr-form" className="btn" disabled={busy}>
            {busy ? 'Saving…' : 'Save address'}
          </button>
        </>
      }
    >
      <form id="addr-form" onSubmit={save}>
        <Alert kind="error">{error}</Alert>
        <AddressForm value={form} onChange={setForm} errors={errors} />
      </form>
    </Modal>
  );
}
