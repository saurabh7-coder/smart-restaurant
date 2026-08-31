import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import { useRestaurant } from '../../context/RestaurantContext.jsx';
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
import {
  ORDER_TYPE_ICON,
  ORDER_TYPE_LABEL,
  formatAddress,
  formatDateTime,
  mapLink,
  paise,
  toDateInput,
} from '../../utils/format.js';

const NEXT = {
  awaiting_payment: [['cancelled', 'Cancel', 'btn-danger']],
  placed: [
    ['accepted', 'Accept', ''],
    ['cancelled', 'Reject', 'btn-danger'],
  ],
  accepted: [
    ['preparing', 'Start', ''],
    ['cancelled', 'Cancel', 'btn-danger'],
  ],
  preparing: [['ready', 'Ready', '']],
  ready: [['completed', 'Complete', '']],
  out_for_delivery: [['completed', 'Delivered', '']],
};

const STATUS_FILTERS = [
  ['', 'All statuses'],
  ['awaiting_payment', 'Awaiting payment'],
  ['placed', 'Placed'],
  ['accepted', 'Accepted'],
  ['preparing', 'Preparing'],
  ['ready', 'Ready'],
  ['out_for_delivery', 'Out for delivery'],
  ['completed', 'Completed'],
  ['cancelled', 'Cancelled'],
];

