import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Alert, Field } from '../components/ui.jsx';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = 'Create an account — Delicious Adda';
  }, []);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setFieldErrors({});

    if (form.password !== form.confirm) {
      setFieldErrors({ confirm: 'Passwords do not match' });
      return;
    }

    setBusy(true);
    try {
      const { confirm, ...payload } = form;
      await register(payload);
      toast.success('Welcome! Your account is ready.');
      navigate('/reservation');
    } catch (err) {
      setError(err.message);
      setFieldErrors(err.details || {});
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container page" style={{ maxWidth: 480 }}>
      <h1>Create your account</h1>
      <p className="muted">It takes a minute, and lets you change bookings yourself.</p>

      <form onSubmit={submit} className="panel">
        <Alert kind="error">{error}</Alert>

        <Field label="Full name" id="name" error={fieldErrors.name}>
          <input
            id="name"
            required
            autoComplete="name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>

        <Field label="Email" id="email" error={fieldErrors.email}>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Field>

        <Field label="Phone" id="phone" error={fieldErrors.phone} hint="We call this number if plans change.">
          <input
            id="phone"
            required
            autoComplete="tel"
            placeholder="+91 98100 00000"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </Field>

        <Field
          label="Password"
          id="password"
          error={fieldErrors.password}
          hint="At least 8 characters, with a letter and a number."
        >
          <input
            id="password"
            type="password"
            required
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </Field>

        <Field label="Confirm password" id="confirm" error={fieldErrors.confirm}>
          <input
            id="confirm"
            type="password"
            required
            autoComplete="new-password"
            value={form.confirm}
            onChange={(e) => setForm({ ...form, confirm: e.target.value })}
          />
        </Field>

        <button type="submit" className="btn btn-block" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="center muted" style={{ marginTop: '1rem' }}>
        Already registered? <Link to="/login">Log in</Link>
      </p>
    </div>
  );
}
