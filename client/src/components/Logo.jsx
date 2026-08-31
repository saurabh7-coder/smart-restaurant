import { useId } from 'react';

/**
 * "Delicious Adda" brand lockup: a gold-on-dark emblem beside (or above) a
 * serif wordmark.
 *
 * Drawn as inline SVG rather than an image file so it stays razor sharp at any
 * size and on any display, costs no extra request, and can be recoloured from
 * CSS. The emblem keeps its own dark-and-gold palette in both light and dark
 * themes — a logo that changes colour with the theme stops reading as a mark.
 *
 * `useId` namespaces the gradient ids, because rendering the logo twice on one
 * page (header and hero) would otherwise duplicate ids and the second instance
 * would inherit the first one's fills.
 */
export function Logo({ size = 'md', layout = 'row', tagline, className = '' }) {
  const uid = useId().replace(/:/g, '');
  const gold = `gold-${uid}`;
  const shell = `shell-${uid}`;

  return (
    <span className={`logo logo-${size} logo-${layout} ${className}`.trim()}>
      <svg className="logo-mark" viewBox="0 0 64 64" role="img" aria-label="Delicious Adda">
        {/*
          gradientUnits="userSpaceOnUse" is essential, not stylistic. With the
          default objectBoundingBox units a gradient is resolved against each
          shape's own box — and a perfectly horizontal or vertical line has a
          zero-height or zero-width box, which the SVG spec leaves undefined, so
          browsers skip painting the element entirely. The tray and the handle
          stem below are exactly such lines: with bounding-box units they simply
          vanished, leaving the mark looking like a frowning face. Anchoring the
          gradient to the viewBox instead makes every stroke paint.
        */}
        <defs>
          <linearGradient id={gold} gradientUnits="userSpaceOnUse" x1="10" y1="8" x2="54" y2="56">
            <stop offset="0%" stopColor="#F7E3B8" />
            <stop offset="45%" stopColor="#D4A24C" />
            <stop offset="100%" stopColor="#F0CE8E" />
          </linearGradient>
          <linearGradient id={shell} gradientUnits="userSpaceOnUse" x1="14" y1="2" x2="50" y2="62">
            <stop offset="0%" stopColor="#3E2318" />
            <stop offset="100%" stopColor="#190D08" />
          </linearGradient>
        </defs>

        {/* medallion */}
        <circle cx="32" cy="32" r="31" fill={`url(#${shell})`} />
        <circle cx="32" cy="32" r="29.4" fill="none" stroke={`url(#${gold})`} strokeWidth="1.4" />
        <circle
          cx="32"
          cy="32"
          r="25.6"
          fill="none"
          stroke={`url(#${gold})`}
          strokeWidth="0.7"
          opacity="0.45"
        />

        {/* steam */}
        <g
          fill="none"
          stroke={`url(#${gold})`}
          strokeWidth="1.6"
          strokeLinecap="round"
          opacity="0.85"
        >
          <path d="M25.5 18.5c-2.1-2.4 1.6-4 -0.4-6.6" />
          <path d="M32 16.4c-2.1-2.4 1.6-4 -0.4-6.6" />
          <path d="M38.5 18.5c-2.1-2.4 1.6-4 -0.4-6.6" />
        </g>

        {/* cloche: handle, dome, tray */}
        <g stroke={`url(#${gold})`} strokeLinecap="round" fill="none">
          <circle cx="32" cy="24.2" r="2" fill={`url(#${gold})`} stroke="none" />
          <path d="M32 26.2v2.2" strokeWidth="1.8" />
          <path d="M17.5 45.5a14.5 14.5 0 0 1 29 0" strokeWidth="2.4" />
          <path d="M13 45.8h38" strokeWidth="2.6" />
          <path d="M20 51h24" strokeWidth="1.6" opacity="0.55" />
        </g>
      </svg>

      <span className="logo-text">
        <span className="logo-eyebrow">Delicious</span>
        <span className="logo-name">Adda</span>
        {tagline && <span className="logo-tagline">{tagline}</span>}
      </span>
    </span>
  );
}
