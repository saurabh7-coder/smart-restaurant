import { MenuItem } from '../models/MenuItem.js';
import { Offer } from '../models/Offer.js';
import { ApiError } from './ApiError.js';

/** Rupees (as stored on MenuItem) → integer paise. */
export const toPaise = (rupees) => Math.round(Number(rupees) * 100);

/** Integer paise → rupees, for display or logging only. */
export const toRupees = (p) => Math.round(Number(p)) / 100;

/**
 * Recomputes an entire bill from scratch using CURRENT database prices.
 *
 * The client sends only { menuItem, quantity, note } — never a price, never a
 * total. Anything money-related that arrived from the browser is ignored, so a
 * tampered request cannot buy a ₹499 dish for ₹1. This function is the single
 * source of truth for what an order costs, and both order creation and payment
 * initiation call it.
 *
 * @returns {{ items: object[], amounts: object, offer: object|null }}
 */
export async function priceOrder({ items, offerCode, taxPercent, guests = 1, delivery = null }) {
  if (!Array.isArray(items) || items.length === 0) {
    throw ApiError.badRequest('Your cart is empty.');
  }

  // Collapse duplicates so sending the same dish twice adds up rather than
  // creating two lines that each pass the per-line quantity cap.
  const wanted = new Map();
  for (const raw of items) {
    const id = String(raw.menuItem || '');
    const qty = Number(raw.quantity);

    if (!/^[a-f0-9]{24}$/i.test(id)) throw ApiError.badRequest('Your cart contains an invalid dish.');
    if (!Number.isInteger(qty) || qty < 1) {
      throw ApiError.badRequest('Every cart line needs a whole quantity of at least 1.');
    }

    const existing = wanted.get(id);
    if (existing) {
      existing.quantity += qty;
      if (raw.note) existing.note = String(raw.note).slice(0, 200);
    } else {
      wanted.set(id, { quantity: qty, note: raw.note ? String(raw.note).slice(0, 200) : '' });
    }
  }

  for (const [, line] of wanted) {
    if (line.quantity > 50) {
      throw ApiError.badRequest('Maximum 50 of any single dish per order. Please call us for large orders.');
    }
  }

  const found = await MenuItem.find({ _id: { $in: [...wanted.keys()] } })
    .select('name price foodType isAvailable')
    .lean();

  if (found.length !== wanted.size) {
    throw ApiError.badRequest('One or more dishes in your cart no longer exist on the menu.');
  }

  const unavailable = found.filter((d) => !d.isAvailable);
  if (unavailable.length > 0) {
    throw ApiError.conflict(
      `Sorry — ${unavailable.map((d) => d.name).join(', ')} ${unavailable.length === 1 ? 'is' : 'are'} not available right now. Please remove ${unavailable.length === 1 ? 'it' : 'them'} from your cart.`,
      { unavailable: unavailable.map((d) => String(d._id)) },
    );
  }

  const priced = found.map((dish) => {
    const line = wanted.get(String(dish._id));
    const unitPrice = toPaise(dish.price);
    return {
      menuItem: dish._id,
      name: dish.name,
      foodType: dish.foodType,
      unitPrice,
      quantity: line.quantity,
      lineTotal: unitPrice * line.quantity,
      note: line.note,
    };
  });

  const subtotal = priced.reduce((sum, i) => sum + i.lineTotal, 0);

  /* ---- discount ---- */
  let discount = 0;
  let offer = null;

  if (offerCode) {
    offer = await Offer.findOne({ code: String(offerCode).toUpperCase().trim() });
    if (!offer) {
      throw ApiError.badRequest('That promo code is not valid.', { offerCode: 'Unknown code' });
    }

    const problem = offer.validityError(guests);
    if (problem) throw ApiError.badRequest(problem, { offerCode: problem });

    discount =
      offer.discountType === 'percent'
        ? Math.round((subtotal * offer.discountValue) / 100)
        : toPaise(offer.discountValue);

    // A flat discount larger than the bill must not produce a negative total.
    discount = Math.min(discount, subtotal);
  }

  const taxable = subtotal - discount;
  const tax = Math.round((taxable * Number(taxPercent || 0)) / 100);

  /* ---- delivery fee ---- */
  /**
   * Charged after tax, on the food value rather than the taxed amount, so the
   * "free over ₹X" threshold means what a customer expects it to mean — the
   * value of the food they ordered, not a figure inflated by GST.
   *
   * Real Indian GST does apply to delivery charges; this keeps the demo's
   * arithmetic transparent instead, and the README says so.
   */
  let deliveryFee = 0;
  if (delivery?.applies) {
    const freeAbovePaise = toPaise(delivery.freeAbove || 0);
    const qualifiesFree = delivery.freeAbove > 0 && taxable >= freeAbovePaise;
    deliveryFee = qualifiesFree ? 0 : toPaise(delivery.fee || 0);
  }

  const total = taxable + tax + deliveryFee;

  return {
    items: priced,
    offer,
    amounts: {
      subtotal,
      discount,
      taxable,
      tax,
      deliveryFee,
      total,
      taxPercent: Number(taxPercent || 0),
    },
  };
}
