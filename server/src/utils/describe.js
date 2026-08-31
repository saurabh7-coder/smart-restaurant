import { complete, isAiConfigured } from '../services/claude.js';

/**
 * Dish description generator, for the admin's menu editor.
 *
 * The admin types ingredients; this writes the sentence a guest reads. Of all
 * the features here this is the one where a language model is unambiguously the
 * right tool — writing appetising, non-repetitive prose is exactly what it is
 * good at, and there is no deterministic way to do it well.
 *
 * The fallback is honest about being a template. It assembles a correct,
 * readable sentence from the same fields so the admin is never blocked, but it
 * will not pretend to be writing.
 */

const SYSTEM = `You write menu descriptions for a restaurant.

One or two sentences, 20-35 words. Describe what the dish actually is and what eating
it is like — the texture, the cooking method, what carries the flavour. Use only the
ingredients given; never add one that isn't listed, because guests order from this and
someone with an allergy may read it.

Write plainly. No "tantalising", "burst of flavour", "culinary journey", "symphony",
"mouth-watering", or exclamation marks. No prices, no "our chef", no invented origin
stories. Don't open by repeating the dish name — the guest can already see it.

Return the description only, with no preamble or quotation marks.`;

/**
 * @param {object} dish  name, ingredients, category, foodType, spiceLevel
 * @returns {{text: string, engine: 'claude'|'built-in'}}
 */
export async function describeDish(dish) {
  const name = String(dish.name || '').trim();
  const ingredients = (dish.ingredients || []).map((i) => String(i).trim()).filter(Boolean);

  if (!name) return { text: '', engine: 'built-in' };

  if (isAiConfigured()) {
    const facts = [
      `Dish: ${name}`,
      dish.category ? `Category: ${dish.category}` : '',
      ingredients.length ? `Ingredients: ${ingredients.join(', ')}` : '',
      dish.foodType ? `Dietary: ${dish.foodType === 'non_veg' ? 'non-vegetarian' : dish.foodType}` : '',
      dish.spiceLevel ? `Spice level: ${dish.spiceLevel} out of 5` : '',
      dish.allergens?.length ? `Allergens: ${dish.allergens.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const text = await complete({
      system: SYSTEM,
      prompt: `Write the menu description for this dish.\n\n${facts}`,
      maxTokens: 200,
      timeoutMs: 15000,
    });

    // Models occasionally wrap prose in quotes despite being asked not to.
    if (text) return { text: text.replace(/^["']|["']$/g, '').trim(), engine: 'claude' };
  }

  return { text: template(name, ingredients, dish), engine: 'built-in' };
}

/**
 * Template fallback: correct and readable, obviously not written.
 *
 * Varies its opening on a hash of the dish name rather than at random, so the
 * same dish always produces the same description — an admin regenerating a
 * description should not get a different sentence each time for no reason.
 */
function template(name, ingredients, dish) {
  const openings = [
    'Made with',
    'Prepared with',
    'Cooked with',
    'Built on',
  ];
  const hash = [...name].reduce((n, c) => n + c.charCodeAt(0), 0);
  const opening = openings[hash % openings.length];

  const parts = [];

  if (ingredients.length === 0) {
    parts.push(`A ${dish.category ? `${String(dish.category).toLowerCase()} ` : ''}classic from our kitchen.`);
  } else if (ingredients.length === 1) {
    parts.push(`${opening} ${ingredients[0].toLowerCase()}.`);
  } else {
    const list = `${ingredients.slice(0, -1).join(', ').toLowerCase()} and ${ingredients[ingredients.length - 1].toLowerCase()}`;
    parts.push(`${opening} ${list}.`);
  }

  const spice = Number(dish.spiceLevel) || 0;
  if (spice >= 4) parts.push('Properly hot.');
  else if (spice === 3) parts.push('Moderately spiced.');
  else if (spice > 0) parts.push('Mildly spiced.');

  if (dish.foodType === 'vegan') parts.push('Fully plant based.');

  return parts.join(' ');
}
