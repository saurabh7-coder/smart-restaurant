import { MenuItem } from '../models/MenuItem.js';
import { Review } from '../models/Review.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { aiStatus } from '../services/claude.js';
import { planMeal } from '../utils/mealPlanner.js';
import { parseOrder } from '../utils/orderParser.js';
import { ask } from '../utils/assistant.js';
import { describeDish } from '../utils/describe.js';
import { analyseReviews, aggregate } from '../utils/reviewAnalysis.js';
import { findAlternatives, reviewCart } from '../utils/substitution.js';
import { annotate, screenOrder } from '../utils/allergens.js';
import { ALLERGENS } from '../constants.js';

/** GET /api/ai/status — which engine is answering, stated plainly. */
export const getStatus = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: { ...aiStatus(), allergens: ALLERGENS } });
});

/* ───────────────────────────── meal planner ───────────────────────────── */

export const postMealPlan = asyncHandler(async (req, res) => {
  const plan = await planMeal({
    budget: req.body.budget,
    calories: req.body.calories,
    diet: req.body.diet,
    people: req.body.people,
    // A logged-in guest's saved allergies apply automatically; anyone can pass
    // them explicitly. A plan that ignores an allergy is worse than no plan.
    allergies: req.body.allergies?.length ? req.body.allergies : req.user?.allergies || [],
    avoid: req.body.avoid || [],
    include: req.body.include || [],
  });

  res.json({ success: true, data: plan });
});

/* ───────────────────────────── voice ordering ───────────────────────────── */

export const postParseOrder = asyncHandler(async (req, res) => {
  const transcript = String(req.body.transcript || '').slice(0, 500);
  if (!transcript.trim()) throw ApiError.badRequest('Say or type what you would like to order.');

  const parsed = await parseOrder(transcript);

  // Flag anything the guest is allergic to before it reaches the cart.
  const allergies = req.user?.allergies || [];
  if (allergies.length && parsed.lines.length) {
    const dishes = await MenuItem.find({ _id: { $in: parsed.lines.map((l) => l.menuItem) } }).lean();
    const flagged = screenOrder(dishes, allergies);
    const byId = new Map(flagged.map((f) => [String(f.id), f]));
    parsed.lines = parsed.lines.map((l) =>
      byId.has(l.menuItem) ? { ...l, allergyWarning: byId.get(l.menuItem).text } : l,
    );
  }

  res.json({
    success: true,
    data: parsed,
    meta: {
      matched: parsed.lines.length,
      unclear: parsed.unmatched.length,
      note: 'Speech is transcribed by your browser and never leaves your device as audio.',
    },
  });
});

/* ───────────────────────────── chatbot ───────────────────────────── */

export const postAsk = asyncHandler(async (req, res) => {
  const question = String(req.body.question || '').slice(0, 500);
  const history = Array.isArray(req.body.history) ? req.body.history.slice(-6) : [];

  const result = await ask(question, {
    allergies: req.user?.allergies || [],
    history,
  });

  res.json({ success: true, data: result });
});

/* ───────────────────────────── descriptions (admin) ───────────────────────────── */

export const postDescribe = asyncHandler(async (req, res) => {
  const { name, ingredients, category, foodType, spiceLevel, allergens } = req.body;
  if (!name) throw ApiError.badRequest('A dish name is needed to write a description.');

  const result = await describeDish({
    name,
    ingredients: Array.isArray(ingredients)
      ? ingredients
      : String(ingredients || '').split(',').map((s) => s.trim()).filter(Boolean),
    category,
    foodType,
    spiceLevel,
    allergens,
  });

  res.json({ success: true, data: result });
});

/* ───────────────────────────── reviews & sentiment (staff) ───────────────────────────── */

export const getSentiment = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 60, 1), 200);

  const reviews = await Review.find({ isApproved: true })
    .populate('menuItem', 'name')
    .populate('user', 'name')
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  const { engine, reviews: analysed, summary, actions } = await analyseReviews(reviews);

  res.json({
    success: true,
    data: {
      engine,
      ...aggregate(analysed),
      summary,
      actions,
      reviews: analysed.map((r) => ({
        _id: r._id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
        user: r.user?.name || 'Guest',
        dish: r.menuItem?.name || null,
        analysis: r.analysis,
      })),
    },
    meta: {
      note:
        engine === 'claude'
          ? 'Themes and sentiment judged by Claude reading each review.'
          : 'Themes and sentiment from the built-in lexicon. Set ANTHROPIC_API_KEY for finer judgement.',
    },
  });
});

/* ───────────────────────────── substitution ───────────────────────────── */

export const getAlternatives = asyncHandler(async (req, res) => {
  const dish = await MenuItem.findById(req.params.id).populate('category', 'name').lean();
  if (!dish) throw ApiError.notFound('That dish is not on the menu.');

  const alternatives = await findAlternatives(dish, {
    limit: Math.min(Number(req.query.limit) || 3, 8),
    allergies: req.user?.allergies || [],
  });

  res.json({
    success: true,
    data: alternatives,
    meta: {
      for: dish.name,
      available: dish.isAvailable,
      reason: dish.isAvailable ? 'similar dishes' : `${dish.name} is unavailable right now`,
    },
  });
});

export const postReviewCart = asyncHandler(async (req, res) => {
  const lines = Array.isArray(req.body.lines) ? req.body.lines : [];
  const problems = await reviewCart(lines, { allergies: req.user?.allergies || [] });
  res.json({ success: true, data: problems, meta: { ok: problems.length === 0 } });
});

/* ───────────────────────────── allergy screening ───────────────────────────── */

export const postScreen = asyncHandler(async (req, res) => {
  const allergies = req.body.allergies?.length ? req.body.allergies : req.user?.allergies || [];
  const ids = Array.isArray(req.body.menuItems) ? req.body.menuItems : [];

  if (allergies.length === 0) return res.json({ success: true, data: [], meta: { allergies: [] } });

  const dishes = await MenuItem.find(ids.length ? { _id: { $in: ids } } : { isAvailable: true }).lean();
  const flagged = screenOrder(dishes, allergies);

  res.json({ success: true, data: flagged, meta: { allergies, checked: dishes.length } });
});

/** Annotates the whole menu for a guest — used to badge dishes as they browse. */
export const getSafeMenu = asyncHandler(async (req, res) => {
  const allergies = req.user?.allergies || [];
  const dishes = await MenuItem.find({ isAvailable: true }).populate('category', 'name').lean();
  res.json({
    success: true,
    data: annotate(dishes, allergies),
    meta: { allergies, warned: annotate(dishes, allergies).filter((d) => d.allergyWarning).length },
  });
});
