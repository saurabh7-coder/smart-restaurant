import { completeJson, isAiConfigured } from '../services/claude.js';

/**
 * Review analysis and sentiment.
 *
 * Sorts free-text reviews into the themes a restaurant can actually act on —
 * taste, service, price, portion, cleanliness, wait — and scores sentiment.
 *
 * ── Two engines, one shape ───────────────────────────────────────────────────
 * This is where a language model genuinely earns its place: "the biryani was
 * fine, but we waited forty minutes" is a service complaint wearing a compliment,
 * and "not too expensive" is positive despite containing a price-complaint word.
 * A lexicon sees the words; Claude sees the sentence.
 *
 * When Claude is unavailable the lexicon still runs and the dashboard still
 * fills — less nuanced, clearly labelled, never blank. Both engines return the
 * same shape so nothing downstream has to care which one answered.
 */

export const THEMES = Object.freeze(['taste', 'service', 'price', 'portion', 'cleanliness', 'wait']);

/* ─────────────────────────── the local engine ─────────────────────────── */

const THEME_WORDS = {
  taste: ['taste', 'tasty', 'tasteless', 'flavour', 'flavor', 'bland', 'spicy', 'salty', 'delicious',
    'yummy', 'stale', 'fresh', 'undercooked', 'overcooked', 'burnt', 'soggy', 'dry', 'authentic'],
  service: ['service', 'staff', 'waiter', 'waitress', 'server', 'rude', 'polite', 'friendly',
    'attentive', 'ignored', 'manager', 'helpful', 'courteous'],
  price: ['price', 'priced', 'expensive', 'costly', 'cheap', 'value', 'overpriced', 'worth',
    'affordable', 'bill', 'charged'],
  portion: ['portion', 'quantity', 'small', 'large', 'tiny', 'huge', 'filling', 'generous', 'size'],
  cleanliness: ['clean', 'dirty', 'hygiene', 'hygienic', 'unhygienic', 'messy', 'spotless', 'smell'],
  wait: ['wait', 'waited', 'waiting', 'slow', 'quick', 'fast', 'late', 'delay', 'delayed', 'prompt',
    'minutes', 'hours'],
};

const POSITIVE = ['good', 'great', 'excellent', 'amazing', 'love', 'loved', 'best', 'delicious',
  'tasty', 'fresh', 'friendly', 'polite', 'attentive', 'clean', 'quick', 'fast', 'prompt',
  'generous', 'worth', 'affordable', 'perfect', 'wonderful', 'fantastic', 'recommend', 'nice',
  'lovely', 'superb', 'outstanding', 'helpful', 'spotless', 'authentic', 'filling'];

const NEGATIVE = ['bad', 'poor', 'terrible', 'awful', 'worst', 'bland', 'tasteless', 'stale',
  'rude', 'slow', 'late', 'dirty', 'unhygienic', 'expensive', 'overpriced', 'costly', 'small',
  'tiny', 'cold', 'burnt', 'soggy', 'undercooked', 'overcooked', 'disappointing', 'disappointed',
  'never', 'avoid', 'horrible', 'ignored', 'messy', 'delay', 'delayed', 'mediocre'];

/** Negators flip the polarity of the next few words. */
const NEGATORS = ['not', 'no', 'never', "didn't", 'didnt', "wasn't", 'wasnt', "isn't", 'isnt',
  'hardly', 'barely', 'without'];

const words = (text) =>
  String(text).toLowerCase().replace(/[^a-z0-9'\s]/g, ' ').split(/\s+/).filter(Boolean);

/**
 * Lexicon sentiment with negation handling.
 *
 * The negation window is what makes "not bad" and "not worth it" come out with
 * the right sign — without it, a lexicon reads both as their literal keyword and
 * gets them exactly backwards.
 */
function localSentiment(text) {
  const tokens = words(text);
  let score = 0;

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const polarity = POSITIVE.includes(token) ? 1 : NEGATIVE.includes(token) ? -1 : 0;
    if (polarity === 0) continue;

    const negated = tokens.slice(Math.max(0, i - 3), i).some((w) => NEGATORS.includes(w));
    score += negated ? -polarity : polarity;
  }

  return score;
}

/** Star rating is the strongest signal we hold; text only adjusts it. */
function localAnalyseOne(review) {
  const text = review.comment || '';
  const rating = Number(review.rating) || 0;

  const textScore = localSentiment(text);
  // Ratings map to −1..1 around 3 stars, then text nudges within that.
  const ratingScore = rating ? (rating - 3) / 2 : 0;
  const combined = text ? ratingScore * 0.7 + Math.max(-1, Math.min(1, textScore / 3)) * 0.3 : ratingScore;

  const sentiment = combined > 0.15 ? 'positive' : combined < -0.15 ? 'negative' : 'neutral';

  const tokens = words(text);
  const themes = [];
  for (const theme of THEMES) {
    const hits = THEME_WORDS[theme].filter((w) => tokens.includes(w));
    if (hits.length === 0) continue;

    // Sentiment local to the theme's own words, so a review can praise the food
    // and complain about the wait in the same breath.
    let local = 0;
    for (const hit of hits) {
      const at = tokens.indexOf(hit);
      local += localSentiment(tokens.slice(Math.max(0, at - 4), at + 5).join(' '));
    }
    themes.push({
      theme,
      sentiment: local > 0 ? 'positive' : local < 0 ? 'negative' : sentiment,
      evidence: hits.slice(0, 3).join(', '),
    });
  }

  return { sentiment, score: Number(combined.toFixed(2)), themes };
}

/* ─────────────────────────── the Claude engine ─────────────────────────── */

const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    reviews: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          sentiment: { type: 'string', enum: ['positive', 'neutral', 'negative'] },
          score: { type: 'number' },
          themes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                theme: { type: 'string', enum: [...THEMES] },
                sentiment: { type: 'string', enum: ['positive', 'neutral', 'negative'] },
                evidence: { type: 'string' },
              },
              required: ['theme', 'sentiment', 'evidence'],
              additionalProperties: false,
            },
          },
        },
        required: ['id', 'sentiment', 'score', 'themes'],
        additionalProperties: false,
      },
    },
    summary: { type: 'string' },
    actions: { type: 'array', items: { type: 'string' } },
  },
  required: ['reviews', 'summary', 'actions'],
  additionalProperties: false,
};

