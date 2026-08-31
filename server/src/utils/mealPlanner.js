import { MenuItem } from '../models/MenuItem.js';
import { checkDish } from './allergens.js';

/**
 * Meal planner — "₹800, about 1200 calories, vegetarian, for two."
 *
 * ── Why this is a solver and not a prompt ────────────────────────────────────
 * This is a constraint-satisfaction problem over a known menu with known prices
 * and known calorie counts. A language model asked to do it would have to do
 * arithmetic on data it was handed anyway, and would occasionally produce a
 * plan that busts the budget — which is the one thing the feature must never
 * do. Solved in code, the budget is a guarantee rather than a hope.
 *
 * The search is a seeded greedy build plus a local-improvement pass: for a menu
 * of this size that lands on a good plan in milliseconds, and unlike a single
 * greedy pass it can back out of an early choice that starved the later courses.
 */

/** A balanced meal has a shape; these are the courses we try to fill. */
const COURSE_PLAN = [
  { key: 'starter', label: 'To start', categories: ['Starters', 'Soups', 'Salads'], share: 0.2 },
  { key: 'main', label: 'Main', categories: ['Main Course', 'Biryani', 'Pizza', 'Burger', 'Pasta'], share: 0.45, required: true },
  { key: 'side', label: 'With it', categories: ['Breads', 'Rice & Noodles'], share: 0.15 },
  { key: 'drink', label: 'To drink', categories: ['Beverages'], share: 0.1 },
  { key: 'dessert', label: 'To finish', categories: ['Desserts'], share: 0.1 },
];

const DIET_ALLOWS = {
  any: ['veg', 'non_veg', 'vegan'],
  veg: ['veg', 'vegan'],
  vegan: ['vegan'],
  non_veg: ['veg', 'non_veg', 'vegan'],
};

/**
 * @param {object}   opts
 * @param {number}   opts.budget      rupees, the hard ceiling
 * @param {number}  [opts.calories]   target for the whole plan; 0 = don't care
 * @param {string}  [opts.diet]       any | veg | vegan | non_veg
 * @param {number}  [opts.people]     scales both targets
 * @param {string[]}[opts.allergies]
 * @param {string[]}[opts.avoid]      ingredients to skip
 * @param {string[]}[opts.include]    categories the guest insists on
 */
export async function planMeal({
  budget,
  calories = 0,
  diet = 'any',
  people = 1,
  allergies = [],
  avoid = [],
  include = [],
}) {
  const totalBudget = Number(budget) || 0;
  const totalCalories = Number(calories) || 0;
  if (totalBudget <= 0) {
    return { ok: false, reason: 'Tell us a budget and we will build a meal around it.' };
  }

  const allowed = DIET_ALLOWS[diet] || DIET_ALLOWS.any;
  const avoidLower = avoid.map((a) => String(a).toLowerCase()).filter(Boolean);

  const menu = (await MenuItem.find({ isAvailable: true }).populate('category', 'name').lean())
    .filter((d) => allowed.includes(d.foodType))
    .filter((d) => checkDish(d, allergies).length === 0)
    .filter(
      (d) =>
        avoidLower.length === 0 ||
        !(d.ingredients || []).some((i) => avoidLower.includes(String(i).toLowerCase())),
    );

  if (menu.length === 0) {
    return {
      ok: false,
      reason: 'Nothing on the menu matches those restrictions. Try relaxing the diet or allergy filters.',
    };
  }

  // Courses the guest explicitly asked for become required.
  const courses = COURSE_PLAN.map((c) => ({
    ...c,
    required: c.required || include.some((i) => c.categories.includes(i) || c.key === i),
  }));

  /*
   * Several starting points, then keep the best. A single greedy pass is very
   * sensitive to which course it fills first — spending 45% of a tight budget
   * on the main can leave nothing for anything else — so we try the courses in
   * a few different orders and let the scorer pick a winner.
   */
  const attempts = [
    courses,
    [...courses].reverse(),
    [...courses].sort((a, b) => b.share - a.share),
    [...courses].sort((a, b) => a.share - b.share),
  ];

  let best = null;
  for (const order of attempts) {
    const plan = build(order, menu, { totalBudget, totalCalories, people, courses });
    if (!best || score(plan, totalBudget, totalCalories) > score(best, totalBudget, totalCalories)) {
      best = plan;
    }
  }

  best = improve(best, menu, totalBudget, totalCalories);

  if (best.items.length === 0) {
    const cheapest = Math.min(...menu.map((d) => d.price));
    return {
      ok: false,
      reason: `₹${totalBudget} is below our cheapest matching dish (₹${cheapest}). Try a slightly higher budget.`,
    };
  }

  const spend = best.items.reduce((s, i) => s + i.price * i.quantity, 0);
  const kcal = best.items.reduce((s, i) => s + (i.calories || 0) * i.quantity, 0);

  return {
    ok: true,
    items: best.items,
    totals: {
      spend,
      budget: totalBudget,
      remaining: totalBudget - spend,
      calories: kcal,
      calorieTarget: totalCalories,
      people,
    },
    notes: notesFor(best.items, spend, totalBudget, kcal, totalCalories, courses),
  };
}

