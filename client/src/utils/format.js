export const money = (amount, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount) || 0);

/**
 * Formats an integer paise amount. The server stores and sums money in paise to
 * keep the arithmetic exact; the division happens here, at the last moment.
 */
export const paise = (amount, currency = 'INR') => money((Number(amount) || 0) / 100, currency);

export const ORDER_TYPE_LABEL = {
  pre_order: 'Pre-order',
  dine_in: 'Dine-in',
  takeaway: 'Takeaway',
  delivery: 'Delivery',
};

export const ORDER_TYPE_ICON = {
  pre_order: '🍽️',
  dine_in: '🪑',
  takeaway: '🥡',
  delivery: '🛵',
};

/** One-line address, matching how the server renders it on tickets. */
export const formatAddress = (a) =>
  !a
    ? ''
    : [a.line1, a.line2, a.landmark && `near ${a.landmark}`, a.city, a.pincode]
        .filter(Boolean)
        .join(', ');

/** Opens the pin in whatever map app the device prefers. */
export const mapLink = (a) =>
  a && a.lat != null && a.lng != null
    ? `https://www.google.com/maps/search/?api=1&query=${a.lat},${a.lng}`
    : a
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(formatAddress(a))}`
      : '';

export const FOOD_TYPE_LABEL = {
  veg: 'Veg',
  non_veg: 'Non-Veg',
  vegan: 'Vegan',
};

export const STATUS_LABEL = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  arrived: 'Arrived',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-show',
  available: 'Available',
  reserved: 'Reserved',
  occupied: 'Occupied',
  maintenance: 'Maintenance',
  // order statuses
  awaiting_payment: 'Awaiting payment',
  placed: 'Placed',
  accepted: 'Accepted',
  preparing: 'Preparing',
  ready: 'Ready',
  out_for_delivery: 'Out for delivery',
  // payment statuses
  pay_at_restaurant: 'Pay at restaurant',
  collect_on_delivery: 'Cash on delivery',
  paid: 'Paid',
  failed: 'Failed',
  refunded: 'Refunded',
};

/** YYYY-MM-DD for a Date, in the browser's local calendar. */
export const toDateInput = (date = new Date()) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const addDays = (days, from = new Date()) =>
  toDateInput(new Date(new Date(from).getTime() + days * 86400000));

export const formatDate = (value) =>
  new Date(value).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

export const formatDateTime = (value) =>
  new Date(value).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

export const formatTime = (value) =>
  new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/**
 * A wall-clock string like "11:00" as "11:00 AM".
 *
 * Opening hours are stored 24-hour because that sorts and compares correctly,
 * but nobody reads a menu board in 24-hour time — so the conversion happens at
 * the point of display, not in storage.
 */
export const formatClock = (hhmm) => {
  const [h, m] = String(hhmm ?? '').split(':').map(Number);
  if (!Number.isFinite(h)) return hhmm ?? '';
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m || 0).padStart(2, '0')} ${suffix}`;
};

/** First letters of a name, for avatar chips. */
export const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
