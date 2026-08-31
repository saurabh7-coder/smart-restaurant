import { MenuItem } from '../models/MenuItem.js';
import { Restaurant } from '../models/Restaurant.js';
import { complete, isAiConfigured } from '../services/claude.js';
import { checkDish } from './allergens.js';

/**
 * The food chatbot — "What's the best vegetarian dish under ₹300?"
 *
 * ── How the two engines split the work ───────────────────────────────────────
 * Claude answers the question, but it does NOT supply the facts. The menu, the
 * prices and the opening hours are read from the database and handed to it, and
 * it is told to answer only from that. A chatbot that invents a dish or quotes
 * a price the kitchen doesn't charge is worse than no chatbot, and a restaurant
 * cannot honour a made-up ₹200 biryani.
 *
 * Without a key, a structured intent parser handles the questions guests
 * actually ask — price ceilings, dietary filters, categories, spiciness,
 * "what's popular" — by querying the same menu. Narrower, still accurate.
 */

const MAX_DISHES_IN_CONTEXT = 70;

/* ─────────────────────────── shared retrieval ─────────────────────────── */

async function menuContext() {
  const [dishes, restaurant] = await Promise.all([
    MenuItem.find({ isAvailable: true }).populate('category', 'name').lean(),
    Restaurant.getSingleton(),
  ]);
  return { dishes, restaurant };
}

/* ─────────────────────────── the Claude engine ─────────────────────────── */

function systemPrompt(restaurant) {
  return `You are the assistant for ${restaurant.name}, a restaurant. You help guests choose what to eat.

Answer only from the menu given in the user's message. Never invent a dish, a price, an
ingredient or an allergen. If the menu does not contain something the guest asks for,
say so plainly and suggest the closest thing that is on it.

Prices are in Indian rupees; write them as ₹349. Recommend two or three dishes at most and
say briefly why each fits what they asked. Keep replies to a short paragraph — this is a
guest deciding what to eat, not a research request.

When a guest mentions an allergy, only recommend dishes whose allergen list is clear of it,
and tell them to confirm with staff on arrival — the menu data is a guide, not a guarantee.

If a question is not about the food, the menu, or dining here, say that is outside what you
can help with and point them to the contact page.`;
}

function dishLine(d) {
  const bits = [
    d.name,
    `₹${d.price}`,
    d.foodType === 'non_veg' ? 'non-veg' : d.foodType,
    d.category?.name,
  ];
  if (d.calories) bits.push(`${d.calories} kcal`);
  if (d.spiceLevel) bits.push(`spice ${d.spiceLevel}/5`);
  if (d.rating?.count) bits.push(`rated ${d.rating.average.toFixed(1)}`);
  if (d.isPopular) bits.push('popular');
  if (d.allergens?.length) bits.push(`allergens: ${d.allergens.join('/')}`);
  return `- ${bits.filter(Boolean).join(' · ')}`;
}

/* ─────────────────────── the built-in intent engine ─────────────────────── */

