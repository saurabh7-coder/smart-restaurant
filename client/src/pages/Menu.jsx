import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { FoodCard } from '../components/FoodCard.jsx';
import { Recommendations } from '../components/Recommendations.jsx';
import { useCart } from '../context/CartContext.jsx';
import { Alert, EmptyState, Field, Pagination, Spinner } from '../components/ui.jsx';

const SORTS = [
  ['popular', 'Most popular'],
  ['rating', 'Highest rated'],
  ['price_asc', 'Price: low to high'],
  ['price_desc', 'Price: high to low'],
  ['name', 'Name (A–Z)'],
  ['newest', 'Newest'],
];

const FOOD_TYPES = [
  ['veg', 'Veg'],
  ['non_veg', 'Non-Veg'],
  ['vegan', 'Vegan'],
];

export default function Menu() {
  const [params, setParams] = useSearchParams();
  const { tableId, setTableId } = useCart();
  const [tableInfo, setTableInfo] = useState(null);
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Search box is local state so typing does not re-query on every keystroke.
  const [searchDraft, setSearchDraft] = useState(params.get('search') || '');

  const query = useMemo(
    () => ({
      search: params.get('search') || '',
      category: params.get('category') || '',
      foodType: params.getAll('foodType').join(','),
      minPrice: params.get('minPrice') || '',
      maxPrice: params.get('maxPrice') || '',
      sort: params.get('sort') || 'popular',
      // Carried through so the home page's "See all" links land on a filtered menu.
      popular: params.get('popular') || '',
      special: params.get('special') || '',
      page: Number(params.get('page')) || 1,
    }),
    [params],
  );

  useEffect(() => {
    document.title = 'Menu — Delicious Adda';
    api
      .getCategories()
      .then((res) => setCategories(res.data))
      .catch(() => setCategories([]));
  }, []);

  /*
   * A table QR lands here, not on checkout — a guest wants to see the food
   * before paying. The table is stashed on the cart so it survives browsing and
   * is still known at checkout.
   */
  useEffect(() => {
    const scanned = params.get('table');
    if (scanned) setTableId(scanned);
  }, [params, setTableId]);

  useEffect(() => {
    if (!tableId) return;
    api
      .getTables()
      .then((res) => setTableInfo(res.data.find((t) => String(t._id) === String(tableId)) || null))
      .catch(() => setTableInfo(null));
  }, [tableId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    api
      .getMenu({ ...query, limit: 12 })
      .then((res) => {
        if (cancelled) return;
        setItems(res.data);
        setMeta(res.meta);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [query]);

  /** Merges a change into the URL, resetting to page 1 unless paging. */
  function update(changes) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      next.delete(key);
      if (Array.isArray(value)) value.forEach((v) => next.append(key, v));
      else if (value !== '' && value !== undefined && value !== null) next.set(key, value);
    }
    if (!('page' in changes)) next.delete('page');
    setParams(next);
  }

  const activeTypes = params.getAll('foodType');

  function toggleType(type) {
    const next = activeTypes.includes(type)
      ? activeTypes.filter((t) => t !== type)
      : [...activeTypes, type];
    update({ foodType: next });
  }

  const hasFilters =
    query.search ||
    query.category ||
    activeTypes.length ||
    query.minPrice ||
    query.maxPrice ||
    query.popular ||
    query.special;

  return (
    <div className="container page">
      <div className="page-head">
        <div>
          <h1>Our menu</h1>
          <p>{meta.total} dishes · updated daily by the kitchen</p>
        </div>
      </div>

      <form
        className="filter-bar"
        onSubmit={(e) => {
          e.preventDefault();
          update({ search: searchDraft });
        }}
      >
        <Field label="Search" id="search">
          <input
            id="search"
            type="search"
            value={searchDraft}
            placeholder="Dish or ingredient…"
            onChange={(e) => setSearchDraft(e.target.value)}
          />
        </Field>

        <Field label="Category" id="category">
          <select
            id="category"
            value={query.category}
            onChange={(e) => update({ category: e.target.value })}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Min price" id="minPrice">
          <input
            id="minPrice"
            type="number"
            min="0"
            value={query.minPrice}
            placeholder="0"
            onChange={(e) => update({ minPrice: e.target.value })}
          />
        </Field>

        <Field label="Max price" id="maxPrice">
          <input
            id="maxPrice"
            type="number"
            min="0"
            value={query.maxPrice}
            placeholder="1000"
            onChange={(e) => update({ maxPrice: e.target.value })}
          />
        </Field>

        <Field label="Sort by" id="sort">
          <select id="sort" value={query.sort} onChange={(e) => update({ sort: e.target.value })}>
            {SORTS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>

        <div className="field">
          <label>Dietary</label>
          <div className="chip-row">
            {FOOD_TYPES.map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`btn btn-sm ${activeTypes.includes(value) ? '' : 'btn-ghost'}`}
                aria-pressed={activeTypes.includes(value)}
                onClick={() => toggleType(value)}
              >
                <span className={`food-dot ${value}`} aria-hidden="true" /> {label}
              </button>
            ))}
          </div>
        </div>

        <div className="row" style={{ alignItems: 'flex-end' }}>
          <button type="submit" className="btn">
            Search
          </button>
          {hasFilters && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setSearchDraft('');
                setParams(new URLSearchParams());
              }}
            >
              Clear
            </button>
          )}
        </div>
      </form>

      {tableInfo && (
        <div className="table-banner">
          <span style={{ fontSize: '1.2rem' }}>🪑</span>
          <span>
            You are ordering at <strong>Table {tableInfo.tableNumber}</strong> ({tableInfo.location}).
            Anything you add goes to this table.
          </span>
          <div className="spacer" />
          <Link to="/cart" className="btn btn-sm">
            View cart
          </Link>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTableId('')}>
            Not at this table
          </button>
        </div>
      )}

      <Alert kind="error">{error}</Alert>

      {loading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState emoji="🔍" title="No dishes match those filters">
          Try widening your price range or clearing the dietary filters.
        </EmptyState>
      ) : (
        <>
          <div className="grid-food">
            {items.map((item) => (
              <FoodCard key={item._id} item={item} />
            ))}
          </div>
          <Pagination
            page={meta.page}
            pages={meta.pages}
            onChange={(page) => {
              update({ page });
              window.scrollTo({ top: 0 });
            }}
          />

          <div style={{ marginTop: '1rem' }}>
            <Recommendations limit={6} title="You might also like" />
          </div>
        </>
      )}
    </div>
  );
}
