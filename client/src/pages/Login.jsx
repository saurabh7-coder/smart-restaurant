import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Alert, Field } from '../components/ui.jsx';

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const redirectTo = location.state?.from || '/';

  useEffect(() => {
    document.title = 'Log in — Delicious Adda';
  }, []);

  // Someone already signed in has no business on this page.
  useEffect(() => {
    if (user) navigate(redirectTo, { replace: true });
  }, [user, navigate, redirectTo]);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setFieldErrors({});
    setBusy(true);
    try {
      const account = await login(form);
      navigate(account.role === 'admin' ? '/admin' : redirectTo, { replace: true });
    } catch (err) {
      setError(err.message);
      setFieldErrors(err.details || {});
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container page" style={{ maxWidth: 460 }}>
      <h1>Welcome back</h1>
      <p className="muted">Log in to manage your reservations.</p>

      <form onSubmit={submit} className="panel">
        <Alert kind="error">{error}</Alert>

        <Field label="Email" id="email" error={fieldErrors.email}>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Field>

        <Field label="Password" id="password" error={fieldErrors.password}>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </Field>

        <button type="submit" className="btn btn-block" disabled={busy}>
          {busy ? 'Logging in…' : 'Log in'}
        </button>
      </form>

      <p className="center muted" style={{ marginTop: '1rem' }}>
        New here? <Link to="/register">Create an account</Link>
      </p>
    </div>
  );
}
