import QRCode from "qrcode";

/** A QR code drawn as SVG (works in print and on shared pages without loading anything). */
export function QrCode({ value, size = 160, className }: { value: string; size?: number; className?: string }) {
  const qr = QRCode.create(value, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const quiet = 2;
  let path = "";
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.modules.get(y, x)) path += `M${x + quiet} ${y + quiet}h1v1h-1z`;
  return (
    <svg viewBox={`0 0 ${n + quiet * 2} ${n + quiet * 2}`} width={size} height={size} className={className} role="img" aria-label="QR code" shapeRendering="crispEdges">
      <rect width="100%" height="100%" fill="#fff" />
      <path d={path} fill="#0b1020" />
    </svg>
  );
}
