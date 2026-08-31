import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { Alert, Spinner, Stars } from '../../components/ui.jsx';
import { formatDate } from '../../utils/format.js';

const FACE = { positive: '😊', neutral: '😐', negative: '😡' };
const THEME_LABEL = {
  taste: 'Taste',
  service: 'Service',
  price: 'Pricing',
  portion: 'Portions',
  cleanliness: 'Cleanliness',
  wait: 'Waiting time',
};

/**
 * Sentiment dashboard.
 *
 * The headline split answers "how are we doing"; the theme table answers the
 * more useful question, "what should I fix first" — ranked by how many of each
 * theme's mentions were complaints rather than by raw volume, so a small but
 * badly-received area is not buried under a popular one.
 */
export default function Sentiment() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    document.title = 'Guest sentiment — Admin';
    api
      .getSentiment({ limit: 80 })
      .then((res) => setData({ ...res.data, note: res.meta?.note }))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  if (error) return <Alert kind="error">{error}</Alert>;
  if (!data || data.total === 0) {
    return (
      <>
        <div className="page-head">
          <h1>Guest sentiment</h1>
        </div>
        <Alert kind="info">No reviews yet. This fills in as guests rate what they ate.</Alert>
      </>
    );
  }

  const shown =
    filter === 'all' ? data.reviews : data.reviews.filter((r) => r.analysis?.sentiment === filter);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Guest sentiment</h1>
          <p>
            {data.total} reviews · read by {data.engine === 'claude' ? 'Claude' : 'the built-in analyser'}
          </p>
        </div>
      </div>

      {/* ---- the headline split ---- */}
      <div className="sentiment-split">
        {['positive', 'neutral', 'negative'].map((key) => (
          <button
            key={key}
            type="button"
            className={`sentiment-card ${key}${filter === key ? ' active' : ''}`}
            onClick={() => setFilter(filter === key ? 'all' : key)}
          >
            <span className="face" aria-hidden="true">{FACE[key]}</span>
            <strong>{data.percentages[key]}%</strong>
            <small>
              {key} · {data.counts[key]}
            </small>
          </button>
        ))}
      </div>

      <div className="sentiment-bar" role="img"
        aria-label={`${data.percentages.positive}% positive, ${data.percentages.neutral}% neutral, ${data.percentages.negative}% negative`}>
        <div className="positive" style={{ width: `${data.percentages.positive}%` }} />
        <div className="neutral" style={{ width: `${data.percentages.neutral}%` }} />
        <div className="negative" style={{ width: `${data.percentages.negative}%` }} />
      </div>

      {data.summary && (
        <Alert kind="info">
          <strong>What guests are saying:</strong> {data.summary}
        </Alert>
      )}

      {data.actions?.length > 0 && (
        <section className="panel" style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ marginTop: 0 }}>Worth acting on</h3>
          <ul className="action-list">
            {data.actions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </section>
      )}

      {/* ---- where the complaints are ---- */}
      <section style={{ marginBottom: '1.5rem' }}>
        <h3>What they are about</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Theme</th>
                <th>Mentions</th>
                <th>Positive</th>
                <th>Negative</th>
                <th>Complaint rate</th>
              </tr>
            </thead>
            <tbody>
              {data.themes.map((t) => (
                <tr key={t.theme}>
                  <td>
                    <strong>{THEME_LABEL[t.theme] || t.theme}</strong>
                  </td>
                  <td>{t.total}</td>
                  <td className="discount">{t.positive}</td>
                  <td>{t.negative}</td>
                  <td>
                    <div className="complaint-meter" title={`${t.complaintRate}% of mentions were complaints`}>
                      <div style={{ width: `${t.complaintRate}%` }} data-high={t.complaintRate >= 50} />
                      <span>{t.complaintRate}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---- the reviews themselves ---- */}
      <section>
        <div className="page-head">
          <h3 style={{ margin: 0 }}>
            {filter === 'all' ? 'All reviews' : `${filter} reviews`} ({shown.length})
          </h3>
          {filter !== 'all' && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFilter('all')}>
              Show all
            </button>
          )}
        </div>

        <div className="stack-sm">
          {shown.map((r) => (
            <div key={r._id} className="panel review-row">
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <Stars value={r.rating} />
                  <div className="faint">
                    {r.user} · {formatDate(r.createdAt)}
                    {r.dish ? ` · on ${r.dish}` : ' · about the restaurant'}
                  </div>
                </div>
                <span className={`sentiment-pill ${r.analysis?.sentiment}`}>
                  {FACE[r.analysis?.sentiment]} {r.analysis?.sentiment}
                </span>
              </div>

              {r.comment && <p style={{ marginBottom: '0.5rem' }}>“{r.comment}”</p>}

              {r.analysis?.themes?.length > 0 && (
                <div className="chip-row">
                  {r.analysis.themes.map((t) => (
                    <span key={t.theme} className={`theme-chip ${t.sentiment}`} title={t.evidence}>
                      {THEME_LABEL[t.theme] || t.theme}
                      {t.evidence ? ` — “${t.evidence}”` : ''}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {data.note && <p className="faint" style={{ marginTop: '1.5rem' }}>{data.note}</p>}
    </>
  );
}
