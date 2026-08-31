import { useCart } from '../context/CartContext.jsx';

/** Quantity stepper used in the cart and anywhere a line can be adjusted. */
export function Stepper({ value, onChange, min = 0, max = 50, label = 'Quantity' }) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        disabled={value <= min}
        aria-label="Decrease quantity"
      >
        −
      </button>
      <span className="qty" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        aria-label="Increase quantity"
      >
        +
      </button>
    </div>
  );
}

/**
 * Switches from an "Add" button to a stepper once the dish is in the cart, so
 * the control always shows the current quantity rather than hiding it.
 */
export function AddToCart({ item, size = '', block = false }) {
  const { add, setQuantity, quantityOf } = useCart();
  const quantity = quantityOf(item._id);

  if (!item.isAvailable) {
    return (
      <button type="button" className={`btn btn-ghost ${size} ${block ? 'btn-block' : ''}`} disabled>
        Unavailable
      </button>
    );
  }

  if (quantity > 0) {
    return <Stepper value={quantity} onChange={(q) => setQuantity(item._id, q)} label={item.name} />;
  }

  return (
    <button
      type="button"
      className={`btn ${size} ${block ? 'btn-block' : ''}`}
      onClick={() => add(item)}
    >
      + Add
    </button>
  );
}
