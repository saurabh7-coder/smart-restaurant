import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { useToast } from '../../context/ToastContext.jsx';
import {
  Alert,
  ConfirmDialog,
  Field,
  Modal,
  Pagination,
  Spinner,
  FoodTypeTag,
} from '../../components/ui.jsx';
import { money } from '../../utils/format.js';

const BLANK = {
  name: '',
  category: '',
  price: '',
  foodType: 'veg',
  description: '',
  spiceLevel: 0,
  ingredients: '',
  allergens: '',
  calories: '',
  isAvailable: true,
  isPopular: false,
  isTodaysSpecial: false,
};

export default function MenuManage() {
  const toast = useToast();

  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showCategories, setShowCategories] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api
      .getMenu({ page, limit: 20, search, sort: 'name' })
      .then((res) => {
        setItems(res.data);
        setMeta(res.meta);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [page, search]);

  useEffect(() => {
    document.title = 'Menu management — Admin';
    api.getCategories().then((res) => setCategories(res.data)).catch(() => {});
  }, []);

  useEffect(load, [load]);

  async function remove() {
    setBusy(true);
    try {
      await api.deleteMenuItem(deleting._id);
      toast.success(`${deleting.name} deleted.`);
      setDeleting(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Menu management</h1>
          <p>{meta.total} dishes</p>
        </div>
        <div className="row">
          <button type="button" className="btn btn-ghost" onClick={() => setShowCategories(true)}>
            Categories
          </button>
          <button type="button" className="btn" onClick={() => setEditing({ ...BLANK })}>
            + Add dish
          </button>
        </div>
      </div>

      <Alert kind="error">{error}</Alert>

      <form
        className="row"
        style={{ marginBottom: '1rem' }}
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          load();
        }}
      >
        <input
          type="search"
          placeholder="Search dishes…"
          value={search}
          style={{ maxWidth: 320 }}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="submit" className="btn btn-ghost">
          Search
        </button>
      </form>

      {loading ? (
        <Spinner />
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Dish</th>
                  <th>Category</th>
                  <th>Price</th>
                  <th>Type</th>
                  <th>Flags</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item._id}>
                    <td>
                      <strong>{item.name}</strong>
                      <div className="faint">{item.description?.slice(0, 60)}</div>
                    </td>
                    <td>{item.category?.name}</td>
                    <td className="nowrap">{money(item.price)}</td>
                    <td>
                      <FoodTypeTag type={item.foodType} showLabel={false} />
                    </td>
                    <td>
                      <div className="chip-row">
                        {item.isAvailable ? (
                          <span className="badge badge-ok">Available</span>
                        ) : (
                          <span className="badge badge-danger">Hidden</span>
                        )}
                        {item.isPopular && <span className="badge badge-warn">Popular</span>}
                        {item.isTodaysSpecial && <span className="badge badge-brand">Special</span>}
                      </div>
                    </td>
                    <td className="nowrap">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() =>
                          setEditing({
                            ...item,
                            category: item.category?._id || '',
                            ingredients: (item.ingredients || []).join(', '),
                            allergens: (item.allergens || []).join(', '),
                            calories: item.calories ?? '',
                          })
                        }
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => setDeleting(item)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={meta.page} pages={meta.pages} onChange={setPage} />
        </>
      )}

      {editing && (
        <MenuItemModal
          item={editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete this dish?"
          message={`"${deleting.name}" and its reviews will be permanently removed.`}
          confirmLabel="Delete"
          danger
          busy={busy}
          onCancel={() => setDeleting(null)}
          onConfirm={remove}
        />
      )}

      {showCategories && (
        <CategoryModal
          categories={categories}
          onClose={() => setShowCategories(false)}
          onChanged={() => api.getCategories().then((res) => setCategories(res.data))}
        />
      )}
    </>
  );
}

