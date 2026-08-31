import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { money } from '../utils/format.js';

/**
 * The customer's loyalty standing.
 *
 * Shows the spendable balance, the tier, and how far off the next one is —
 * plus points already earned by orders still in the kitchen, since those are
 * promised but not yet awarded and a balance that silently omits them looks
 * wrong to the person who just spent the money.
 */
export function LoyaltyCard({ showLedger = false }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    api
      .getLoyalty()
      .then((res) => setData(res.data))
      .catch(() => setData(null));
  }, []);

  if (!data || !data.enabled) return null;

  const { tier, nextTier, pointsToNextTier, points, lifetimePoints } = data;
  const span = nextTier ? nextTier.minLifetimePoints - tier.minLifetimePoints : 1;
  const done = nextTier ? lifetimePoints - tier.minLifetimePoints : span;
  const percent = Math.max(0, Math.min(100, Math.round((done / span) * 100)));

  return (
    <div className="stack">
      <div className="loyalty-card">
        <div className="tier">
          {tier.name} member
          {tier.bonusPercent > 0 ? ` · +${tier.bonusPercent}% points` : ''}
        </div>
        <div className="points">{points.toLocaleString('en-IN')} pts</div>
        <div className="sub">
          Worth {money(points * data.valuePerPoint)} off your next bill
          {data.pendingPoints > 0 && ` · ${data.pendingPoints} more once your current order arrives`}
        </div>

        {nextTier ? (
          <>
            <div className="loyalty-progress">
              <div style={{ width: `${percent}%` }} />
            </div>
            <div className="sub" style={{ marginTop: '0.4rem' }}>
              {pointsToNextTier.toLocaleString('en-IN')} more lifetime points to reach{' '}
              {nextTier.name}
            </div>
          </>
        ) : (
          <div className="sub" style={{ marginTop: '0.5rem' }}>
            You are at our highest tier. Thank you.
          </div>
        )}
      </div>

      <div className="chip-row">
        {data.tiers?.map((t) => (
          <span key={t.key} className="tier-pill" data-current={t.key === tier.key}>
            {t.name}
            <span className="faint" style={{ fontSize: '0.72rem' }}>
              {t.minLifetimePoints}+
            </span>
          </span>
        ))}
      </div>

      <p className="faint" style={{ margin: 0 }}>
        Earn 1 point per {money(data.rupeesPerPoint)} spent on food. Redeem from{' '}
        {data.minRedeemPoints} points, covering up to {data.maxRedeemPercent}% of a bill. Points land
        when your order is handed over, and come back if it is cancelled.
      </p>

      {showLedger && data.ledger?.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Movement</th>
                <th>Points</th>
                <th>Balance</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {data.ledger.map((l, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <tr key={i}>
                  <td>
                    {l.reason}
                    {l.note && <div className="faint">{l.note}</div>}
                  </td>
                  <td className={l.points > 0 ? 'discount' : undefined}>
                    {l.points > 0 ? '+' : ''}
                    {l.points}
                  </td>
                  <td>{l.balanceAfter}</td>
                  <td className="nowrap faint">{new Date(l.at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
