import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';

const RestaurantContext = createContext(null);

/**
 * Restaurant profile and booking configuration (slot grid, booking horizon).
 * Fetched once and shared, since the header, footer and reservation form all
 * need it.
 */
export function RestaurantProvider({ children }) {
  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await api.getRestaurant();
      setRestaurant(res.data);
    } catch {
      // The site still works without the profile — the header falls back to
      // defaults rather than blocking the whole app on this request.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ restaurant, loading, refresh, setRestaurant }),
    [restaurant, loading, refresh],
  );

  return <RestaurantContext.Provider value={value}>{children}</RestaurantContext.Provider>;
}

export function useRestaurant() {
  const ctx = useContext(RestaurantContext);
  if (!ctx) throw new Error('useRestaurant must be used inside <RestaurantProvider>');
  return ctx;
}