const SYSTEM = `You analyse customer reviews for a restaurant owner.

For each review, judge the overall sentiment and identify which of these themes it
touches: taste, service, price, portion, cleanliness, wait. A review can touch
several, and can be positive about one and negative about another — score each
theme on its own, not on the review's overall tone.

Judge sentiment from meaning, not keywords. "Not too expensive" is positive about
price. "The food was lovely but we waited an hour" is positive on taste and
negative on wait. A low star rating with warm text is still a complaint.

"score" is -1 (very negative) to 1 (very positive). "evidence" quotes the few words
that show the theme — keep it under twelve words and use the reviewer's own wording.

The summary is two or three sentences for the owner: what guests consistently praise
and what keeps coming up as a problem. The actions are concrete things this
restaurant could change, drawn only from what the reviews actually say — no generic
hospitality advice. If the reviews do not support an action, return fewer.`;

/* ─────────────────────────── the public API ─────────────────────────── */

/**
 * Analyses a batch of reviews.
 * @returns {{engine: 'claude'|'built-in', reviews, summary, actions}}
 */
export async function analyseReviews(reviews) {
  if (reviews.length === 0) {
    return { engine: 'built-in', reviews: [], summary: 'No reviews yet.', actions: [] };
  }

  if (isAiConfigured()) {
    const payload = reviews.map((r) => ({
      id: String(r._id),
      rating: r.rating,
      comment: r.comment || '',
      dish: r.menuItem?.name || 'the restaurant',
    }));

    const result = await completeJson({
      system: SYSTEM,
      prompt: `Analyse these ${payload.length} reviews:\n\n${JSON.stringify(payload, null, 2)}`,
      schema: ANALYSIS_SCHEMA,
      // Real judgement about tone and mixed sentiment — worth the extra depth.
      effort: 'medium',
      maxTokens: 4096,
      timeoutMs: 45000,
    });

    if (result?.reviews) {
      const byId = new Map(result.reviews.map((r) => [r.id, r]));
      return {
        engine: 'claude',
        reviews: reviews.map((r) => ({
          ...r,
          analysis: byId.get(String(r._id)) || localAnalyseOne(r),
        })),
        summary: result.summary,
        actions: result.actions || [],
      };
    }
    // fell through — Claude unavailable or refused; the local engine takes over
  }

  const analysed = reviews.map((r) => ({ ...r, analysis: localAnalyseOne(r) }));
  return {
    engine: 'built-in',
    reviews: analysed,
    summary: localSummary(analysed),
    actions: localActions(analysed),
  };
}

/** Rolls per-review analysis up into dashboard figures. */
export function aggregate(analysed) {
  const counts = { positive: 0, neutral: 0, negative: 0 };
  const themes = {};
  for (const t of THEMES) themes[t] = { positive: 0, neutral: 0, negative: 0, total: 0 };

  for (const r of analysed) {
    const a = r.analysis;
    if (!a) continue;
    counts[a.sentiment] = (counts[a.sentiment] || 0) + 1;
    for (const t of a.themes || []) {
      if (!themes[t.theme]) continue;
      themes[t.theme][t.sentiment] += 1;
      themes[t.theme].total += 1;
    }
  }

  const total = analysed.length || 1;
  const pct = (n) => Math.round((n / total) * 100);

  return {
    total: analysed.length,
    counts,
    percentages: {
      positive: pct(counts.positive),
      neutral: pct(counts.neutral),
      negative: pct(counts.negative),
    },
    themes: THEMES.map((theme) => {
      const t = themes[theme];
      return {
        theme,
        ...t,
        // Share of the mentions of this theme that were complaints — the number
        // that tells an owner where to look first.
        complaintRate: t.total ? Math.round((t.negative / t.total) * 100) : 0,
      };
    }).sort((a, b) => b.negative - a.negative || b.total - a.total),
  };
}

function localSummary(analysed) {
  const agg = aggregate(analysed);
  const worst = agg.themes.find((t) => t.negative > 0);
  const best = [...agg.themes].sort((a, b) => b.positive - a.positive)[0];

  const parts = [`${agg.percentages.positive}% of ${agg.total} reviews are positive.`];
  if (best?.positive) parts.push(`Guests are happiest about ${best.theme}.`);
  if (worst) parts.push(`${worst.theme} draws the most complaints (${worst.negative} of ${worst.total} mentions).`);
  return parts.join(' ');
}

function localActions(analysed) {
  const agg = aggregate(analysed);
  const advice = {
    taste: 'Review recipes and seasoning on the dishes drawing complaints.',
    service: 'Look at floor staffing and briefing on the shifts being reviewed.',
    price: 'Guests are questioning value — revisit portion-to-price on the dishes named.',
    portion: 'Portion sizes are being called out; check plating standards.',
    cleanliness: 'Cleanliness is being mentioned negatively — audit the dining room and washrooms.',
    wait: 'Waiting times are a recurring complaint; check kitchen throughput at peak.',
  };
  return agg.themes
    .filter((t) => t.negative >= 2 && t.complaintRate >= 40)
    .slice(0, 4)
    .map((t) => advice[t.theme]);
}
