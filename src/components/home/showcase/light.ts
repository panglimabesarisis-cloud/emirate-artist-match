/** Where the box light sits. It always lives on the edge, measured as a distance clockwise from the top left. */

export type Size = { width: number; height: number };
export const perimeter = ({ width, height }: Size) => 2 * (width + height);

/** The point on the edge closest to the pointer, whether the pointer is inside or outside the box. */
export function edgeDistance(x: number, y: number, size: Size) {
  const { width, height } = size;
  const cx = Math.min(width, Math.max(0, x)); const cy = Math.min(height, Math.max(0, y));
  const sides = [
    { gap: Math.hypot(x - cx, y), at: cx },
    { gap: Math.hypot(x - width, y - cy), at: width + cy },
    { gap: Math.hypot(x - cx, y - height), at: width + height + (width - cx) },
    { gap: Math.hypot(x, y - cy), at: 2 * width + height + (height - cy) },
  ];
  return sides.reduce((best, side) => (side.gap < best.gap ? side : best)).at;
}

export function edgePoint(distance: number, size: Size) {
  const { width, height } = size;
  const all = perimeter(size) || 1;
  let d = ((distance % all) + all) % all;
  if (d <= width) return { x: d, y: 0, outX: 0, outY: -1 };
  d -= width;
  if (d <= height) return { x: width, y: d, outX: 1, outY: 0 };
  d -= height;
  if (d <= width) return { x: width - d, y: height, outX: 0, outY: 1 };
  return { x: 0, y: height - (d - width), outX: -1, outY: 0 };
}

/** Moves a share of the way to the target, going the short way round the box. */
export function approach(from: number, to: number, share: number, size: Size) {
  const all = perimeter(size) || 1;
  const delta = ((((to - from) % all) + all * 1.5) % all) - all / 2;
  return (((from + delta * share) % all) + all) % all;
}
