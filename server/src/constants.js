export const ROLES = Object.freeze({
  CUSTOMER: 'customer',
  STAFF: 'staff',
  ADMIN: 'admin',
});

export const ROLE_VALUES = Object.values(ROLES);

export const RESERVATION_STATUS = Object.freeze({
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  ARRIVED: 'arrived',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  NO_SHOW: 'no_show',
});

export const RESERVATION_STATUS_VALUES = Object.values(RESERVATION_STATUS);

/**
 * Statuses that still hold the table. A reservation in one of these states sets
 * `isActive: true`, which is what the partial unique index keys off.
 */
export const HOLDING_STATUSES = Object.freeze([
  RESERVATION_STATUS.PENDING,
  RESERVATION_STATUS.CONFIRMED,
  RESERVATION_STATUS.ARRIVED,
  RESERVATION_STATUS.COMPLETED,
]);

/** Legal status transitions, enforced server-side. */
export const STATUS_TRANSITIONS = Object.freeze({
  [RESERVATION_STATUS.PENDING]: [RESERVATION_STATUS.CONFIRMED, RESERVATION_STATUS.CANCELLED],
  [RESERVATION_STATUS.CONFIRMED]: [
    RESERVATION_STATUS.ARRIVED,
    RESERVATION_STATUS.CANCELLED,
    RESERVATION_STATUS.NO_SHOW,
  ],
  [RESERVATION_STATUS.ARRIVED]: [RESERVATION_STATUS.COMPLETED],
  [RESERVATION_STATUS.COMPLETED]: [],
  [RESERVATION_STATUS.CANCELLED]: [],
  [RESERVATION_STATUS.NO_SHOW]: [],
});

export const TABLE_STATUS = Object.freeze({
  AVAILABLE: 'available',
  RESERVED: 'reserved',
  OCCUPIED: 'occupied',
  MAINTENANCE: 'maintenance',
});

export const TABLE_STATUS_VALUES = Object.values(TABLE_STATUS);

export const TABLE_LOCATIONS = Object.freeze(['indoor', 'window', 'outdoor', 'rooftop', 'private']);

export const FOOD_TYPES = Object.freeze(['veg', 'non_veg', 'vegan']);

/* ────────────────────────── food ordering ────────────────────────── */

export const ORDER_TYPE = Object.freeze({
  /** Ordered ahead of a table booking so the kitchen can prepare for arrival. */
  PRE_ORDER: 'pre_order',
  /** Ordered from the table during the meal, usually via the table QR code. */
  DINE_IN: 'dine_in',
  /** Collected from the counter at a chosen time. */
  TAKEAWAY: 'takeaway',
  /** Delivered to the customer's address by a rider. */
  DELIVERY: 'delivery',
});

export const ORDER_TYPE_VALUES = Object.values(ORDER_TYPE);

export const ORDER_STATUS = Object.freeze({
  /** Created but awaiting online payment; not yet visible to the kitchen. */
  AWAITING_PAYMENT: 'awaiting_payment',
  PLACED: 'placed',
  ACCEPTED: 'accepted',
  PREPARING: 'preparing',
  READY: 'ready',
  /** Delivery only: with the rider, on its way to the customer. */
  OUT_FOR_DELIVERY: 'out_for_delivery',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
});

export const ORDER_STATUS_VALUES = Object.values(ORDER_STATUS);

/** Statuses the kitchen and staff act on. */
export const KITCHEN_STATUSES = Object.freeze([
  ORDER_STATUS.PLACED,
  ORDER_STATUS.ACCEPTED,
  ORDER_STATUS.PREPARING,
  ORDER_STATUS.READY,
  ORDER_STATUS.OUT_FOR_DELIVERY,
]);

export const ORDER_TRANSITIONS = Object.freeze({
  [ORDER_STATUS.AWAITING_PAYMENT]: [ORDER_STATUS.PLACED, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.PLACED]: [ORDER_STATUS.ACCEPTED, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.ACCEPTED]: [ORDER_STATUS.PREPARING, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.PREPARING]: [ORDER_STATUS.READY],
  [ORDER_STATUS.READY]: [ORDER_STATUS.COMPLETED],
  [ORDER_STATUS.OUT_FOR_DELIVERY]: [ORDER_STATUS.COMPLETED],
  [ORDER_STATUS.COMPLETED]: [],
  [ORDER_STATUS.CANCELLED]: [],
});

/**
 * Allowed next statuses, which depend on the channel.
 *
 * A delivery order has one more stage than any other: once the kitchen marks it
 * ready it goes to a rider rather than straight to the customer, so `ready` can
 * only become `out_for_delivery`. Collapsing both into one static table would
 * either let a dine-in order be "out for delivery" or hide the rider stage from
 * deliveries.
 */
export function allowedTransitions(orderType, status) {
  if (orderType === ORDER_TYPE.DELIVERY && status === ORDER_STATUS.READY) {
    return [ORDER_STATUS.OUT_FOR_DELIVERY];
  }
  if (orderType !== ORDER_TYPE.DELIVERY && status === ORDER_STATUS.OUT_FOR_DELIVERY) {
    return [];
  }
  return ORDER_TRANSITIONS[status] || [];
}

