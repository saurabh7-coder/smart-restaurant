import { ApiError } from './ApiError.js';
import { toPaise, toRupees } from './pricing.js';
import { tierFor } from '../constants.js';

/**
 * Loyalty points.
 *
 * Two rules keep this honest and auditable:
 *
 *  1. Points are earned on the FOOD value (after discount, before tax and
 *     delivery). Earning on tax would mean the government's share generated
 *     rewards; earning on the delivery fee would reward the courier's cut.
 *
 *  2. Redemption is always recomputed and re-capped on the server. The browser
 *     asks to spend N points; the server decides how many it is actually
 *     allowed to spend, exactly as it does with prices.
 */

/** Points a bill earns, including the customer's tier bonus. */
export function pointsEarnedFor({ taxablePaise, config, lifetimePoints = 0 }) {
  if (!config?.enabled) return 0;

  const perPoint = Math.max(config.rupeesPerPoint || 10, 1);
  const base = Math.floor(toRupees(taxablePaise) / perPoint);

  const tier = tierFor(lifetimePoints);
  const bonus = Math.floor((base * (tier.bonusPercent || 0)) / 100);

  return base + bonus;
}

/**
 * How many points may actually be spent on this bill, and what that is worth.
 *
 * Capped three ways — by the balance held, by the share of the bill the
 * restaurant allows points to cover, and by the bill itself — so a redemption
 * can never exceed what is owed or turn into a payout.
 */
export function computeRedemption({ requestedPoints, availablePoints, taxablePaise, config }) {
  const zero = { points: 0, discountPaise: 0, reason: null };

  if (!config?.enabled) return { ...zero, reason: 'Loyalty is switched off.' };

  const wanted = Math.floor(Number(requestedPoints) || 0);
  if (wanted <= 0) return zero;

  const available = Math.max(Math.floor(availablePoints || 0), 0);
  if (available < (config.minRedeemPoints || 0)) {
    return {
      ...zero,
      reason: `You need at least ${config.minRedeemPoints} points to redeem. You have ${available}.`,
    };
  }
  if (wanted > available) {
    return { ...zero, reason: `You only have ${available} points.` };
  }

  const pointValue = config.pointValue || 1;
  const maxShare = Math.floor((taxablePaise * (config.maxRedeemPercent ?? 100)) / 100);
  const wantedPaise = toPaise(wanted * pointValue);

  const discountPaise = Math.min(wantedPaise, maxShare, taxablePaise);
  // Only charge the customer for the points actually used, rounding down so
  // rounding never costs them a point they did not spend.
  const pointsUsed = Math.floor(toRupees(discountPaise) / pointValue);

  if (pointsUsed <= 0) {
    return { ...zero, reason: 'This bill is too small to redeem points against.' };
  }

  return {
    points: pointsUsed,
    discountPaise: toPaise(pointsUsed * pointValue),
    reason:
      pointsUsed < wanted
        ? `Only ${pointsUsed} points could be used — points may cover at most ${config.maxRedeemPercent}% of a bill.`
        : null,
  };
}

/** Throws when a requested redemption cannot be honoured at all. */
export function assertRedeemable(result) {
  if (result.points === 0 && result.reason) throw ApiError.badRequest(result.reason);
}

/** Public view of a customer's standing, including progress to the next tier. */
export function loyaltySummary(user, config) {
  const points = user?.loyalty?.points || 0;
  const lifetime = user?.loyalty?.lifetimePoints || 0;
  const tier = tierFor(lifetime);

  const { LOYALTY_TIERS } = config?.tiers ? { LOYALTY_TIERS: config.tiers } : {};
  const tiers = LOYALTY_TIERS || null;
  const next = tiers
    ? tiers.find((t) => t.minLifetimePoints > lifetime) || null
    : null;

  return {
    points,
    lifetimePoints: lifetime,
    tier,
    nextTier: next,
    pointsToNextTier: next ? next.minLifetimePoints - lifetime : 0,
    valuePerPoint: config?.pointValue ?? 1,
    minRedeemPoints: config?.minRedeemPoints ?? 0,
    maxRedeemPercent: config?.maxRedeemPercent ?? 100,
    enabled: Boolean(config?.enabled),
  };
}
