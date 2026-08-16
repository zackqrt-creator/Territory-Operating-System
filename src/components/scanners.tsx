import { lazy, Suspense } from "react";
import type { ComponentProps } from "react";

/**
 * The camera scanners, loaded only when a camera is actually opened.
 *
 * html5-qrcode is about 370 KB on its own -- more than half the size of
 * everything else in the app put together. It was riding into the Inventory
 * bundle because the add-item sheet imports the intake forms, which import the
 * packing-slip scanner, even though the scanner only ever renders behind an
 * `if (scanning)`. Tapping "Add item" in a hallway paid for a camera that most
 * of the time never opens.
 *
 * Every one of these is already conditionally rendered, so wrapping them in
 * lazy() costs nothing at the call sites and moves the library behind the tap
 * that needs it. The service worker precaches the chunk either way, so an
 * installed app has it on disk before the first scan.
 */
const PackingSlipScanInner = lazy(() => import("./PackingSlipScan"));
const StickerSheetCaptureInner = lazy(() => import("./StickerSheetCapture"));
const BatchScanSheetInner = lazy(() => import("./BatchScanSheet"));
const DigitalTicketImportInner = lazy(() => import("./DigitalTicketImport"));

/**
 * Full-screen, because that is how each of these presents. Anything smaller
 * would let the screen underneath show through for a frame and read as a
 * misfire rather than a camera warming up.
 */
function ScannerLoading() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950 text-sm text-slate-400">
      Starting camera...
    </div>
  );
}

export function PackingSlipScan(props: ComponentProps<typeof PackingSlipScanInner>) {
  return (
    <Suspense fallback={<ScannerLoading />}>
      <PackingSlipScanInner {...props} />
    </Suspense>
  );
}

export function StickerSheetCapture(props: ComponentProps<typeof StickerSheetCaptureInner>) {
  return (
    <Suspense fallback={<ScannerLoading />}>
      <StickerSheetCaptureInner {...props} />
    </Suspense>
  );
}

export function BatchScanSheet(props: ComponentProps<typeof BatchScanSheetInner>) {
  return (
    <Suspense fallback={<ScannerLoading />}>
      <BatchScanSheetInner {...props} />
    </Suspense>
  );
}

export function DigitalTicketImport(props: ComponentProps<typeof DigitalTicketImportInner>) {
  return (
    <Suspense fallback={<ScannerLoading />}>
      <DigitalTicketImportInner {...props} />
    </Suspense>
  );
}
