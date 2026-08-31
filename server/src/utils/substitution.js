import { MenuItem } from '../models/MenuItem.js';
import { checkDish } from './allergens.js';

/**
 * Dish substitution — "Chicken Burger is off tonight. Paneer Burger instead?"
 *
 * Scored similarity over the menu's own structured fields. No model involved:
 * the useful signals here (same category, similar price, shared ingredients)
 * are all recorded data, and a deterministic score is both explainable and
 * instant, which matters when this fires at the moment a dish sells out.
 *
 * Dietary type is a one-way rule rather than a score. Offering a vegetarian a
 * meat substitute is a failure however similar the dishes are; offering a
 * meat-eater a paneer version of a chicken dish is a perfectly good suggestion.
 */

const WEIGHTS = {
  sameCategory: 5.0,
  sharedIngredient: 1.2,
  priceCloseness: 2.5,
  rating: 1.0,
  popular: 0.8,
  nameEcho: 1.5,
};

/** Vegetarians and vegans are never offered a step "up" the dietary ladder. */
function dietAllows(originalType, candidateType) {
  if (originalType === 'vegan') return candidateType === 'vegan';
  if (originalType === 'veg') return candidateType === 'veg' || candidateType === 'vegan';
  return true; // a non-veg dish can be replaced by anything
}

/** Words worth matching on: drops "of", "with", and other filler. */
function keywords(name) {
  return String(name)
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length > 3 && !['with', 'and', 'the', 'style', 'special'].includes(w));
}

/**
 * @param {object} dish        the unavailable dish
 * @param {object} opts
 * @param {number} [opts.limit]
 * @param {string[]} [opts.allergies]  suppress anything that breaches these
 */
export async function findAlternatives(dish, { limit = 3, allergies = [] } = {}) {
  if (!dish) return [];

  const candidates = await MenuItem.find({
    _id: { $ne: dish._id },
    isAvailable: true,
  })
    .populate('category', 'name')
    .lean();

  const originalIngredients = new Set((dish.ingredients || []).map((i) => String(i).toLowerCase()));
  const originalWords = new Set(keywords(dish.name));
  const originalCategory = String(dish.category?._id || dish.category || '');

  const scored = candidates
    .filter((c) => dietAllows(dish.foodType, c.foodType))
    // Never suggest something the guest is allergic to — a substitution is a
    // recommendation, and recommending an allergen is worse than saying nothing.
    .filter((c) => checkDish(c, allergies).length === 0)
    .map((c) => {
      const sameCategory = String(c.category?._id || c.category || '') === originalCategory;

      const shared = (c.ingredients || []).filter((i) =>
        originalIngredients.has(String(i).toLowerCase()),
      ).length;

      // 1 when identically priced, falling to 0 at double or half the price.
      const priceScore = 1 - Math.min(Math.abs(c.price - dish.price) / (dish.price || 1), 1);

      const echo = keywords(c.name).filter((w) => originalWords.has(w)).length;

      const score =
        (sameCategory ? WEIGHTS.sameCategory : 0) +
        WEIGHTS.sharedIngredient * shared +
        WEIGHTS.priceCloseness * priceScore +
        WEIGHTS.rating * ((c.rating?.average || 0) / 5) +
        (c.isPopular ? WEIGHTS.popular : 0) +
        WEIGHTS.nameEcho * echo;

      // The strongest signal becomes the sentence the guest reads.
      let reason;
      if (echo > 0 && sameCategory) reason = `The ${c.foodType === 'non_veg' ? '' : 'veg '}version of the same dish`;
      else if (sameCategory) reason = `Also from ${c.category?.name || 'the same section'}`;
      else if (shared > 1) reason = `Made with the same ${(c.ingredients || []).find((i) => originalIngredients.has(String(i).toLowerCase()))}`;
      else if (priceScore > 0.85) reason = 'Similar dish at about the same price';
      else reason = 'A popular alternative';

      return { dish: c, score, reason };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map(({ dish: d, reason, score }) => ({
    ...d,
    reason,
    score: Number(score.toFixed(2)),
    priceDifference: d.price - dish.price,
  }));
}

/**
 * Checks a whole cart and proposes replacements for anything now unavailable.
 * Used when a dish sells out between browsing and checkout.
 */
export async function reviewCart(lines, { allergies = [] } = {}) {
  const ids = lines.map((l) => l.menuItem);
  const dishes = await MenuItem.find({ _id: { $in: ids } })
    .populate('category', 'name')
    .lean();
  const byId = new Map(dishes.map((d) => [String(d._id), d]));

  const problems = [];
  for (const line of lines) {
    const dish = byId.get(String(line.menuItem));
    if (!dish) {
      problems.push({ menuItem: line.menuItem, name: 'That dish', issue: 'removed', alternatives: [] });
      continue;
    }

    if (!dish.isAvailable) {
      problems.push({
        menuItem: String(dish._id),
        name: dish.name,
        issue: 'unavailable',
        alternatives: await findAlternatives(dish, { allergies }),
      });
      continue;
    }

    const hits = checkDish(dish, allergies);
    if (hits.length) {
      problems.push({
        menuItem: String(dish._id),
        name: dish.name,
        issue: 'allergen',
        warnings: hits,
        alternatives: await findAlternatives(dish, { allergies }),
      });
    }
  }

  return problems;
}
