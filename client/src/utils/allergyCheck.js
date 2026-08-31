/**
 * Client-side allergy matching.
 *
 * A deliberate mirror of the server's `utils/allergens.js`. The server remains
 * the authority — it screens the cart and the order — but a warning is only
 * useful if it appears on the card the guest is looking at, before they add it,
 * and doing that per-card over the network would be one request per dish.
 *
 * The rules must stay identical to the server's, so the two are edited together.
 */

const ALIASES = {
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
};

/** Whole-word match, so "nut" never fires on "coconut". */
const mentions = (haystack, term) =>
  new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?\\b`, 'i').test(haystack);

/**
 * @returns {string} the warning line, or '' when the dish is clear
 */
export function checkAgainst(dish, allergies) {
  if (!dish || !allergies?.length) return '';

  const declared = (dish.allergens || []).join(' , ').toLowerCase();
  const ingredients = (dish.ingredients || []).join(' , ').toLowerCase();

  const certain = [];
  const possible = [];

  for (const allergen of allergies) {
    const key = String(allergen).toLowerCase();
    const terms = [key, ...(ALIASES[key] || [])];

    // The kitchen's own allergen list outranks anything inferred from ingredients.
    if (terms.some((t) => mentions(declared, t))) certain.push(key);
    else if (terms.some((t) => mentions(ingredients, t))) possible.push(key);
  }

  if (certain.length === 0 && possible.length === 0) return '';

  const list = (items) =>
    items.length === 1 ? items[0] : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

  const parts = [];
  if (certain.length) parts.push(`contains ${list(certain)}`);
  if (possible.length) parts.push(`may contain ${list(possible)}`);
  return `This dish ${parts.join(', and ')}.`;
}
