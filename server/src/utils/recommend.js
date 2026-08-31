import { Order } from '../models/Order.js';
import { MenuItem } from '../models/MenuItem.js';
import { ORDER_STATUS } from '../constants.js';

/**
 * Dish recommendations.
 *
 * ── What this is, plainly ────────────────────────────────────────────────────
 * A recommender built from this restaurant's own order history, combining two
 * classic signals. There is no language model involved, and calling it "AI" in
 * the marketing sense would overstate it — so the API returns a `reason` with
 * every suggestion and the UI shows it. A customer can always see *why* a dish
 * was put in front of them.
 *
 *   1. ITEM-TO-ITEM CO-OCCURRENCE ("ordered together")
 *      Find past orders containing the dishes this customer has ordered, then
 *      count what else appeared in those same orders. This is the signal that
 *      surfaces genuinely non-obvious pairings — naan with a curry, a cold
 *      drink with something spicy — because it learns them from real baskets
 *      rather than from anyone's assumptions.
 *
 *   2. CONTENT AFFINITY ("more like what you order")
 *      Category, dietary type and price band drawn from the same history.
 *      This carries the weight when co-occurrence data is thin, which it always
 *      is for a young restaurant.
 *
 * A brand-new customer has neither, so they fall back to what is genuinely
 * popular and well rated — the honest answer to "we don't know you yet".
 */

const WEIGHTS = {
  coOccurrence: 3.0,
  category: 1.6,
  diet: 1.2,
  priceBand: 0.6,
  rating: 0.9,
  popular: 0.7,
  special: 0.5,
  /** Pushes down things they order all the time — recommendations should widen taste. */
  alreadyOrdered: -2.5,
};

/** Orders that reflect a real preference: placed by this customer, not cancelled. */
const REAL_ORDERS = { status: { $ne: ORDER_STATUS.CANCELLED } };

