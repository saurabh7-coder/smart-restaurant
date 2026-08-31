import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { useCart } from '../context/CartContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Alert, Field, Spinner } from '../components/ui.jsx';
import { money } from '../utils/format.js';

const DIETS = [
  ['any', 'Anything'],
  ['veg', 'Vegetarian'],
  ['vegan', 'Vegan'],
  ['non_veg', 'Non-veg'],
];

/**
 * Meal planner — budget and calories in, a complete meal out.
 *
 * The budget shown is a guarantee, not an estimate: the plan is assembled
 * server-side against real prices and can never exceed what was asked for.
 */
export default function MealPlanner() {
  const cart = useCart();
  const toast = useToast();

  const [form, setForm] = useState({ budget: 800, calories: 1200, diet: 'any', people: 2 });
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'Meal planner — Delicious Adda';
  }, []);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setPlan(null);
    try {
      const res = await api.planMeal({
        budget: Number(form.budget),
        calories: Number(form.calories) || 0,
        diet: form.diet,
        people: Number(form.people) || 1,
      });
      setPlan(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function addPlanToCart() {
    for (const item of plan.items) {
      cart.add(
        { _id: item.menuItem, name: item.name, price: item.price, image: item.image, foodType: item.foodType },
        item.quantity,
      );
    }
    toast.success('Your meal is in the cart.');
  }

  return (
    <div className="container page">
      <div className="page-head">
        <div>
          <h1>Plan my meal</h1>
          <p>Give us a budget and we will build a full meal that fits inside it.</p>
        </div>
      </div>

      <form className="filter-bar" onSubmit={submit}>
        <Field label="Budget (₹)" id="budget" hint="A hard ceiling — we never go over.">
          <input id="budget" type="number" min="1" value={form.budget} onChange={set('budget')} required />
        </Field>

        <Field label="Calorie target" id="calories" hint="Leave 0 if you'd rather not.">
          <input id="calories" type="number" min="0" step="50" value={form.calories} onChange={set('calories')} />
        </Field>

        <Field label="Eating for" id="people">
          <input id="people" type="number" min="1" max="20" value={form.people} onChange={set('people')} />
        </Field>

        <Field label="Diet" id="diet">
          <select id="diet" value={form.diet} onChange={set('diet')}>
            {DIETS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>

        <div className="row" style={{ alignItems: 'flex-end' }}>
          <button type="submit" className="btn" disabled={loading}>
            {loading ? 'Building…' : 'Build my meal'}
          </button>
        </div>
      </form>

      <Alert kind="error">{error}</Alert>

      {loading && <Spinner />}

      {plan && !plan.ok && (
        <Alert kind="warning">
          {plan.reason}
        </Alert>
      )}

      {plan?.ok && (
        <>
          <div className="plan-summary">
            <div>
              <span className="faint">Comes to</span>
              <strong>{money(plan.totals.spend)}</strong>
              <small>of {money(plan.totals.budget)}</small>
            </div>
            {plan.totals.calories > 0 && (
              <div>
                <span className="faint">Around</span>
                <strong>{plan.totals.calories} kcal</strong>
                {plan.totals.calorieTarget > 0 && <small>target {plan.totals.calorieTarget}</small>}
              </div>
            )}
            <div>
              <span className="faint">For</span>
              <strong>
                {plan.totals.people} {plan.totals.people === 1 ? 'person' : 'people'}
              </strong>
              <small>{plan.items.length} courses</small>
            </div>
            <div className="spacer" />
            <button type="button" className="btn" onClick={addPlanToCart}>
              Add all to cart
            </button>
          </div>

          <div className="plan-courses">
            {plan.items.map((item) => (
              <div key={item.menuItem} className="plan-course">
                <div className="course-label">{item.courseLabel}</div>
                <div className="cart-thumb">
                  {item.image ? <img src={item.image} alt="" loading="lazy" /> : <span aria-hidden="true">🍽️</span>}
                </div>
                <div className="body">
                  <strong>
                    {item.quantity > 1 && `${item.quantity} × `}
                    {item.name}
                  </strong>
                  <div className="faint">
                    <span className={`food-dot ${item.foodType}`} aria-hidden="true" /> {item.category}
                    {item.calories ? ` · ${item.calories} kcal each` : ''}
                  </div>
                </div>
                <div className="nowrap">{money(item.price * item.quantity)}</div>
              </div>
            ))}
          </div>

          {plan.notes?.length > 0 && (
            <Alert kind="info">
              {plan.notes.map((n) => (
                <div key={n}>{n}</div>
              ))}
            </Alert>
          )}

          <p className="faint">
            Built from tonight&apos;s menu against real prices, so the total above is exact —{' '}
            <Link to="/menu">browse the full menu</Link> if you would rather choose yourself.
          </p>
        </>
      )}
    </div>
  );
}
