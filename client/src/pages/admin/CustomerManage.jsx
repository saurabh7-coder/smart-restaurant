import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import {
  Alert,
  ConfirmDialog,
  EmptyState,
  Field,
  Modal,
  Pagination,
  Spinner,
  StatusBadge,
} from '../../components/ui.jsx';
import { formatDate, formatTime } from '../../utils/format.js';

export default function CustomerManage() {
  const { user: me } = useAuth();
  const toast = useToast();

  const [users, setUsers] = useState([]);
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0 });
  const [filters, setFilters] = useState({ role: '', q: '' });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [viewing, setViewing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api
      .getUsers({ ...filters, page, limit: 25 })
      .then((res) => {
        setUsers(res.data);
        setMeta(res.meta);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [filters, page]);

  useEffect(() => {
    document.title = 'Customers — Admin';
  }, []);

  useEffect(load, [load]);

  async function changeRole(user, role) {
    try {
      await api.setUserRole(user._id, role);
      toast.success(`${user.name} is now ${role}.`);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function toggleBlock(user) {
    try {
      await api.setUserBlocked(user._id, !user.isBlocked);
      toast.success(user.isBlocked ? 'Account reinstated.' : 'Account suspended.');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api.deleteUser(deleting._id);
      toast.success('Account deleted.');
      setDeleting(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Customers &amp; staff</h1>
          <p>{meta.total} accounts</p>
        </div>
        <button type="button" className="btn" onClick={() => setCreating(true)}>
          + Add staff account
        </button>
      </div>

      <Alert kind="error">{error}</Alert>

      <div className="filter-bar">
        <Field label="Role" id="u-role">
          <select
            id="u-role"
            value={filters.role}
            onChange={(e) => {
              setPage(1);
              setFilters({ ...filters, role: e.target.value });
            }}
          >
            <option value="">All roles</option>
            <option value="customer">Customers</option>
            <option value="staff">Staff</option>
            <option value="admin">Admins</option>
          </select>
        </Field>
        <Field label="Search" id="u-q" hint="Name, email or phone">
          <input
            id="u-q"
            type="search"
            value={filters.q}
            onChange={(e) => {
              setPage(1);
              setFilters({ ...filters, q: e.target.value });
            }}
          />
        </Field>
      </div>

      {loading ? (
        <Spinner />
      ) : users.length === 0 ? (
        <EmptyState emoji="👥" title="No accounts match" />
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Contact</th>
                  <th>Role</th>
                  <th>Bookings</th>
                  <th>Joined</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u._id}>
                    <td>
                      <strong>{u.name}</strong>
                      {u.isBlocked && <div><span className="badge badge-danger">Suspended</span></div>}
                    </td>
                    <td>
                      {u.email}
                      <div className="faint">{u.phone}</div>
                    </td>
                    <td>
                      <select
                        value={u.role}
                        disabled={u._id === me.id}
                        onChange={(e) => changeRole(u, e.target.value)}
                        style={{ maxWidth: 130 }}
                      >
                        <option value="customer">customer</option>
                        <option value="staff">staff</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                    <td>{u.reservationCount}</td>
                    <td className="nowrap">{formatDate(u.createdAt)}</td>
                    <td className="nowrap">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setViewing(u)}
                      >
                        History
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={u._id === me.id}
                        onClick={() => toggleBlock(u)}
                      >
                        {u.isBlocked ? 'Reinstate' : 'Suspend'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        disabled={u._id === me.id}
                        onClick={() => setDeleting(u)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={meta.page} pages={meta.pages} onChange={setPage} />
        </>
      )}

      {viewing && <HistoryModal user={viewing} onClose={() => setViewing(null)} />}

      {creating && (
        <StaffModal
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            load();
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete this account?"
          message={`${deleting.name} (${deleting.email}) will be permanently removed. Accounts with upcoming reservations cannot be deleted.`}
          confirmLabel="Delete account"
          danger
          busy={busy}
          onCancel={() => setDeleting(null)}
          onConfirm={remove}
        />
      )}
    </>
  );
}

function HistoryModal({ user, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .getUser(user._id)
      .then((res) => setData(res.data))
      .catch((err) => setError(err.message));
  }, [user._id]);

  return (
    <Modal title={`${user.name} — booking history`} onClose={onClose} wide>
      <Alert kind="error">{error}</Alert>
      {!data ? (
        <Spinner />
      ) : data.reservations.length === 0 ? (
        <EmptyState emoji="📅" title="No bookings yet" />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Booking</th>
                <th>When</th>
                <th>Guests</th>
                <th>Table</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.reservations.map((r) => (
                <tr key={r._id}>
                  <td>
                    <code>{r.reservationId}</code>
                  </td>
                  <td className="nowrap">
                    {formatDate(r.slotStart)}
                    <div className="faint">{formatTime(r.slotStart)}</div>
                  </td>
                  <td>{r.guests}</td>
                  <td>{r.table?.tableNumber}</td>
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

function StaffModal({ onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    role: 'staff',
  });
  const [error, setError] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function save(e) {
    e.preventDefault();
    setError('');
    setErrors({});
    setBusy(true);
    try {
      await api.createStaffUser(form);
      toast.success(`${form.role} account created.`);
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
      title="Add staff account"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="staff-form" className="btn" disabled={busy}>
            {busy ? 'Creating…' : 'Create account'}
          </button>
        </>
      }
    >
      <form id="staff-form" onSubmit={save}>
        <Alert kind="error">{error}</Alert>
        <p className="muted">
          Self-registration always creates a customer. Staff and admin accounts can only be created
          here.
        </p>

        <Field label="Name" id="s-name" error={errors.name}>
          <input id="s-name" value={form.name} onChange={set('name')} required />
        </Field>
        <Field label="Email" id="s-email" error={errors.email}>
          <input id="s-email" type="email" value={form.email} onChange={set('email')} required />
        </Field>
        <Field label="Phone" id="s-phone" error={errors.phone}>
          <input id="s-phone" value={form.phone} onChange={set('phone')} required />
        </Field>
        <Field
          label="Temporary password"
          id="s-pass"
          error={errors.password}
          hint="At least 8 characters. Ask them to change it after first login."
        >
          <input id="s-pass" type="text" value={form.password} onChange={set('password')} required />
        </Field>
        <Field label="Role" id="s-role">
          <select id="s-role" value={form.role} onChange={set('role')}>
            <option value="staff">staff</option>
            <option value="admin">admin</option>
          </select>
        </Field>
      </form>
    </Modal>
  );
}
