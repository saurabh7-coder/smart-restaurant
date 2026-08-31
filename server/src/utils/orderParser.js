import { MenuItem } from '../models/MenuItem.js';

/**
 * Turns "I want two paneer pizzas and one coke" into cart lines.
 *
 * ── Where the speech recognition actually happens ────────────────────────────
 * In the browser, via the Web Speech API — it is built into Chrome, costs
 * nothing, needs no key, and never sends audio to us. This module receives the
 * transcribed *text* and does the part that genuinely needs the menu: working
 * out which dishes were named and how many of each.
 *
 * That matching is deliberately deterministic. The candidate set is a few dozen
 * known dish names, so fuzzy string matching is both more reliable and vastly
 * faster than asking a model — and when it is unsure it can say so honestly and
 * offer the near-misses, which is far better than confidently adding the wrong
 * dish to someone's bill.
 */

const NUMBER_WORDS = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  couple: 2, pair: 2, dozen: 12, half: 1,
};

/** Words that carry no dish information; dropped before matching. */
const FILLER = new Set([
  'i', 'want', 'would', 'like', 'get', 'me', 'please', 'can', 'could', 'have',
  'give', 'order', 'add', 'and', 'also', 'with', 'the', 'a', 'an', 'of', 'some',
  'for', 'to', 'my', 'we', 'us', 'plus', 'then', 'do', 'you', 'ill', 'let',
]);

/** Levenshtein distance, capped — speech transcripts misspell dish names constantly. */
function distance(a, b) {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 4) return 99;

  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i += 1) {
    const row = [i];
    for (let j = 1; j <= n; j += 1) {
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = row;
  }
  return prev[n];
}

const normalise = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Singularise the obvious plurals a speaker produces: "pizzas" → "pizza". */
const singular = (w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);

/**
 * How well a run of spoken words matches a dish name.
 * Returns 0..1; 1 is an exact match of the full name.
 */
function similarity(spokenWords, dishName) {
  const dishWords = normalise(dishName).split(' ').map(singular).filter(Boolean);
  const spoken = spokenWords.map(singular);
  if (dishWords.length === 0) return 0;

  let matched = 0;
  for (const dw of dishWords) {
    const hit = spoken.some((sw) => {
      if (sw === dw) return true;
      // Allow one typo per four characters — "panner" still finds "paneer".
      const tolerance = dw.length <= 4 ? 0 : dw.length <= 7 ? 1 : 2;
      return distance(sw, dw) <= tolerance;
    });
    if (hit) matched += 1;
  }

  const coverage = matched / dishWords.length;
  // Reward matching the *whole* dish name — "chicken" alone shouldn't beat
  // "chicken biryani" when the guest said both words.
  const specificity = matched / Math.max(spoken.length, 1);
  return coverage * 0.75 + Math.min(specificity, 1) * 0.25;
}

/**
 * Parses a spoken or typed order.
 *
 * @param {string} transcript
 * @returns {{lines, unmatched, transcript}}
 */
export async function parseOrder(transcript) {
  const text = normalise(transcript);
  if (!text) return { lines: [], unmatched: [], transcript };

  const menu = await MenuItem.find({ isAvailable: true })
    .select('name price foodType image calories')
    .lean();
  if (menu.length === 0) return { lines: [], unmatched: [], transcript };

  /*
   * Split on the conjunctions people actually use between items. Speech has no
   * punctuation, so "and", "plus" and "also" are the separators available.
   */
  const chunks = text
    .split(/\s+(?:and|plus|also|then|with)\s+/)
    .map((c) => c.trim())
    .filter(Boolean);

  const lines = [];
  const unmatched = [];

  for (const chunk of chunks) {
    const words = chunk.split(' ').filter(Boolean);

    /*
     * Quantity: the first number anywhere in the chunk, not just at the front.
     *
     * People say "I want two paneer tikka" as readily as "two paneer tikka",
     * so the number is often buried behind filler. Reading only position 0
     * silently turned every polite order into a quantity of one — the kind of
     * bug that reaches the kitchen rather than the screen.
     */
    let quantity = 1;
    let rest = words;
    const numberAt = words.findIndex(
      (w) => /^\d+$/.test(w) || NUMBER_WORDS[w] !== undefined,
    );
    if (numberAt !== -1) {
      const token = words[numberAt];
      quantity = /^\d+$/.test(token)
        ? Math.min(Number(token), 50)
        : NUMBER_WORDS[token];
      rest = [...words.slice(0, numberAt), ...words.slice(numberAt + 1)];
    }

    const meaningful = rest.filter((w) => !FILLER.has(w));
    if (meaningful.length === 0) continue;

    const ranked = menu
      .map((dish) => ({ dish, score: similarity(meaningful, dish.name) }))
      .sort((a, b) => b.score - a.score);

    const top = ranked[0];

    // Confident enough to add; otherwise offer the near-misses and let a human
    // decide. Silently guessing wrong ends up on someone's bill.
    if (top && top.score >= 0.6) {
      const existing = lines.find((l) => l.menuItem === String(top.dish._id));
      if (existing) existing.quantity = Math.min(existing.quantity + quantity, 50);
      else {
        lines.push({
          menuItem: String(top.dish._id),
          name: top.dish.name,
          price: top.dish.price,
          image: top.dish.image,
          foodType: top.dish.foodType,
          quantity,
          confidence: Number(top.score.toFixed(2)),
          heard: chunk,
        });
      }
    } else {
      unmatched.push({
        heard: chunk,
        suggestions: ranked
          .filter((r) => r.score > 0.25)
          .slice(0, 3)
          .map((r) => ({
            menuItem: String(r.dish._id),
            name: r.dish.name,
            price: r.dish.price,
            image: r.dish.image,
            foodType: r.dish.foodType,
            quantity,
          })),
      });
    }
  }

  return { lines, unmatched, transcript };
}
