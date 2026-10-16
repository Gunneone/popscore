export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

const MARGIN = 8;
const GAP = 10;

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), Math.max(min, max));
}

/** Point rect around the pointer, for anchors too big to sit beside (hero banners, detail pages). */
export function pointerRect(x: number, y: number): Rect {
  return { left: x - 8, top: y - 8, right: x + 8, bottom: y + 8, width: 16, height: 16 };
}

/** Right of the anchor if it fits, else left, else below/above; always inside the viewport. */
export function placeCard(
  anchor: Rect,
  card: { width: number; height: number },
  viewport: { width: number; height: number },
): { left: number; top: number } {
  const maxTop = viewport.height - card.height - MARGIN;
  const right = anchor.right + GAP;
  if (right + card.width <= viewport.width - MARGIN) {
    return { left: right, top: clamp(anchor.top, MARGIN, maxTop) };
  }
  const left = anchor.left - GAP - card.width;
  if (left >= MARGIN) {
    return { left, top: clamp(anchor.top, MARGIN, maxTop) };
  }
  const x = clamp(
    anchor.left + anchor.width / 2 - card.width / 2,
    MARGIN,
    viewport.width - card.width - MARGIN,
  );
  const below = anchor.bottom + GAP;
  const y =
    below + card.height <= viewport.height - MARGIN ? below : anchor.top - GAP - card.height;
  return { left: x, top: clamp(y, MARGIN, maxTop) };
}
