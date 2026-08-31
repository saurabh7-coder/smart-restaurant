import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { useToast } from '../../context/ToastContext.jsx';
import { Alert, ConfirmDialog, EmptyState, Spinner, Stars } from '../../components/ui.jsx';
import { formatDate } from '../../utils/format.js';

export default function ReviewManage() {
  const toast = useToast();

  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api
      .getReviews({ limit: 100 })
      .then((res) => setReviews(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    document.title = 'Reviews — Admin';
    load();
  }, [load]);

  async function toggleApproval(review) {
    try {
      await api.updateReview(review._id, { isApproved: !review.isApproved });
      toast.success(review.isApproved ? 'Review hidden.' : 'Review published.');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api.deleteReview(deleting._id);
      toast.success('Review deleted.');
      setDeleting(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner />;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Review moderation</h1>
          <p>{reviews.length} reviews · hiding one removes it from the public site</p>
        </div>
      </div>

      <Alert kind="error">{error}</Alert>

      {reviews.length === 0 ? (
        <EmptyState emoji="⭐" title="No reviews yet" />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Rating</th>
                <th>Review</th>
                <th>About</th>
                <th>By</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {reviews.map((r) => (
                <tr key={r._id}>
                  <td>
                    <Stars value={r.rating} />
                  </td>
                  <td style={{ maxWidth: 320 }}>{r.comment || <em className="faint">No comment</em>}</td>
                  <td>{r.menuItem?.name || <em className="faint">Restaurant</em>}</td>
                  <td className="nowrap">
                    {r.user?.name || 'Guest'}
                    <div className="faint">{formatDate(r.createdAt)}</div>
                  </td>
                  <td>
                    {r.isApproved ? (
                      <span className="badge badge-ok">Published</span>
                    ) : (
                      <span className="badge badge-danger">Hidden</span>
                    )}
                  </td>
                  <td className="nowrap">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => toggleApproval(r)}
                    >
                      {r.isApproved ? 'Hide' : 'Publish'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => setDeleting(r)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete this review?"
          message="The review will be permanently removed and the dish rating recalculated."
          confirmLabel="Delete"
          danger
          busy={busy}
          onCancel={() => setDeleting(null)}
          onConfirm={remove}
        />
      )}
    </>
  );
}
