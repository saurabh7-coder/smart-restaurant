import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Alert } from './ui.jsx';

/**
 * Declared allergies.
 *
 * A fixed list of toggles rather than a text box: warnings are produced by
 * matching these against each dish's recorded allergens, and free text would
 * make that matching unreliable in exactly the situation where it must not be.
 *
 * The wording under the toggles is deliberate. This flags dishes from recorded
 * data — it is a useful filter, not a medical guarantee, and a guest with a
 * serious allergy still needs to speak to staff.
 */
export function AllergyPicker() {
  const { user, setUser } = useAuth();
  const toast = useToast();

  const [available, setAvailable] = useState([]);
  const [selected, setSelected] = useState(user?.allergies || []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [impact, setImpact] = useState(null);

  useEffect(() => {
    api
      .getAiStatus()
      .then((res) => setAvailable(res.data.allergens || []))
      .catch(() => setAvailable([]));
  }, []);

  useEffect(() => {
    setSelected(user?.allergies || []);
  }, [user]);

  // Show how many dishes the current selection actually affects — an abstract
  // list of allergens means much less than "this hides 12 dishes".
  useEffect(() => {
    if (selected.length === 0) {
      setImpact(null);
      return;
    }
    api
      .screenDishes({ allergies: selected })
      .then((res) => setImpact({ count: res.data.length, checked: res.meta.checked }))
      .catch(() => setImpact(null));
  }, [selected]);

  const toggle = (allergen) =>
    setSelected((cur) => (cur.includes(allergen) ? cur.filter((a) => a !== allergen) : [...cur, allergen]));

  async function save() {
    setSaving(true);
    setError('');
    try {
      const res = await api.updateProfile({ allergies: selected });
      setUser(res.data);
      toast.success(
        selected.length
          ? `We will flag dishes containing ${selected.join(', ')}.`
          : 'Allergy warnings turned off.',
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const dirty = JSON.stringify([...selected].sort()) !== JSON.stringify([...(user?.allergies || [])].sort());

  return (
    <section className="panel">
      <div className="page-head" style={{ marginBottom: '0.75rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.3rem' }}>Allergies</h2>
          <p>We will warn you before you order anything that contains these.</p>
        </div>
      </div>

      <Alert kind="error">{error}</Alert>

      <div className="allergen-grid">
        {available.map((allergen) => (
          <button
            key={allergen}
            type="button"
            className="allergen-toggle"
            aria-pressed={selected.includes(allergen)}
            onClick={() => toggle(allergen)}
          >
            {selected.includes(allergen) ? '✓ ' : ''}
            {allergen}
          </button>
        ))}
      </div>

      {impact && (
        <p className="faint" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
          {impact.count === 0
            ? `Nothing on our menu contains those — all ${impact.checked} dishes are clear.`
            : `${impact.count} of our ${impact.checked} dishes would be flagged for you.`}
        </p>
      )}

      <div className="row" style={{ marginTop: '1rem' }}>
        <button type="button" className="btn" onClick={save} disabled={saving || !dirty}>
          {saving ? 'Saving…' : dirty ? 'Save allergies' : 'Saved'}
        </button>
        {selected.length > 0 && (
          <button type="button" className="btn btn-ghost" onClick={() => setSelected([])} disabled={saving}>
            Clear all
          </button>
        )}
      </div>

      <Alert kind="warning">
        These warnings come from the allergens the kitchen records against each dish, and from its
        ingredient list. They are a guide, not a guarantee — dishes are prepared in a shared kitchen,
        so please tell staff about a serious allergy when you order.
      </Alert>
    </section>
  );
}
