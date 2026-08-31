import { useEffect } from 'react';
import { FOOD_TYPE_LABEL, STATUS_LABEL } from '../utils/format.js';

export function Spinner({ label = 'Loading…' }) {
  return (
    <div role="status" aria-label={label}>
      <div className="spinner" />
    </div>
  );
}

export function EmptyState({ emoji = '🍽️', title, children, action }) {
  return (
    <div className="empty">
      <div className="emoji">{emoji}</div>
      <h3>{title}</h3>
      {children && <p className="muted">{children}</p>}
      {action}
    </div>
  );
}

export function Alert({ kind = 'info', children }) {
  if (!children) return null;
  return <div className={`alert alert-${kind}`}>{children}</div>;
}

/** Labelled input with inline validation message. */
export function Field({ label, error, hint, children, id }) {
  return (
    <div className="field">
      {label && <label htmlFor={id}>{label}</label>}
      {children}
      {hint && !error && <span className="faint">{hint}</span>}
      {error && (
        <span className="field-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

const STATUS_KIND = {
  pending: 'warn',
  confirmed: 'info',
  arrived: 'brand',
  completed: 'ok',
  cancelled: 'danger',
  no_show: 'danger',
  available: 'ok',
  reserved: 'info',
  occupied: 'warn',
  maintenance: 'danger',
  pay_at_restaurant: 'warn',
  collect_on_delivery: 'warn',
  paid: 'ok',
  failed: 'danger',
  refunded: 'info',
};

export function StatusBadge({ status }) {
  return (
    <span className={`badge badge-${STATUS_KIND[status] || 'info'}`}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}

export function FoodTypeTag({ type, showLabel = true }) {
  return (
    <span className="badge" title={FOOD_TYPE_LABEL[type]}>
      <span className={`food-dot ${type}`} aria-hidden="true" />
      {showLabel && FOOD_TYPE_LABEL[type]}
    </span>
  );
}

export function Stars({ value = 0, count }) {
  const rounded = Math.round(value);
  return (
    <span className="row" style={{ gap: '0.35rem' }}>
      <span className="stars" aria-label={`${value} out of 5`}>
        {'★'.repeat(rounded)}
        <span style={{ opacity: 0.3 }}>{'★'.repeat(5 - rounded)}</span>
      </span>
      <span className="faint">
        {value ? value.toFixed(1) : 'New'}
        {count ? ` (${count})` : ''}
      </span>
    </span>
  );
}

export function Modal({ title, onClose, children, footer, wide }) {
  // Escape closes the dialog, and the page behind it must not scroll.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={wide ? { width: 'min(900px, 100%)' } : undefined}
      >
        <div className="modal-head">
          <h3>{title}</h3>
          <div className="spacer" />
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, message, confirmLabel = 'Confirm', danger, onConfirm, onCancel, busy }) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className={`btn ${danger ? 'btn-danger' : ''}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </>
      }
    >
      <p style={{ margin: 0 }}>{message}</p>
    </Modal>
  );
}

export function Pagination({ page, pages, onChange }) {
  if (pages <= 1) return null;
  return (
    <div className="pagination">
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        ← Prev
      </button>
      <span className="muted">
        Page {page} of {pages}
      </span>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={page >= pages}
        onClick={() => onChange(page + 1)}
      >
        Next →
      </button>
    </div>
  );
}
