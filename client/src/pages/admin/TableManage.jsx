import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../../api/client.js';
import { useToast } from '../../context/ToastContext.jsx';
import { Alert, ConfirmDialog, Field, Modal, Spinner, StatusBadge } from '../../components/ui.jsx';

const LOCATIONS = ['indoor', 'window', 'outdoor', 'rooftop', 'private'];
const STATUSES = ['available', 'reserved', 'occupied', 'maintenance'];
const BLANK = { tableNumber: '', capacity: 4, location: 'indoor', status: 'available', notes: '' };

export default function TableManage() {
  const toast = useToast();

  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [qrFor, setQrFor] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api
      .getTables()
      .then((res) => setTables(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    document.title = 'Table management — Admin';
    load();
  }, [load]);

  async function setStatus(table, status) {
    try {
      await api.setTableStatus(table._id, status);
      toast.success(`Table ${table.tableNumber} marked ${status}.`);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api.deleteTable(deleting._id);
      toast.success('Table deleted.');
      setDeleting(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  const totalSeats = tables.reduce((sum, t) => sum + t.capacity, 0);

  if (loading) return <Spinner />;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Table management</h1>
          <p>
            {tables.length} tables · {totalSeats} seats
          </p>
        </div>
        <div className="row">
          <button type="button" className="btn btn-ghost" onClick={() => setQrFor('menu')}>
            Menu QR
          </button>
          <button type="button" className="btn" onClick={() => setEditing({ ...BLANK })}>
            + Add table
          </button>
        </div>
      </div>

      <Alert kind="error">{error}</Alert>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Table</th>
              <th>Capacity</th>
              <th>Location</th>
              <th>Floor status</th>
              <th>Notes</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {tables.map((table) => (
              <tr key={table._id}>
                <td>
                  <strong>{table.tableNumber}</strong>
                </td>
                <td>{table.capacity} seats</td>
                <td>{table.location}</td>
                <td>
                  <select
                    value={table.status}
                    onChange={(e) => setStatus(table, e.target.value)}
                    style={{ maxWidth: 150 }}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="faint">{table.notes || '—'}</td>
                <td className="nowrap">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setQrFor(table)}
                  >
                    QR
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setEditing(table)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => setDeleting(table)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Alert kind="info">
        <strong>Floor status vs. availability:</strong> this column is the live state of the room for
        staff. Bookability comes from the reservations themselves — only{' '}
        <em>maintenance</em> removes a table from the online booking pool.
      </Alert>

      <section style={{ marginTop: '1.5rem' }}>
        <h3>Floor plan</h3>
        <div className="table-grid">
          {tables.map((t) => (
            <div key={t._id} className="table-tile" style={{ cursor: 'default' }}>
              <strong>{t.tableNumber}</strong>
              <small>{t.capacity} seats</small>
              <StatusBadge status={t.status} />
            </div>
          ))}
        </div>
      </section>

      {editing && (
        <TableModal
          table={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}

      {qrFor && <TableQrModal table={qrFor} onClose={() => setQrFor(null)} />}

      {deleting && (
        <ConfirmDialog
          title="Delete this table?"
          message={`Table ${deleting.tableNumber} will be removed. This is blocked if it has upcoming reservations.`}
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

/**
 * Printable QR that drops a guest straight into dine-in checkout for this table.
 * Generated in the browser as a data URI, so no image is stored or fetched.
 */
function TableQrModal({ table, onClose }) {
  const toast = useToast();
  const [dataUrl, setDataUrl] = useState('');
  const [error, setError] = useState('');

  // 'menu' is the restaurant-wide code — for the door, a window sticker or a
  // flyer — rather than one particular table.
  const isGeneral = table === 'menu';

  // Lands on the menu, not checkout: a guest wants to see the food before
  // paying. The table travels with them via the cart.
  const url = isGeneral
    ? `${window.location.origin}/menu`
    : `${window.location.origin}/menu?table=${table._id}`;

  useEffect(() => {
    QRCode.toDataURL(url, { width: 480, margin: 2, errorCorrectionLevel: 'M' })
      .then(setDataUrl)
      .catch((err) => setError(err.message));
  }, [url]);

  function print() {
    const w = window.open('', '_blank', 'width=520,height=680');
    if (!w) {
      toast.error('Your browser blocked the print window. Allow pop-ups and try again.');
      return;
    }
    w.document.write(`
      <html><head><title>${isGeneral ? 'Scan for our menu' : `Table ${table.tableNumber} — scan to order`}</title>
      <style>
        body { font-family: system-ui, sans-serif; text-align: center; padding: 40px; }
        h1 { font-size: 42px; margin: 0 0 4px; }
        p { color: #555; margin: 0 0 24px; }
        img { width: 320px; height: 320px; }
        .hint { margin-top: 20px; font-size: 15px; }
      </style></head>
      <body>
        <h1>${isGeneral ? 'Our menu' : `Table ${table.tableNumber}`}</h1>
        <p>${isGeneral ? 'Scan to browse and order' : `${table.capacity} seats · ${table.location}`}</p>
        <img src="${dataUrl}" alt="QR code" />
        <p class="hint">Scan with your phone camera to see the menu and order.</p>
      </body></html>
    `);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 250);
  }

  return (
    <Modal
      title={isGeneral ? 'Menu QR — for the door, window or a flyer' : `Table ${table.tableNumber} — dine-in QR`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              navigator.clipboard?.writeText(url);
              toast.success('Link copied.');
            }}
          >
            Copy link
          </button>
          <button type="button" className="btn" onClick={print} disabled={!dataUrl}>
            Print
          </button>
        </>
      }
    >
      <Alert kind="error">{error}</Alert>

      <div className="center">
        {dataUrl ? (
          <img
            src={dataUrl}
            alt={isGeneral ? 'QR code for the menu' : `QR code for table ${table.tableNumber}`}
            style={{ width: 240, height: 240, margin: '0 auto' }}
          />
        ) : (
          <Spinner />
        )}
        <p className="faint" style={{ wordBreak: 'break-all', marginTop: '1rem' }}>
          {url}
        </p>
      </div>

      <Alert kind="info">
        Print this and put it on the table. Scanning opens the <strong>menu</strong> with this table
        remembered, so anything the guest adds goes to the right table at checkout. They still log in
        before ordering, so every order has a real customer attached to it.
      </Alert>
    </Modal>
  );
}

function TableModal({ table, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(table);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const isNew = !table._id;
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function save(e) {
    e.preventDefault();
    setError('');
    setErrors({});
    setBusy(true);
    try {
      const payload = {
        tableNumber: form.tableNumber,
        capacity: Number(form.capacity),
        location: form.location,
        status: form.status,
        notes: form.notes,
      };
      if (isNew) await api.createTable(payload);
      else await api.updateTable(table._id, payload);
      toast.success(isNew ? 'Table created.' : 'Table updated.');
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
      title={isNew ? 'Add table' : `Edit table ${table.tableNumber}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="table-form" className="btn" disabled={busy}>
            {busy ? 'Saving…' : 'Save table'}
          </button>
        </>
      }
    >
      <form id="table-form" onSubmit={save}>
        <Alert kind="error">{error}</Alert>

        <div className="grid-2">
          <Field label="Table number" id="t-num" error={errors.tableNumber} hint="e.g. T05">
            <input id="t-num" value={form.tableNumber} onChange={set('tableNumber')} required />
          </Field>
          <Field label="Capacity" id="t-cap" error={errors.capacity}>
            <input
              id="t-cap"
              type="number"
              min="1"
              max="30"
              value={form.capacity}
              onChange={set('capacity')}
              required
            />
          </Field>
        </div>

        <div className="grid-2">
          <Field label="Location" id="t-loc">
            <select id="t-loc" value={form.location} onChange={set('location')}>
              {LOCATIONS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Floor status" id="t-status">
            <select id="t-status" value={form.status} onChange={set('status')}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Notes" id="t-notes" hint="Anything staff should know about this table.">
          <input id="t-notes" maxLength={200} value={form.notes} onChange={set('notes')} />
        </Field>
      </form>
    </Modal>
  );
}
