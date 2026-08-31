import { Link } from 'react-router-dom';
import { money } from '../utils/format.js';
import { checkAgainst } from '../utils/allergyCheck.js';
import { useAuth } from '../context/AuthContext.jsx';
import { FoodTypeTag, Stars } from './ui.jsx';
import { AddToCart } from './AddToCart.jsx';

const EMOJI_BY_CATEGORY = {
  Starters: '🥟',
  Soups: '🍲',
  Salads: '🥗',
  'Main Course': '🍛',
  Biryani: '🍚',
  Pizza: '🍕',
  Burger: '🍔',
  Pasta: '🍝',
  Desserts: '🍮',
  Beverages: '🥤',
};

export function FoodCard({ item }) {
  const { user } = useAuth();
  // Checked in the browser against the dish's own recorded allergens, so a
  // warning appears on the card itself rather than only at checkout.
  const allergyWarning = checkAgainst(item, user?.allergies);
  const categoryName = item.category?.name || '';

  return (
    <article className="food-card">
      <Link to={`/menu/${item._id}`} className="food-thumb" aria-label={item.name}>
        {item.image ? (
          <img src={item.image} alt={item.name} loading="lazy" />
        ) : (
          // No stock photography is bundled with this project, so dishes without
          // an uploaded image fall back to a category glyph rather than a broken
          // image or a placeholder pulled from an external service.
          <span aria-hidden="true">{EMOJI_BY_CATEGORY[categoryName] || '🍽️'}</span>
        )}
        {!item.isAvailable && (
          <span className="badge badge-danger" style={{ position: 'absolute', top: 8, left: 8 }}>
            Unavailable
          </span>
        )}
        {item.isTodaysSpecial && (
          <span className="badge badge-brand" style={{ position: 'absolute', top: 8, right: 8 }}>
            Today&apos;s special
          </span>
        )}
        {allergyWarning && (
          <span
            className="badge badge-danger"
            style={{ position: 'absolute', bottom: 8, left: 8 }}
            title={allergyWarning}
          >
            ⚠️ Allergen
          </span>
        )}
      </Link>

      <div className="food-card-body">
        {allergyWarning && <div className="allergy-inline">⚠️ {allergyWarning}</div>}
        <div className="food-card-title">
          <h3>
            <Link to={`/menu/${item._id}`}>{item.name}</Link>
          </h3>
          <span className="food-price">{money(item.price)}</span>
        </div>

        <Stars value={item.rating?.average || 0} count={item.rating?.count} />
        <p className="food-desc">{item.description}</p>

        <div className="chip-row" style={{ marginTop: 'auto', paddingTop: '0.5rem' }}>
          <FoodTypeTag type={item.foodType} />
          {item.isPopular && <span className="badge badge-warn">Popular</span>}
          {categoryName && <span className="badge">{categoryName}</span>}
        </div>

        <div className="row" style={{ gap: '0.5rem', flexWrap: 'nowrap' }}>
          <Link to={`/menu/${item._id}`} className="btn btn-soft btn-sm" style={{ flex: 1 }}>
            Details
          </Link>
          <AddToCart item={item} size="btn-sm" />
        </div>
      </div>
    </article>
  );
}
