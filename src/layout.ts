// Where the time goes on the 576 × 288 display and how big it is drawn.
//
// Native glasses text has one fixed face, with digits about 15 px tall, so
// every size here is a bitmap drawn on the phone and sent to image containers,
// the way lo-even draws its map. The container limits come from
// ../lo-even/docs/Screen.md.

import { PIXEL_HEIGHT, pixelWidth } from "./pixelfont.ts";
import type { GlassesSettings, Position, Size } from "./settings.ts";

export const SCREEN_WIDTH = 576;
export const SCREEN_HEIGHT = 288;
export const MARGIN = 8;
// One image container is 20–288 wide and 20–144 tall; a wider picture is tiled.
export const IMAGE_MAX_WIDTH = 288;
export const IMAGE_MAX_HEIGHT = 144;
export const IMAGE_MIN = 20;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export type Align = "left" | "right" | "center";
export interface Layout {
  key: string;
  /** The bitmap on the display. */
  rect: Rect;
  /** The image containers it is cut into. */
  tiles: Rect[];
  /** Font pixels for the vector face; dot rows for the pixel face. */
  font: number;
  /** Drawn with the 5 × 7 pixel face rather than the vector face. */
  pixel: boolean;
  align: Align;
  /** Where the text is drawn inside the bitmap: the x the alignment hangs from, and the baseline. */
  anchor: { x: number; baseline: number };
  /**
   * The rows a lit background covers, `top` inclusive to `bottom` exclusive:
   * the digits plus a little air, not the whole box. The firmware's shortest
   * image container is 20 px, which would be three times the pixel face.
   */
  band: { top: number; bottom: number };
}

// Digits in the vector face are drawn in a monospace font at about 0.6 em wide
// and 0.72 em tall, so the widest string (88:88:88.88) still fits the display
// at big; small comes out a little under the native face's 15 px digits. Tiny
// is the pixel face: 7 px digits.
export const FONT_PX: Record<Size, number> = {
  big: 84,
  medium: 40,
  small: 18,
  tiny: PIXEL_HEIGHT,
};
const DIGIT_HEIGHT = 0.72;

export function alignFor(position: Position): Align {
  return position === "center" ? "center" : position.startsWith("left") ? "left" : "right";
}

export function place(width: number, height: number, position: Position): Rect {
  const x =
    position === "center"
      ? Math.round((SCREEN_WIDTH - width) / 2)
      : position.startsWith("left")
        ? MARGIN
        : SCREEN_WIDTH - MARGIN - width;
  const y =
    position === "center"
      ? Math.round((SCREEN_HEIGHT - height) / 2)
      : position.endsWith("top")
        ? MARGIN
        : SCREEN_HEIGHT - MARGIN - height;
  return { x, y, width, height };
}

function split(total: number, max: number): number[] {
  const count = Math.ceil(total / max);
  const base = Math.floor(total / count);
  return Array.from({ length: count }, (_, i) => base + (i < total - base * count ? 1 : 0));
}

/** The image containers one bitmap is cut into, left to right then top to bottom. */
export function tilesFor(rect: Rect): Rect[] {
  const tiles: Rect[] = [];
  let y = rect.y;
  for (const height of split(rect.height, IMAGE_MAX_HEIGHT)) {
    let x = rect.x;
    for (const width of split(rect.width, IMAGE_MAX_WIDTH)) {
      tiles.push({ x, y, width, height });
      x += width;
    }
    y += height;
  }
  return tiles;
}

/**
 * The layout for one shape of text. `template` is the widest string the
 * current format can produce (every digit an 8), so the box never has to move
 * as the digits change; `measure` is the pixel width of a string in the vector
 * face at a font size, supplied by the rasterizer.
 *
 * The bitmap is just the box around the time. A finished countdown in *blink
 * background* mode lights this box and no more: a frame the size of the whole
 * lens is four full image containers, more than the link can flip twice a
 * second, and the box is one small one.
 */
export function layoutFor(settings: GlassesSettings, template: string, measure: (text: string, font: number) => number): Layout {
  const align = alignFor(settings.position);
  const pixel = settings.size === "tiny";
  const font = FONT_PX[settings.size];
  const textWidth = pixel ? pixelWidth(template) : Math.ceil(measure(template, font));
  const width = Math.min(SCREEN_WIDTH - 2 * MARGIN, Math.max(IMAGE_MIN, textWidth + 4));
  const height = Math.max(IMAGE_MIN, Math.min(IMAGE_MAX_HEIGHT, font));
  const rect = place(width, height, settings.position);
  // Digits stand on the baseline; centre their band in the box.
  const digitHeight = pixel ? font : DIGIT_HEIGHT * font;
  const baseline = Math.round((height + digitHeight) / 2);
  const anchor = {
    x: align === "left" ? 2 : align === "right" ? width - 2 : width / 2,
    baseline,
  };
  const air = Math.max(2, Math.round(digitHeight * 0.15));
  const band = {
    top: Math.max(0, Math.round(baseline - digitHeight) - air),
    bottom: Math.min(height, baseline + air),
  };
  return {
    key: `${pixel ? "px" : ""}${font}:${rect.x},${rect.y},${rect.width},${rect.height}:${align}`,
    rect,
    tiles: tilesFor(rect),
    font,
    pixel,
    align,
    anchor,
    band,
  };
}