/** Fills each course in the given order, never exceeding the running budget. */
function build(order, menu, { totalBudget, totalCalories, people }) {
  const items = [];
  let spent = 0;
  let kcal = 0;

  for (const course of order) {
    const pool = menu.filter((d) => course.categories.includes(d.category?.name));
    if (pool.length === 0) continue;

    const room = totalBudget - spent;
    // Aim for this course's share, but never spend money a required later
    // course still needs.
    const reserved = order
      .filter((c) => c.required && !items.some((i) => i.course === c.key) && c.key !== course.key)
      .reduce((sum, c) => sum + Math.min(...pool.map(() => 0), 0) + cheapestIn(menu, c), 0);

    const ceiling = Math.max(room - reserved, 0);
    const target = Math.min(totalBudget * course.share, ceiling);
    if (ceiling <= 0) continue;

    const calorieShare = totalCalories > 0 ? totalCalories * course.share : 0;

    const pick = pool
      .filter((d) => d.price <= ceiling)
      .map((d) => {
        const priceFit = 1 - Math.min(Math.abs(d.price - target) / (target || 1), 1);
        const calorieFit =
          calorieShare > 0 && d.calories
            ? 1 - Math.min(Math.abs(d.calories - calorieShare) / calorieShare, 1)
            : 0.5;
        return {
          dish: d,
          fit: priceFit * 1.4 + calorieFit * 1.2 + (d.rating?.average || 0) / 5 + (d.isPopular ? 0.4 : 0),
        };
      })
      .sort((a, b) => b.fit - a.fit)[0];

    if (!pick) continue;

    // Shared plates scale with the party; a dessert each, one biryani between two.
    const quantity = ['main', 'dessert', 'drink'].includes(course.key) ? Math.max(people, 1) : 1;
    const cost = pick.dish.price * quantity;
    if (spent + cost > totalBudget) continue;

    items.push(toItem(pick.dish, course, quantity));
    spent += cost;
    kcal += (pick.dish.calories || 0) * quantity;
  }

  return { items, spent, kcal };
}

/**
 * One improvement pass: try swapping each chosen dish for a same-course
 * alternative that lands closer to the targets. Cheap, and it fixes the common
 * case where the greedy pass overspent on an early course.
 */
function improve(plan, menu, totalBudget, totalCalories) {
  let current = plan;

  for (let i = 0; i < current.items.length; i += 1) {
    const item = current.items[i];
    const course = COURSE_PLAN.find((c) => c.key === item.course);
    if (!course) continue;

    const others = menu.filter(
      (d) => course.categories.includes(d.category?.name) && String(d._id) !== String(item.menuItem),
    );

    for (const candidate of others) {
      const swapped = {
        items: current.items.map((it, idx) =>
          idx === i ? toItem(candidate, course, it.quantity) : it,
        ),
      };
      swapped.spent = swapped.items.reduce((s, x) => s + x.price * x.quantity, 0);
      swapped.kcal = swapped.items.reduce((s, x) => s + (x.calories || 0) * x.quantity, 0);

      if (swapped.spent > totalBudget) continue;
      if (score(swapped, totalBudget, totalCalories) > score(current, totalBudget, totalCalories)) {
        current = swapped;
      }
    }
  }

  return current;
}

/**
 * How good a plan is: use most of the budget, hit the calorie target, cover
 * more courses. Overspending is impossible by construction, so the score only
 * has to reward completeness and closeness.
 */
function score(plan, totalBudget, totalCalories) {
  if (!plan || plan.items.length === 0) return -Infinity;

  const budgetUse = plan.spent / totalBudget; // 0..1, higher is better value
  const calorieFit =
    totalCalories > 0 ? 1 - Math.min(Math.abs(plan.kcal - totalCalories) / totalCalories, 1) : 0.5;
  const variety = plan.items.length / COURSE_PLAN.length;

  return budgetUse * 2.0 + calorieFit * 2.5 + variety * 1.5;
}

function cheapestIn(menu, course) {
  const pool = menu.filter((d) => course.categories.includes(d.category?.name));
  return pool.length ? Math.min(...pool.map((d) => d.price)) : 0;
}

function toItem(dish, course, quantity) {
  return {
    menuItem: String(dish._id),
    name: dish.name,
    price: dish.price,
    calories: dish.calories || null,
    foodType: dish.foodType,
    image: dish.image,
    category: dish.category?.name,
    course: course.key,
    courseLabel: course.label,
    quantity,
  };
}

/** Plain-language notes so the guest can see how well the plan actually fits. */
function notesFor(items, spend, budget, kcal, calorieTarget, courses) {
  const notes = [];

  const left = budget - spend;
  if (left > budget * 0.25) {
    notes.push(`Comes to ₹${spend}, leaving ₹${left} of your budget — room for another side if you want one.`);
  } else {
    notes.push(`Comes to ₹${spend} of your ₹${budget} budget.`);
  }

  if (calorieTarget > 0 && kcal > 0) {
    const diff = kcal - calorieTarget;
    const pct = Math.round((Math.abs(diff) / calorieTarget) * 100);
    if (pct <= 10) notes.push(`About ${kcal} kcal — within ${pct}% of your target.`);
    else if (diff < 0) notes.push(`About ${kcal} kcal, ${Math.abs(diff)} under your target.`);
    else notes.push(`About ${kcal} kcal, ${diff} over your target.`);
  } else if (calorieTarget > 0) {
    notes.push('Calorie counts are not recorded for every dish, so this total is partial.');
  }

  const missing = courses.filter((c) => !items.some((i) => i.course === c.key));
  if (missing.length) {
    notes.push(`No ${missing.map((m) => m.label.toLowerCase()).join(' or ')} — the budget did not stretch that far.`);
  }

  return notes;
}
