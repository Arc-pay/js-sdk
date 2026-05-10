import type { StyleSubset } from "./postmessage";

// Spec calls out position:fixed, transform, pointer-events:none as forbidden.
// We extend to cover the full clickjacking attack surface: any positioning
// (fixed/absolute/sticky), transform, all pointer-events values, z-index, and
// inset properties (top/left/right/bottom/inset). The legitimate use cases
// for these in a 1-line input field are zero, so blanket drop.
const FORBIDDEN_PROPERTIES = new Set([
  "position",
  "transform",
  "pointer-events",
  "z-index",
  "top",
  "left",
  "right",
  "bottom",
  "inset",
]);

const sanitizeBlock = (block: Record<string, string>): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(block)) {
    const normalizedKey = key.toLowerCase();
    if (FORBIDDEN_PROPERTIES.has(normalizedKey)) {
      // Defense against position/transform-based clickjacking. Silently drop.
      continue;
    }
    out[key] = value;
  }
  return out;
};

export const sanitizeStyle = (style: StyleSubset): StyleSubset => {
  const result: StyleSubset = { base: sanitizeBlock(style.base) };
  if (style.invalid !== undefined) result.invalid = sanitizeBlock(style.invalid);
  if (style.focus !== undefined) result.focus = sanitizeBlock(style.focus);
  return result;
};