export default function OrderManage() {
  const toast = useToast();
  const { restaurant } = useRestaurant();

  const [orders, setOrders] = useState([]);
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0 });
  const [filters, setFilters] = useState({ status: '', orderType: '', q: '', date: '' });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewing, setViewing] = useState(null);
  const [refunding, setRefunding] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api
      .listOrders({ ...filters, page, limit: 25 })
      .then((res) => {
        setOrders(res.data);
        setMeta(res.meta);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [filters, page]);

  useEffect(() => {
    document.title = 'Orders — Admin';
  }, []);

  useEffect(load, [load]);

  async function act(order, status) {
    try {
      await api.setOrderStatus(order._id, status);
      toast.success(`${order.orderNumber} → ${status}`);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function doRefund() {
    setBusy(true);
    try {
      const res = await api.refundOrder(refunding._id);
      toast.success(res.message);
      setRefunding(null);
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
          <h1>Orders</h1>
          <p>{meta.total} matching orders</p>
        </div>
        <div className="row">
          <Link to="/kitchen" className="btn btn-ghost">
            Kitchen board →
          </Link>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setFilters({ status: '', orderType: '', q: '', date: toDateInput() })}
          >
            Today
          </button>
        </div>
      </div>

      <Alert kind="error">{error}</Alert>

      <div className="filter-bar">
        <Field label="Status" id="o-status">
          <select
            id="o-status"
            value={filters.status}
            onChange={(e) => {
              setPage(1);
              setFilters({ ...filters, status: e.target.value });
            }}
          >
            {STATUS_FILTERS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Type" id="o-type">
          <select
            id="o-type"
            value={filters.orderType}
            onChange={(e) => {
              setPage(1);
              setFilters({ ...filters, orderType: e.target.value });
            }}
          >
            <option value="">All types</option>
            <option value="pre_order">Pre-order</option>
            <option value="dine_in">Dine-in</option>
            <option value="takeaway">Takeaway</option>
            <option value="delivery">Delivery</option>
          </select>
        </Field>

        <Field label="Date" id="o-date">
          <input
            id="o-date"
            type="date"
            value={filters.date}
            onChange={(e) => {
              setPage(1);
              setFilters({ ...filters, date: e.target.value });
            }}
          />
        </Field>

        <Field label="Search" id="o-q" hint="Order no., name or phone">
          <input
            id="o-q"
            type="search"
            value={filters.q}
            onChange={(e) => {
              setPage(1);
              setFilters({ ...filters, q: e.target.value });
            }}
          />
        </Field>

        <div className="row" style={{ alignItems: 'flex-end' }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setFilters({ status: '', orderType: '', q: '', date: '' })}
          >
            Clear
          </button>
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : orders.length === 0 ? (
        <EmptyState emoji="🧾" title="No orders match those filters" />
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Type</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o._id}>
                    <td className="nowrap">
                      <code>{o.orderNumber}</code>
                      <div className="faint">{formatDateTime(o.createdAt)}</div>
                    </td>
                    <td>
                      <strong>{o.contact.name}</strong>
                      <div className="faint">{o.contact.phone}</div>
                    </td>
                    <td className="nowrap">
                      {ORDER_TYPE_ICON[o.orderType]} {ORDER_TYPE_LABEL[o.orderType]}
                      {o.table && <div className="faint">Table {o.table.tableNumber}</div>}
                      {o.pickupAt && <div className="faint">{formatDateTime(o.pickupAt)}</div>}
                      {o.deliveryAddress && (
                        <div className="faint">
                          {o.deliveryAddress.label} · {o.deliveryAddress.pincode}
                          {o.deliveryDistanceKm != null ? ` · ${o.deliveryDistanceKm} km` : ''}
                        </div>
                      )}
                    </td>
                    <td>{o.items.reduce((n, i) => n + i.quantity, 0)}</td>
                    <td className="nowrap">{paise(o.amounts.total, o.currency)}</td>
                    <td>
                      <StatusBadge status={o.payment.status} />
                      {o.payment.gatewayMethod && (
                        <div className="faint">{o.payment.gatewayMethod}</div>
                      )}
                    </td>
                    <td>
                      <StatusBadge status={o.status} />
                    </td>
                    <td className="nowrap">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setViewing(o)}
                      >
                        View
                      </button>
                      {(NEXT[o.status] || []).map(([status, label, cls]) => (
                        <button
                          key={status}
                          type="button"
                          className={`btn btn-sm ${cls || 'btn-ghost'}`}
                          onClick={() => act(o, status)}
                        >
                          {label}
                        </button>
                      ))}
                      {o.payment.status === 'paid' && (
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => setRefunding(o)}
                        >
                          Refund
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={meta.page} pages={meta.pages} onChange={setPage} />
        </>
      )}

      {!restaurant?.ordering?.onlinePaymentEnabled && (
        <Alert kind="info">
          Online payment is not configured, so every order here is pay-at-restaurant. Add Razorpay
          keys to <code>server/.env</code> to enable card, UPI and netbanking.
        </Alert>
      )}

      {viewing && <OrderModal order={viewing} onClose={() => setViewing(null)} />}

      {refunding && (
        <ConfirmDialog
          title="Refund this order?"
          message={`${paise(refunding.amounts.total, refunding.currency)} will be refunded to the customer and order ${refunding.orderNumber} will be cancelled.`}
          confirmLabel="Refund and cancel"
          danger
          busy={busy}
          onCancel={() => setRefunding(null)}
          onConfirm={doRefund}
        />
      )}
    </>
  );
}

function OrderModal({ order, onClose }) {
  return (
    <Modal title={`${order.orderNumber}`} onClose={onClose} wide>
      <div className="row" style={{ marginBottom: '1rem' }}>
        <StatusBadge status={order.status} />
        <StatusBadge status={order.payment.status} />
        <span className="badge">
          {ORDER_TYPE_ICON[order.orderType]} {ORDER_TYPE_LABEL[order.orderType]}
        </span>
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div>
          <h4>Items</h4>
          <div className="table-wrap" style={{ border: 'none' }}>
            <table style={{ minWidth: 0 }}>
              <tbody>
                {order.items.map((i) => (
                  <tr key={i.menuItem}>
                    <td>
                      {i.quantity} × {i.name}
                      {i.note && <div className="faint">↳ {i.note}</div>}
                    </td>
                    <td className="nowrap" style={{ textAlign: 'right' }}>
                      {paise(i.lineTotal, order.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {order.note && (
            <div className="alert alert-info">
              <strong>Note:</strong> {order.note}
            </div>
          )}

          {order.deliveryAddress && (
            <>
              <h4>Delivery address</h4>
              <p className="muted" style={{ margin: 0 }}>
                <strong>{order.deliveryAddress.label}</strong>
                {order.deliveryDistanceKm != null && (
                  <span className="badge" style={{ marginLeft: '0.4rem' }}>
                    {order.deliveryDistanceKm} km away
                  </span>
                )}
                {order.deliveryAddress.lat != null && (
                  <span className="badge badge-ok" style={{ marginLeft: '0.4rem' }}>
                    📍 pinned{order.deliveryAddress.accuracy ? ` ±${order.deliveryAddress.accuracy}m` : ''}
                  </span>
                )}
                <br />
                {formatAddress(order.deliveryAddress)}
              </p>
              {order.deliveryAddress.directions && (
                <p className="faint" style={{ margin: '0.25rem 0 0' }}>
                  🛵 {order.deliveryAddress.directions}
                </p>
              )}
              <a
                className="btn btn-ghost btn-sm"
                style={{ marginTop: '0.5rem' }}
                href={mapLink(order.deliveryAddress)}
                target="_blank"
                rel="noreferrer"
              >
                Open in maps
              </a>
            </>
          )}
        </div>

        <div className="stack">
          <div>
            <h4>Bill</h4>
            <div className="bill">
              <div className="bill-row">
                <span>Subtotal</span>
                <span>{paise(order.amounts.subtotal, order.currency)}</span>
              </div>
              {order.amounts.discount > 0 && (
                <div className="bill-row">
                  <span className="discount">Discount ({order.offerCode})</span>
                  <span className="discount">−{paise(order.amounts.discount, order.currency)}</span>
                </div>
              )}
              <div className="bill-row">
                <span>GST ({order.amounts.taxPercent}%)</span>
                <span>{paise(order.amounts.tax, order.currency)}</span>
              </div>
              <div className="bill-row total">
                <span>Total</span>
                <span>{paise(order.amounts.total, order.currency)}</span>
              </div>
            </div>
          </div>

          <div>
            <h4>Payment</h4>
            <p className="muted" style={{ margin: 0 }}>
              Method: {order.payment.method === 'online' ? 'Online' : 'At the restaurant'}
              <br />
              Status: {order.payment.status}
              {order.payment.gatewayMethod && ` (${order.payment.gatewayMethod})`}
              {order.payment.providerPaymentId && (
                <>
                  <br />
                  Ref: <code>{order.payment.providerPaymentId}</code>
                </>
              )}
              {order.payment.signatureVerified && (
                <>
                  <br />
                  <span className="badge badge-ok">Signature verified</span>
                </>
              )}
            </p>
          </div>

          <div>
            <h4>Customer</h4>
            <p className="muted" style={{ margin: 0 }}>
              {order.contact.name}
              <br />
              {order.contact.phone}
              <br />
              {order.contact.email}
            </p>
          </div>

          <div>
            <h4>History</h4>
            <ul className="faint" style={{ paddingLeft: '1.1rem', margin: 0 }}>
              {order.statusHistory?.map((h, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <li key={i}>
                  {h.status} — {formatDateTime(h.at)}
                  {h.note ? ` (${h.note})` : ''}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Modal>
  );
}
