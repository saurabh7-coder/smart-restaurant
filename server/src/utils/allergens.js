import { ALLERGENS, ALLERGEN_ALIASES } from '../constants.js';

/**
 * Allergy warnings.
 *
 * ── Not an AI feature, deliberately ──────────────────────────────────────────
 * This is exact matching against the allergens and ingredients already stored
 * on each dish. A guess about whether a dish contains peanuts is worth less
 * than nothing: someone could be hospitalised by a plausible-sounding
 * inference. So there is no model in this path and never should be — only
 * recorded data, matched literally.
 *
 * The result distinguishes two strengths of warning, because they mean
 * genuinely different things to the person reading them:
 *
 *   'contains'  — the kitchen has declared this allergen on the dish.
 *   'may'       — the allergen was inferred from an ingredient name (butter →
 *                 dairy). Softer, and phrased so nobody reads it as certainty.
 */

/** Every search term that should count as this allergen. */
function termsFor(allergen) {
  return [allergen, ...(ALLERGEN_ALIASES[allergen] || [])];
}

/** Whole-word match, so "nut" never fires on "coconut" or "butternut". */
function mentions(haystack, term) {
  return new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?\\b`, 'i').test(haystack);
}

/**
 * Checks one dish against a guest's declared allergens.
 * @returns {{allergen: string, level: 'contains'|'may', source: string}[]}
 */
export function checkDish(dish, allergies = []) {
  if (!dish || allergies.length === 0) return [];

  const declared = (dish.allergens || []).map((a) => String(a).toLowerCase());
  const ingredients = (dish.ingredients || []).map((i) => String(i).toLowerCase());
  const declaredText = declared.join(' , ');
  const ingredientText = ingredients.join(' , ');

  const hits = [];
  for (const allergen of allergies) {
    const key = String(allergen).toLowerCase();
    if (!ALLERGENS.includes(key)) continue;

    const terms = termsFor(key);

    // The kitchen's own allergen list is authoritative — check it first.
    const declaredHit = terms.find((t) => mentions(declaredText, t));
    if (declaredHit) {
      hits.push({ allergen: key, level: 'contains', source: `listed as "${declaredHit}"` });
      continue;
    }

    // Otherwise infer from ingredients, and say so.
    const ingredientHit = terms.find((t) => mentions(ingredientText, t));
    if (ingredientHit) {
      hits.push({ allergen: key, level: 'may', source: `contains ${ingredientHit}` });
    }
  }

  return hits;
}

/** Human-readable line for a set of hits on one dish. */
export function warningText(hits) {
  if (hits.length === 0) return '';

  const certain = hits.filter((h) => h.level === 'contains').map((h) => h.allergen);
  const possible = hits.filter((h) => h.level === 'may').map((h) => h.allergen);

  const parts = [];
  if (certain.length) parts.push(`contains ${list(certain)}`);
  if (possible.length) parts.push(`may contain ${list(possible)}`);

  return `This dish ${parts.join(', and ')}.`;
}

function list(items) {
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Annotates a list of dishes with the warnings for this guest. */
export function annotate(dishes, allergies = []) {
  if (allergies.length === 0) return dishes;
  return dishes.map((dish) => {
    const hits = checkDish(dish, allergies);
    return hits.length ? { ...dish, allergyWarnings: hits, allergyWarning: warningText(hits) } : dish;
  });
}

/** True if any dish in an order would breach the guest's declared allergies. */
export function screenOrder(dishes, allergies = []) {
  const flagged = [];
  for (const dish of dishes) {
    const hits = checkDish(dish, allergies);
    if (hits.length) flagged.push({ name: dish.name, id: dish._id, hits, text: warningText(hits) });
  }
  return flagged;
}