function MenuItemModal({ item, categories, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(item);
  const [file, setFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [writing, setWriting] = useState(false);

  const isNew = !item._id;

  /**
   * Drafts the description from the fields already filled in.
   *
   * It fills the textarea rather than saving, so the wording is always a
   * suggestion the admin reads and can edit — nothing reaches the menu without
   * a person approving it.
   */
  async function writeDescription() {
    setWriting(true);
    try {
      const res = await api.describeDish({
        name: form.name,
        ingredients: form.ingredients,
        category: categories.find((c) => c._id === form.category)?.name,
        foodType: form.foodType,
        spiceLevel: form.spiceLevel,
        allergens: form.allergens,
      });
      setForm((f) => ({ ...f, description: res.data.text }));
      toast.success(
        res.data.engine === 'claude'
          ? 'Draft written — edit it however you like.'
          : 'Draft built from the ingredients. Add ANTHROPIC_API_KEY for a written one.',
      );
    } catch (err) {
      toast.error(err.message);
    } finally {
      setWriting(false);
    }
  }

  async function save(e) {
    e.preventDefault();
    setError('');
    setErrors({});
    setBusy(true);

    // Sent as multipart so the optional image upload rides along with the fields.
    const data = new FormData();
    for (const key of [
      'name',
      'category',
      'price',
      'foodType',
      'description',
      'spiceLevel',
      'ingredients',
      'allergens',
      'calories',
      'isAvailable',
      'isPopular',
      'isTodaysSpecial',
    ]) {
      if (form[key] !== undefined && form[key] !== null) data.append(key, form[key]);
    }
    if (file) data.append('image', file);

    try {
      if (isNew) await api.createMenuItem(data);
      else await api.updateMenuItem(item._id, data);
      toast.success(isNew ? 'Dish added.' : 'Dish updated.');
      onSaved();
    } catch (err) {
      setError(err.message);
      setErrors(err.details || {});
    } finally {
      setBusy(false);
    }
  }

  const set = (key) => (e) =>
    setForm({ ...form, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  return (
    <Modal
      title={isNew ? 'Add dish' : `Edit ${item.name}`}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="menu-form" className="btn" disabled={busy}>
            {busy ? 'Saving…' : 'Save dish'}
          </button>
        </>
      }
    >
      <form id="menu-form" onSubmit={save}>
        <Alert kind="error">{error}</Alert>

        <div className="grid-2">
          <Field label="Dish name" id="m-name" error={errors.name}>
            <input id="m-name" value={form.name} onChange={set('name')} required />
          </Field>
          <Field label="Category" id="m-cat" error={errors.category}>
            <select id="m-cat" value={form.category} onChange={set('category')} required>
              <option value="">Choose…</option>
              {categories.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid-3">
          <Field label="Price (₹)" id="m-price" error={errors.price}>
            <input id="m-price" type="number" min="0" value={form.price} onChange={set('price')} required />
          </Field>
          <Field label="Food type" id="m-type" error={errors.foodType}>
            <select id="m-type" value={form.foodType} onChange={set('foodType')}>
              <option value="veg">Veg</option>
              <option value="non_veg">Non-Veg</option>
              <option value="vegan">Vegan</option>
            </select>
          </Field>
          <Field label="Calories (optional)" id="m-cal" error={errors.calories}>
            <input id="m-cal" type="number" min="0" value={form.calories} onChange={set('calories')} />
          </Field>
        </div>

        <Field label="Spice level" id="m-spice" hint="0 is not spicy, 5 is very hot. Guests filter on this.">
          <input
            id="m-spice"
            type="range"
            min="0"
            max="5"
            value={form.spiceLevel ?? 0}
            onChange={set('spiceLevel')}
          />
          <div className="faint">
            {['Not spicy', 'Mild', 'Mild-medium', 'Medium', 'Hot', 'Very hot'][Number(form.spiceLevel) || 0]}
          </div>
        </Field>

        <Field label="Description" id="m-desc" error={errors.description}>
          <div className="ai-field-row">
            <textarea id="m-desc" maxLength={1000} value={form.description} onChange={set('description')} />
            <button
              type="button"
              className="btn btn-ghost btn-sm nowrap"
              disabled={!form.name || writing}
              title={form.name ? 'Write a description from the ingredients' : 'Enter a dish name first'}
              onClick={writeDescription}
            >
              {writing ? 'Writing…' : '✨ Write it'}
            </button>
          </div>
        </Field>

        <div className="grid-2">
          <Field label="Ingredients" id="m-ing" hint="Comma separated">
            <input id="m-ing" value={form.ingredients} onChange={set('ingredients')} />
          </Field>
          <Field label="Allergens" id="m-all" hint="Comma separated">
            <input id="m-all" value={form.allergens} onChange={set('allergens')} />
          </Field>
        </div>

        <Field label="Image" id="m-img" hint="JPG, PNG, WEBP or GIF · 2 MB maximum">
          <input
            id="m-img"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </Field>
        {form.image && !file && (
          <p className="faint">Current image: {form.image}</p>
        )}

        <fieldset>
          <legend>Visibility</legend>
          <div className="checkline">
            <input id="m-avail" type="checkbox" checked={form.isAvailable} onChange={set('isAvailable')} />
            <label htmlFor="m-avail">Available to order</label>
          </div>
          <div className="checkline">
            <input id="m-pop" type="checkbox" checked={form.isPopular} onChange={set('isPopular')} />
            <label htmlFor="m-pop">Mark as popular</label>
          </div>
          <div className="checkline">
            <input
              id="m-spec"
              type="checkbox"
              checked={form.isTodaysSpecial}
              onChange={set('isTodaysSpecial')}
            />
            <label htmlFor="m-spec">Today&apos;s special</label>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}

function CategoryModal({ categories, onClose, onChanged }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [list, setList] = useState(categories);
  const [error, setError] = useState('');

  const refresh = async () => {
    const res = await api.getCategories();
    setList(res.data);
    onChanged();
  };

  async function add(e) {
    e.preventDefault();
    setError('');
    try {
      await api.createCategory({ name });
      setName('');
      await refresh();
      toast.success('Category added.');
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(id) {
    setError('');
    try {
      await api.deleteCategory(id);
      await refresh();
      toast.success('Category deleted.');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Modal title="Categories" onClose={onClose}>
      <Alert kind="error">{error}</Alert>

      <form className="row" onSubmit={add} style={{ marginBottom: '1rem' }}>
        <input
          value={name}
          placeholder="New category name"
          required
          style={{ flex: 1 }}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="btn">
          Add
        </button>
      </form>

      <div className="table-wrap">
        <table style={{ minWidth: 0 }}>
          <tbody>
            {list.map((c) => (
              <tr key={c._id}>
                <td>{c.name}</td>
                <td className="nowrap" style={{ textAlign: 'right' }}>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => remove(c._id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="faint" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
        A category can only be deleted once no dishes use it.
      </p>
    </Modal>
  );
}