/** Content words only: short words and plurals are too noisy to match on. */
function normaliseWords(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .map((w) => (w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
}

/** Scaffolding around the actual request; never evidence of a missing dish. */
const QUESTION_WORDS = new Set([
  'have', 'serve', 'sell', 'offer', 'give', 'want', 'like', 'need', 'looking',
  'there', 'anything', 'something', 'available', 'menu', 'dish', 'dishes',
  'food', 'order', 'please', 'could', 'would', '什么', 'your', 'about', 'know',
  'tell', 'recommend', 'suggestion', 'suggest', 'today', 'here', 'what', 'does',
  'restaurant', 'kitchen', 'meal', 'option', 'thing', 'that', 'this', 'with',
]);

/**
 * Handles the shapes of question guests actually ask, by filtering the menu.
 * Every branch answers from real data or admits it cannot.
 */
function answerLocally(question, dishes, restaurant) {
  const q = question.toLowerCase();

  /* hours / location — answered from the restaurant record */
  if (/\b(open|hours|timing|close|closing)\b/.test(q)) {
    return {
      answer: `We are open daily from ${restaurant.openTime} to ${restaurant.closeTime}.`,
      dishes: [],
    };
  }
  if (/\b(where|address|located|location|reach|directions)\b/.test(q)) {
    return { answer: `We are at ${restaurant.address}. You can call us on ${restaurant.phone}.`, dishes: [] };
  }

  let pool = [...dishes];
  const filters = [];

  /* dietary */
  if (/\bvegan\b/.test(q)) {
    pool = pool.filter((d) => d.foodType === 'vegan');
    filters.push('vegan');
  } else if (/\b(veg|vegetarian)\b/.test(q) && !/non[- ]?veg/.test(q)) {
    pool = pool.filter((d) => d.foodType === 'veg' || d.foodType === 'vegan');
    filters.push('vegetarian');
  } else if (/\b(non[- ]?veg|chicken|mutton|lamb|fish|prawn|meat)\b/.test(q)) {
    pool = pool.filter((d) => d.foodType === 'non_veg');
    filters.push('non-veg');
  }

  /* price ceiling — "under 300", "below ₹500", "less than 250" */
  const under = q.match(/(?:under|below|less than|within|max|upto|up to|cheaper than)\s*₹?\s*(\d+)/);
  if (under) {
    const cap = Number(under[1]);
    pool = pool.filter((d) => d.price <= cap);
    filters.push(`under ₹${cap}`);
  }

  /* calorie ceiling — for the health-conscious guest */
  const kcal = q.match(/(?:under|below|less than)\s*(\d+)\s*(?:kcal|calorie)/);
  if (kcal) {
    const cap = Number(kcal[1]);
    pool = pool.filter((d) => d.calories && d.calories <= cap);
    filters.push(`under ${cap} kcal`);
  }

  /* category / dish word */
  const categories = [...new Set(dishes.map((d) => d.category?.name).filter(Boolean))];
  const category = categories.find((c) => q.includes(c.toLowerCase()));
  if (category) {
    pool = pool.filter((d) => d.category?.name === category);
    filters.push(category.toLowerCase());
  }

  /* spice */
  if (/\b(mild|not spicy|less spicy|no spice)\b/.test(q)) {
    pool = pool.filter((d) => (d.spiceLevel || 0) <= 2);
    filters.push('mild');
  } else if (/\b(spicy|hot)\b/.test(q)) {
    pool = pool.filter((d) => (d.spiceLevel || 0) >= 3);
    filters.push('spicy');
  }

  /* allergy */
  const allergyMatch = q.match(/allergic to ([a-z ,]+)/);
  if (allergyMatch) {
    const declared = allergyMatch[1].split(/,|\band\b/).map((s) => s.trim()).filter(Boolean);
    pool = pool.filter((d) => checkDish(d, declared).length === 0);
    filters.push(`free of ${declared.join(', ')}`);
  }

  if (pool.length === 0) {
    return {
      answer: `I could not find anything on the menu that is ${filters.join(' and ')}. Try widening the price range, or ask me for something else.`,
      dishes: [],
    };
  }

  /*
   * "Do you have sushi?" — no filter matched, but the guest clearly named a
   * food we do not serve. Without this check the engine falls through to
   * "here are our popular dishes", which reads as though sushi is one of them.
   * Saying no plainly is the honest answer, and the suggestions are framed as
   * alternatives rather than as what was asked for.
   */
  if (filters.length === 0) {
    const vocabulary = new Set();
    for (const d of dishes) {
      for (const w of normaliseWords(d.name)) vocabulary.add(w);
      for (const i of d.ingredients || []) for (const w of normaliseWords(i)) vocabulary.add(w);
      for (const w of normaliseWords(d.category?.name || '')) vocabulary.add(w);
    }

    const asked = normaliseWords(q).filter((w) => !QUESTION_WORDS.has(w));
    const unknown = asked.filter((w) => !vocabulary.has(w));

    if (asked.length > 0 && unknown.length > 0) {
      const known = asked.filter((w) => vocabulary.has(w));

      // Partly ours — "ramen noodles". Answer with the noodle dishes we do
      // have, while being clear that the ramen part is not on the menu.
      if (known.length > 0) {
        const near = dishes.filter((d) => {
          const text = normaliseWords(`${d.name} ${(d.ingredients || []).join(' ')} ${d.category?.name || ''}`);
          return known.some((w) => text.includes(w));
        });
        if (near.length > 0) {
          const picks = near
            .sort((a, b) => Number(b.isPopular) - Number(a.isPopular) || (b.rating?.average || 0) - (a.rating?.average || 0))
            .slice(0, 3);
          return {
            answer:
              `We do not have ${unknown.join(' ')}, but we do have ` +
              `${picks.map((d) => `${d.name} (₹${d.price})`).join(', ')}.`,
            dishes: picks,
          };
        }
      }

      // None of it is ours — say no, then offer what the kitchen is known for.
      if (unknown.length === asked.length) {
        const popular = [...dishes]
          .sort((a, b) => Number(b.isPopular) - Number(a.isPopular) || (b.rating?.average || 0) - (a.rating?.average || 0))
          .slice(0, 3);
        return {
          answer:
            `We do not have ${unknown.join(' ')} on the menu. What we are known for is ` +
            `${popular.map((d) => d.name).join(', ')} — happy to tell you about any of them.`,
          dishes: popular,
        };
      }
    }
  }

  // "best" / "recommend" → rank by rating; otherwise by popularity then price.
  const wantsBest = /\b(best|top|recommend|good|nice|favourite|favorite)\b/.test(q);
  pool.sort((a, b) =>
    wantsBest
      ? (b.rating?.average || 0) - (a.rating?.average || 0) || Number(b.isPopular) - Number(a.isPopular)
      : Number(b.isPopular) - Number(a.isPopular) || (b.rating?.average || 0) - (a.rating?.average || 0),
  );

  const picks = pool.slice(0, 3);
  const label = filters.length ? filters.join(', ') : 'on the menu';
  const named = picks
    .map((d) => `${d.name} (₹${d.price}${d.rating?.count ? `, rated ${d.rating.average.toFixed(1)}` : ''})`)
    .join(', ');

  return {
    answer: `${picks.length === 1 ? 'One option' : `${picks.length} options`} ${label}: ${named}.`,
    dishes: picks,
  };
}

/* ─────────────────────────── the public API ─────────────────────────── */

/**
 * @param {string} question
 * @param {object} [opts]
 * @param {string[]} [opts.allergies]  the guest's declared allergens
 * @param {Array}    [opts.history]    prior turns, oldest first
 */
export async function ask(question, { allergies = [], history = [] } = {}) {
  const trimmed = String(question || '').trim();
  if (!trimmed) return { engine: 'built-in', answer: 'Ask me anything about the menu.', dishes: [] };

  const { dishes, restaurant } = await menuContext();
  if (dishes.length === 0) {
    return { engine: 'built-in', answer: 'The menu is not published yet — please check back shortly.', dishes: [] };
  }

  if (isAiConfigured()) {
    // Rank before truncating, so if the menu outgrows the context budget it is
    // the least relevant dishes that are dropped, not an arbitrary tail.
    const relevant = [...dishes]
      .sort((a, b) => Number(b.isPopular) - Number(a.isPopular) || (b.rating?.average || 0) - (a.rating?.average || 0))
      .slice(0, MAX_DISHES_IN_CONTEXT);

    const context = [
      `MENU (${relevant.length} of ${dishes.length} dishes):`,
      ...relevant.map(dishLine),
      '',
      `OPENING HOURS: ${restaurant.openTime}–${restaurant.closeTime} daily`,
      `ADDRESS: ${restaurant.address}`,
      allergies.length ? `\nThis guest is allergic to: ${allergies.join(', ')}.` : '',
      history.length
        ? `\nEARLIER IN THIS CHAT:\n${history.slice(-4).map((h) => `${h.role}: ${h.text}`).join('\n')}`
        : '',
      `\nGUEST'S QUESTION: ${trimmed}`,
    ]
      .filter(Boolean)
      .join('\n');

    const answer = await complete({
      system: systemPrompt(restaurant),
      prompt: context,
      maxTokens: 700,
      timeoutMs: 20000,
    });

    if (answer) {
      // Link any dish the reply names, so the guest can add it in one tap.
      const mentioned = dishes.filter((d) => answer.toLowerCase().includes(d.name.toLowerCase()));
      return { engine: 'claude', answer, dishes: mentioned.slice(0, 4) };
    }
  }

  const local = answerLocally(trimmed, dishes, restaurant);
  return { engine: 'built-in', ...local };
}
