import { MenuItem } from '../models/MenuItem.js';
import { Review } from '../models/Review.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ROLES } from '../constants.js';
import { recommendDishes } from '../utils/recommend.js';

const SORTS = {
  popular: { isPopular: -1, 'rating.average': -1, createdAt: -1 },
  rating: { 'rating.average': -1, 'rating.count': -1 },
  price_asc: { price: 1 },
  price_desc: { price: -1 },
  newest: { createdAt: -1 },
  name: { name: 1 },
};

export const listMenuItems = asyncHandler(async (req, res) => {
  const {
    search,
    category,
    foodType,
    minPrice,
    maxPrice,
    sort = 'popular',
    popular,
    special,
    page = 1,
    limit = 24,
  } = req.query;

  const isStaff = req.user && [ROLES.ADMIN, ROLES.STAFF].includes(req.user.role);
  const filter = {};

  // Customers only ever see items the restaurant is actually serving.
  if (!isStaff) filter.isAvailable = true;
  else if (req.query.available === 'true') filter.isAvailable = true;
  else if (req.query.available === 'false') filter.isAvailable = false;

  if (category) filter.category = category;
  if (foodType) filter.foodType = { $in: String(foodType).split(',') };
  if (popular === 'true') filter.isPopular = true;
  if (special === 'true') filter.isTodaysSpecial = true;

  if (minPrice !== undefined || maxPrice !== undefined) {
    filter.price = {};
    if (minPrice !== undefined && minPrice !== '') filter.price.$gte = Number(minPrice);
    if (maxPrice !== undefined && maxPrice !== '') filter.price.$lte = Number(maxPrice);
    if (Object.keys(filter.price).length === 0) delete filter.price;
  }

  if (search && String(search).trim()) {
    // Escaped so a user typing "(" or "*" gets a literal search, not a regex error.
    const safe = String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(safe, 'i');
    filter.$or = [{ name: rx }, { description: rx }, { ingredients: rx }];
  }

  // Raised from 60: the menu itself is larger than that now, and the home page
  // builds several of its sections from a single full-menu fetch.
  const perPage = Math.min(Math.max(Number(limit) || 24, 1), 120);
  const currentPage = Math.max(Number(page) || 1, 1);

  const [items, total] = await Promise.all([
    MenuItem.find(filter)
      .populate('category', 'name')
      .sort(SORTS[sort] || SORTS.popular)
      .skip((currentPage - 1) * perPage)
      .limit(perPage)
      .lean(),
    MenuItem.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: items,
    meta: {
      total,
      page: currentPage,
      limit: perPage,
      pages: Math.max(Math.ceil(total / perPage), 1),
    },
  });
});

export const getMenuItem = asyncHandler(async (req, res) => {
  const item = await MenuItem.findById(req.params.id).populate('category', 'name').lean();
  if (!item) throw ApiError.notFound('That dish is not on the menu.');

  const reviews = await Review.find({ menuItem: item._id, isApproved: true })
    .populate('user', 'name')
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  res.json({ success: true, data: { ...item, reviews } });
});

export const createMenuItem = asyncHandler(async (req, res) => {
  const item = await MenuItem.create(normalizeBody(req.body));
  res.status(201).json({ success: true, message: 'Menu item created.', data: item });
});

export const updateMenuItem = asyncHandler(async (req, res) => {
  const item = await MenuItem.findByIdAndUpdate(req.params.id, normalizeBody(req.body), {
    new: true,
    runValidators: true,
  });
  if (!item) throw ApiError.notFound('Menu item not found.');
  res.json({ success: true, message: 'Menu item updated.', data: item });
});

export const deleteMenuItem = asyncHandler(async (req, res) => {
  const item = await MenuItem.findByIdAndDelete(req.params.id);
  if (!item) throw ApiError.notFound('Menu item not found.');
  await Review.deleteMany({ menuItem: item._id });
  res.json({ success: true, message: 'Menu item deleted.' });
});

/** Multipart form fields arrive as strings; coerce them to the schema's types. */
function normalizeBody(body) {
  const out = { ...body };

  for (const key of ['ingredients', 'allergens']) {
    if (typeof out[key] === 'string') {
      out[key] = out[key]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }

  for (const key of ['isAvailable', 'isPopular', 'isTodaysSpecial']) {
    if (typeof out[key] === 'string') out[key] = out[key] === 'true';
  }

  for (const key of ['price', 'calories', 'spiceLevel']) {
    if (out[key] === '' || out[key] === null) out[key] = key === 'calories' ? null : undefined;
    else if (out[key] !== undefined) out[key] = Number(out[key]);
  }

  // The cached rating is derived from reviews and must never be client-writable.
  delete out.rating;
  return out;
}

/**
 * GET /api/menu/recommendations
 *
 * Personalised dish suggestions. Each carries a `reason` string — the strongest
 * signal behind it — so the customer is never shown an unexplained "we think
 * you'll like this". See utils/recommend.js for how the score is built and what
 * it is (and is not) doing.
 */
export const getRecommendations = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 8, 1), 20);
  const exclude = String(req.query.exclude || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const { items, basis } = await recommendDishes({ user: req.user, limit, excludeIds: exclude });

  res.json({
    success: true,
    data: items,
    meta: {
      basis,
      personalised: basis === 'personalised' || basis === 'taste-profile',
      /** Stated plainly so the UI can be honest about what produced this. */
      method:
        basis === 'popular'
          ? 'Most ordered and best rated, because we have nothing to go on yet'
          : 'Built from what you have ordered before and what other guests order alongside it',
    },
  });
});
