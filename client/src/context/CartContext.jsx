import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const CartContext = createContext(null);
const STORAGE_KEY = 'sr_cart';
const MAX_PER_ITEM = 50;

/**
 * The cart holds only dish id, quantity and an optional note — deliberately no
 * prices are trusted from here. Display prices are a convenience copy; the bill
 * is always recomputed by the server (POST /orders/quote) before checkout.
 */
const sanitize = (arr) =>
  (Array.isArray(arr) ? arr : []).filter(
    (l) => l && typeof l.menuItem === 'string' && Number(l.quantity) > 0,
  );

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;

    // Earlier versions stored a bare array of lines. Keep reading those so an
    // in-progress cart isn't thrown away when the app updates.
    if (Array.isArray(parsed)) return { lines: sanitize(parsed), offerCode: '', tableId: '' };

    if (parsed && typeof parsed === 'object') {
      return {
        lines: sanitize(parsed.lines),
        offerCode: typeof parsed.offerCode === 'string' ? parsed.offerCode : '',
        tableId: typeof parsed.tableId === 'string' ? parsed.tableId : '',
      };
    }
    return { lines: [], offerCode: '', tableId: '' };
  } catch {
    return { lines: [], offerCode: '', tableId: '' };
  }
}

export function CartProvider({ children }) {
  const initial = useState(load)[0];
  const [lines, setLines] = useState(initial.lines);

  /**
   * The applied promo code lives here, with the cart, rather than in router
   * navigation state.
   *
   * It used to be passed to checkout via `navigate(..., { state })`, which meant
   * a page refresh — or arriving straight at checkout from a table QR link —
   * silently dropped the discount and charged the customer full price. Keeping
   * it in the persisted cart makes it survive reloads and any entry path.
   */
  const [offerCode, setOfferCodeState] = useState(initial.offerCode);

  /**
   * The table a guest scanned into, remembered while they browse.
   *
   * Scanning a QR lands on the MENU, not straight on checkout — nobody wants to
   * pay before seeing the food. Holding the table here means the context
   * survives that browsing and is still there at checkout.
   */
  const [tableId, setTableIdState] = useState(initial.tableId);

  // Survive a refresh mid-order.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ lines, offerCode, tableId }));
    } catch {
      /* private browsing / quota — the cart just won't persist */
    }
  }, [lines, offerCode, tableId]);

  const setOfferCode = useCallback((code) => {
    setOfferCodeState((code || '').trim().toUpperCase());
  }, []);

  const setTableId = useCallback((id) => setTableIdState(id || ''), []);

  const add = useCallback((dish, quantity = 1) => {
    setLines((current) => {
      const id = dish._id || dish.menuItem;
      const existing = current.find((l) => l.menuItem === id);
      if (existing) {
        return current.map((l) =>
          l.menuItem === id
            ? { ...l, quantity: Math.min(l.quantity + quantity, MAX_PER_ITEM) }
            : l,
        );
      }
      return [
        ...current,
        {
          menuItem: id,
          quantity: Math.min(quantity, MAX_PER_ITEM),
          note: '',
          // display-only snapshot
          name: dish.name,
          price: dish.price,
          image: dish.image || '',
          foodType: dish.foodType,
        },
      ];
    });
  }, []);

  const setQuantity = useCallback((id, quantity) => {
    setLines((current) =>
      quantity <= 0
        ? current.filter((l) => l.menuItem !== id)
        : current.map((l) =>
            l.menuItem === id ? { ...l, quantity: Math.min(quantity, MAX_PER_ITEM) } : l,
          ),
    );
  }, []);

  const setNote = useCallback((id, note) => {
    setLines((current) =>
      current.map((l) => (l.menuItem === id ? { ...l, note: note.slice(0, 200) } : l)),
    );
  }, []);

  const remove = useCallback((id) => {
    setLines((current) => current.filter((l) => l.menuItem !== id));
  }, []);

  const clear = useCallback(() => {
    setLines([]);
    setOfferCodeState('');
    setTableIdState('');
  }, []);

  const value = useMemo(() => {
    const count = lines.reduce((n, l) => n + l.quantity, 0);
    return {
      lines,
      count,
      isEmpty: lines.length === 0,
      offerCode,
      setOfferCode,
      tableId,
      setTableId,
      add,
      setQuantity,
      setNote,
      remove,
      clear,
      quantityOf: (id) => lines.find((l) => l.menuItem === id)?.quantity || 0,
      /** The shape the API accepts — ids and quantities only. */
      toPayload: () =>
        lines.map((l) => ({ menuItem: l.menuItem, quantity: l.quantity, note: l.note || undefined })),
      /** Indicative total for the badge; the server's quote is authoritative. */
      indicativeTotal: lines.reduce((sum, l) => sum + (Number(l.price) || 0) * l.quantity, 0),
    };
  }, [lines, offerCode, setOfferCode, tableId, setTableId, add, setQuantity, setNote, remove, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}