export async function recommendDishes({ user, limit = 10, excludeIds = [] }) {
  const available = await MenuItem.find({ isAvailable: true })
    .populate('category', 'name')
    .lean();

  const exclude = new Set(excludeIds.map(String));
  const pool = available.filter((d) => !exclude.has(String(d._id)));
  if (pool.length === 0) return { items: [], basis: 'empty-menu' };

  /* ---------- cold start ---------- */
  if (!user) return { items: popularFallback(pool, limit), basis: 'popular' };

  const history = await Order.find({ user: user._id, ...REAL_ORDERS })
    .select('items.menuItem items.name')
    .sort({ createdAt: -1 })
    .limit(40)
    .lean();

  const ordered = new Map(); // menuItemId -> times ordered
  for (const o of history) {
    for (const line of o.items) {
      const id = String(line.menuItem);
      ordered.set(id, (ordered.get(id) || 0) + 1);
    }
  }

  if (ordered.size === 0) {
    return { items: popularFallback(pool, limit), basis: 'popular' };
  }

  /* ---------- signal 1: what else appeared in the same baskets ---------- */
  const orderedIds = [...ordered.keys()];
  const baskets = await Order.find({
    'items.menuItem': { $in: orderedIds },
    user: { $ne: user._id }, // other people's baskets — that is the point
    ...REAL_ORDERS,
  })
    .select('items.menuItem items.name')
    .limit(400)
    .lean();

  const coCount = new Map(); // candidateId -> { count, becauseOf }
  for (const basket of baskets) {
    const ids = basket.items.map((i) => String(i.menuItem));
    const anchorIdx = ids.findIndex((id) => ordered.has(id));
    if (anchorIdx === -1) continue;
    const anchorName = basket.items[anchorIdx].name;

    for (const line of basket.items) {
      const id = String(line.menuItem);
      if (ordered.has(id) || exclude.has(id)) continue;
      const entry = coCount.get(id) || { count: 0, becauseOf: anchorName };
      entry.count += 1;
      coCount.set(id, entry);
    }
  }
  const maxCo = Math.max(1, ...[...coCount.values()].map((v) => v.count));

  /* ---------- signal 2: their own taste profile ---------- */
  const historyItems = available.filter((d) => ordered.has(String(d._id)));
  const catWeight = new Map();
  const dietWeight = new Map();
  let priceSum = 0;

  for (const d of historyItems) {
    const times = ordered.get(String(d._id)) || 1;
    const cat = d.category?.name;
    if (cat) catWeight.set(cat, (catWeight.get(cat) || 0) + times);
    dietWeight.set(d.foodType, (dietWeight.get(d.foodType) || 0) + times);
    priceSum += d.price * times;
  }
  const totalTimes = [...ordered.values()].reduce((a, b) => a + b, 0) || 1;
  const avgPrice = priceSum / totalTimes;
  const maxCat = Math.max(1, ...catWeight.values());
  const maxDiet = Math.max(1, ...dietWeight.values());

  /**
   * Someone who only ever orders vegetarian food should not be shown meat.
   * This is a dietary boundary, not a preference to be nudged — so it filters
   * rather than merely scoring.
   */
  const eatsMeat = (dietWeight.get('non_veg') || 0) > 0;

  /* ---------- score ---------- */
  const scored = pool
    .filter((d) => eatsMeat || d.foodType !== 'non_veg')
    .map((d) => {
      const id = String(d._id);
      const co = coCount.get(id);
      const cat = d.category?.name;

      const coScore = co ? co.count / maxCo : 0;
      const catScore = cat ? (catWeight.get(cat) || 0) / maxCat : 0;
      const dietScore = (dietWeight.get(d.foodType) || 0) / maxDiet;
      // 1 when identical to their usual spend, falling off either side.
      const priceScore = 1 - Math.min(Math.abs(d.price - avgPrice) / (avgPrice || 1), 1);
      const ratingScore = (d.rating?.average || 0) / 5;

      const score =
        WEIGHTS.coOccurrence * coScore +
        WEIGHTS.category * catScore +
        WEIGHTS.diet * dietScore +
        WEIGHTS.priceBand * priceScore +
        WEIGHTS.rating * ratingScore +
        (d.isPopular ? WEIGHTS.popular : 0) +
        (d.isTodaysSpecial ? WEIGHTS.special : 0) +
        (ordered.has(id) ? WEIGHTS.alreadyOrdered : 0);

      // The strongest contributing signal becomes the explanation.
      let reason = 'Popular with our guests';
      if (co && WEIGHTS.coOccurrence * coScore >= WEIGHTS.category * catScore) {
        reason = `Often ordered with ${co.becauseOf}`;
      } else if (cat && catScore > 0.3) {
        reason = `You order a lot from ${cat}`;
      } else if (dietScore > 0.5) {
        reason = `Matches the ${d.foodType === 'non_veg' ? 'non-veg' : d.foodType} food you usually pick`;
      } else if ((d.rating?.count || 0) > 0 && ratingScore > 0.8) {
        reason = `Rated ${d.rating.average.toFixed(1)} by other guests`;
      }

      return { dish: d, score, reason };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return {
    items: scored.map(({ dish, reason, score }) => ({ ...dish, reason, score: Number(score.toFixed(3)) })),
    basis: coCount.size > 0 ? 'personalised' : 'taste-profile',
  };
}

/** No history to learn from: show what is actually popular and well rated. */
function popularFallback(pool, limit) {
  return [...pool]
    .sort(
      (a, b) =>
        Number(b.isPopular) - Number(a.isPopular) ||
        (b.rating?.average || 0) - (a.rating?.average || 0) ||
        (b.rating?.count || 0) - (a.rating?.count || 0),
    )
    .slice(0, limit)
    .map((d) => ({
      ...d,
      reason: d.isPopular ? 'One of our most ordered dishes' : 'Highly rated by guests',
      score: null,
    }));
}
