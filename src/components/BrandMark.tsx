/**
 * The Territory OS mark: a tray, and what is in it.
 *
 * Four cells in a case, two of them accounted for -- which is the whole job.
 * Geometric rather than pictorial so it survives being 20px in a nav bar and
 * still reads at 64px on the sign-in screen.
 */
export default function BrandMark({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      role="img"
      aria-label="Territory OS"
      className={className}
    >
      <defs>
        <linearGradient id="tos-body" x1="6" y1="4" x2="34" y2="36" gradientUnits="userSpaceOnUse">
          <stop stopColor="#173257" />
          <stop offset="1" stopColor="#0b1526" />
        </linearGradient>
        <linearGradient id="tos-fill" x1="12" y1="12" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5cabff" />
          <stop offset="1" stopColor="#1273e6" />
        </linearGradient>
      </defs>

      <rect x="2" y="2" width="36" height="36" rx="11" fill="url(#tos-body)" />
      <rect
        x="2.75"
        y="2.75"
        width="34.5"
        height="34.5"
        rx="10.25"
        stroke="#2f8cf4"
        strokeOpacity="0.42"
        strokeWidth="1.5"
      />

      {/* Filled cells: the diagonal keeps it from reading as a plain window. */}
      <rect x="10.5" y="10.5" width="8" height="8" rx="2.4" fill="url(#tos-fill)" />
      <rect x="21.5" y="21.5" width="8" height="8" rx="2.4" fill="url(#tos-fill)" />

      {/* Empty cells: the ones still to account for. */}
      <rect
        x="21.5"
        y="10.5"
        width="8"
        height="8"
        rx="2.4"
        stroke="#5cabff"
        strokeOpacity="0.5"
        strokeWidth="1.5"
      />
      <rect
        x="10.5"
        y="21.5"
        width="8"
        height="8"
        rx="2.4"
        stroke="#5cabff"
        strokeOpacity="0.5"
        strokeWidth="1.5"
      />
    </svg>
  );
}
