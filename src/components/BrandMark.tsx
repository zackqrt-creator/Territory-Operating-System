import { useId } from "react";

/**
 * The Territory OS emblem.
 *
 * Kept as inline SVG rather than an <img> so it paints with the first frame --
 * it sits in the sign-in header and the Home header, and a logo that pops in a
 * beat late is the most noticeable kind of slow.
 *
 * The artwork is navy on white by design, which disappears against this app's
 * near-black background. So by default it is set in a light tile, the way it
 * appears as a home-screen icon. Pass `tile={false}` when placing it on a light
 * surface. The identical artwork lives at public/brand/emblem.svg, which is
 * what scripts/generate-icons.mjs rasterises into the app icons -- one source,
 * so the icon on the home screen and the mark in the header cannot drift.
 */
export default function BrandMark({
  className = "h-10 w-10",
  tile = true,
}: {
  className?: string;
  tile?: boolean;
}) {
  // SVG ids are document-global. Two marks on one screen (the top bar plus a
  // page header, say) would both define "tos-right", and unmounting the first
  // would silently break the second's mask.
  const maskId = `tos-right-${useId()}`;

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden ${
        tile ? "rounded-[22%] bg-white shadow-lg shadow-black/30 ring-1 ring-white/15" : ""
      } ${className}`}
    >
      <svg
        viewBox="0 0 64 64"
        fill="none"
        role="img"
        aria-label="Territory OS"
        className={tile ? "h-[78%] w-[78%]" : "h-full w-full"}
      >
        <defs>
          {/* Removes the hexagon's right edge; the coloured layers replace it. */}
          <mask id={maskId}>
            <rect width="64" height="64" fill="#fff" />
            <rect x="45" y="16" width="19" height="32" fill="#000" />
          </mask>
        </defs>

        <g mask={`url(#${maskId})`}>
          <path
            d="M31 2 56.98 17 56.98 47 31 62 5.02 47 5.02 17Z"
            stroke="#17375E"
            strokeWidth="7.6"
            strokeLinejoin="round"
          />
        </g>

        {/* Three stacked layers, left edges echoing the hexagon's diagonals. */}
        <path d="M53 17.4 H61.4 A1.6 1.6 0 0 1 63 19v5.6a1.6 1.6 0 0 1-1.6 1.6H47.6Z" fill="#159C99" />
        <path d="M49.4 28.2H61.4A1.6 1.6 0 0 1 63 29.8v4.4a1.6 1.6 0 0 1-1.6 1.6H49.4Z" fill="#1560F0" />
        <path d="M47.6 37.8H61.4A1.6 1.6 0 0 1 63 39.4V45a1.6 1.6 0 0 1-1.6 1.6H53Z" fill="#159C99" />

        {/* Location pin, centred in the open field left of the layers. */}
        <path
          d="M28 46.4C28 46.4 18.1 34.7 18.1 28.3a9.9 9.9 0 1 1 19.8 0c0 6.4-9.9 18.1-9.9 18.1Z"
          fill="#159C99"
        />
        <circle cx="28" cy="28.1" r="5" fill="#fff" />
        <circle cx="28" cy="28.1" r="2.9" fill="#17375E" />
      </svg>
    </span>
  );
}