/** Statuses a customer may cancel from themselves. */
export const CUSTOMER_CANCELLABLE = Object.freeze([
  ORDER_STATUS.AWAITING_PAYMENT,
  ORDER_STATUS.PLACED,
]);

export const PAYMENT_STATUS = Object.freeze({
  /** Payment will be collected in person (counter, table or on pickup). */
  PAY_AT_RESTAURANT: 'pay_at_restaurant',
  /** Cash on delivery: the rider collects at the door. */
  COLLECT_ON_DELIVERY: 'collect_on_delivery',
  PENDING: 'pending',
  PAID: 'paid',
  FAILED: 'failed',
  REFUNDED: 'refunded',
});

export const PAYMENT_STATUS_VALUES = Object.values(PAYMENT_STATUS);

export const PAYMENT_METHOD = Object.freeze({
  ONLINE: 'online',
  /** Settled at the counter or the table — collection and dine-in channels. */
  AT_RESTAURANT: 'at_restaurant',
  /** Cash handed to the rider at the door. Delivery only. */
  COD: 'cod',
});

/**
 * Methods where no money moves until the food does.
 *
 * These orders reach the kitchen immediately, unlike an online payment which has
 * to clear first — so anywhere the code asks "is this order already good to
 * cook?", it is really asking whether the method is one of these.
 */
export const PAY_LATER_METHODS = Object.freeze([
  PAYMENT_METHOD.AT_RESTAURANT,
  PAYMENT_METHOD.COD,
]);

export const PAYMENT_METHOD_VALUES = Object.values(PAYMENT_METHOD);

/* ────────────────────────── allergens ────────────────────────── */

/**
 * The allergens a guest can declare on their profile.
 *
 * A fixed list, not free text: matching "peanut" against a dish that lists
 * "peanuts" has to be reliable, and a warning that fails to fire because of a
 * plural is worse than no warning at all.
 */
export const ALLERGENS = Object.freeze([
  'peanuts', 'tree nuts', 'dairy', 'eggs', 'gluten', 'soy',
  'shellfish', 'fish', 'sesame', 'mustard', 'celery', 'sulphites',
]);

/** Synonyms seen in menu data, so a differently-worded dish still matches. */
export const ALLERGEN_ALIASES = Object.freeze({
  peanuts: ['peanut', 'groundnut', 'groundnuts'],
  'tree nuts': ['nuts', 'nut', 'cashew', 'cashews', 'almond', 'almonds', 'walnut', 'walnuts', 'pistachio', 'pistachios'],
  dairy: ['milk', 'butter', 'cheese', 'cream', 'ghee', 'paneer', 'yoghurt', 'yogurt', 'curd', 'khoya'],
  eggs: ['egg', 'mayonnaise', 'mayo'],
  gluten: ['wheat', 'flour', 'maida', 'atta', 'barley', 'rye', 'bread', 'pasta', 'noodles'],
  soy: ['soya', 'soybean', 'tofu', 'soy sauce'],
  shellfish: ['prawn', 'prawns', 'shrimp', 'crab', 'lobster'],
  fish: ['anchovy', 'anchovies', 'tuna', 'salmon'],
  sesame: ['til', 'tahini'],
  mustard: ['sarson', 'rai'],
  celery: [],
  sulphites: ['sulphite', 'sulfite'],
});

/* ────────────────────────── loyalty ────────────────────────── */

/**
 * Tiers are derived from LIFETIME points, never from the spendable balance —
 * otherwise redeeming points would demote a customer, which is the opposite of
 * what a loyalty scheme is for.
 */
export const LOYALTY_TIERS = Object.freeze([
  { key: 'bronze', name: 'Bronze', minLifetimePoints: 0, bonusPercent: 0 },
  { key: 'silver', name: 'Silver', minLifetimePoints: 500, bonusPercent: 5 },
  { key: 'gold', name: 'Gold', minLifetimePoints: 1500, bonusPercent: 10 },
  { key: 'platinum', name: 'Platinum', minLifetimePoints: 4000, bonusPercent: 15 },
]);

export const LOYALTY_TIER_KEYS = LOYALTY_TIERS.map((t) => t.key);

/** The highest tier whose threshold this lifetime total has reached. */
export function tierFor(lifetimePoints = 0) {
  let current = LOYALTY_TIERS[0];
  for (const t of LOYALTY_TIERS) if (lifetimePoints >= t.minLifetimePoints) current = t;
  return current;
}

export const LOYALTY_LEDGER_REASONS = Object.freeze([
  'earned',
  'redeemed',
  'refunded',
  'expired',
  'adjustment',
]);

export const DEFAULT_CATEGORIES = Object.freeze([
  'Starters',
  'Main Course',
  'Pizza',
  'Burger',
  'Pasta',
  'Biryani',
  'Desserts',
  'Beverages',
  'Salads',
  'Soups',
]);
