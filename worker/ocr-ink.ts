type Box = {
  left: number;
  top: number;
  width: number;
  height: number;
  area: number;
};
function components(
  gray: Uint8Array,
  width: number,
  height: number,
  threshold: number,
): Box[] {
  const visited = new Uint8Array(width * height),
    boxes: Box[] = [];
  for (let at = 0; at < visited.length; at++) {
    if (visited[at] || gray[at] >= threshold) continue;
    const stack = [at];
    visited[at] = 1;
    let minX = width,
      minY = height,
      maxX = 0,
      maxY = 0,
      area = 0;
    while (stack.length) {
      const p = stack.pop()!,
        x = p % width,
        y = Math.floor(p / width);
      area++;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      for (const q of [
        x ? p - 1 : -1,
        x + 1 < width ? p + 1 : -1,
        y ? p - width : -1,
        y + 1 < height ? p + width : -1,
      ])
        if (q >= 0 && !visited[q] && gray[q] < threshold) {
          visited[q] = 1;
          stack.push(q);
        }
    }
    boxes.push({
      left: minX,
      top: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
      area,
    });
  }
  return boxes;
}
export function numberInkBounds(
  gray: Uint8Array,
  width: number,
  height: number,
): Box | null {
  const boxes = components(gray, width, height, 180).filter(
    (b) =>
      b.height > height * 0.15 &&
      b.area > height * 0.4 &&
      Math.abs(b.top + b.height / 2 - height / 2) < height * 0.3,
  );
  if (!boxes.length) return null;
  const left = Math.max(0, Math.min(...boxes.map((b) => b.left)) - 6),
    top = Math.max(0, Math.min(...boxes.map((b) => b.top)) - 6);
  return {
    left,
    top,
    width: Math.min(
      width - left,
      Math.max(...boxes.map((b) => b.left + b.width)) - left + 6,
    ),
    height: Math.min(
      height - top,
      Math.max(...boxes.map((b) => b.top + b.height)) - top + 8,
    ),
    area: 0,
  };
}
/** Evidencia geométrica del punto/coma entre dígitos; no se deduce por el importe esperado. */
export function visibleDecimal(
  gray: Uint8Array,
  width: number,
  height: number,
): { after: number; digits: number } | null {
  const boxes = components(gray, width, height, 220).filter((b) => b.area > 10);
  const maxHeight = Math.max(0, ...boxes.map((b) => b.height));
  if (maxHeight < 12) return null;
  const digits = boxes
    .filter((b) => b.height >= maxHeight * 0.65)
    .sort((a, b) => a.left - b.left);
  if (digits.length < 2) return null;
  const baseline = Math.min(...digits.map((b) => b.top)) + maxHeight * 0.55;
  const marks = boxes.filter(
    (b) =>
      b.height >= maxHeight * 0.08 &&
      b.height < maxHeight * 0.55 &&
      b.width < maxHeight * 0.5 &&
      b.top >= baseline &&
      b.left > digits[0].left + digits[0].width &&
      b.left + b.width < digits.at(-1)!.left,
  );
  if (marks.length !== 1) return null;
  const after = digits.filter((d) => d.left + d.width <= marks[0].left).length;
  return after > 0 && after < digits.length
    ? { after, digits: digits.length }
    : null;
}
