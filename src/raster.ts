// Draws the time into Gray8 bytes for the image containers: 0 unlit, 255 full
// ink, one byte a pixel, row by row (the format lo-even's map uses).

import type { Layout } from './layout.ts';
import { PIXEL_HEIGHT, blit, pixelWidth } from './pixelfont.ts';

// Monospace, so the digits keep their width as they tick; a proportional face
// would make a right-aligned time jitter every time a 1 turned into a 2.
const FAMILY = 'ui-monospace, Menlo, Consolas, "DejaVu Sans Mono", monospace';
const fontOf = (px: number) => `600 ${px}px ${FAMILY}`;

let measurer: CanvasRenderingContext2D | null = null;
let painter: HTMLCanvasElement | null = null;

/** The width of `text` in the vector face at `font` pixels. */
export function measureText(text: string, font: number): number {
  try {
    measurer ??= document.createElement('canvas').getContext('2d');
    if (measurer) {
      measurer.font = fontOf(font);
      return measurer.measureText(text).width;
    }
  } catch {
    // No DOM or no canvas: estimate from the monospace advance.
  }
  return text.length * font * 0.62;
}

/** Cut one Gray8 buffer the size of the layout's bitmap into its tiles. */
function sliceTiles(gray: Uint8Array, layout: Layout): Uint8Array[] {
  const { width } = layout.rect;
  return layout.tiles.map(tile => {
    const bytes = new Uint8Array(tile.width * tile.height);
    const ox = tile.x - layout.rect.x;
    const oy = tile.y - layout.rect.y;
    for (let row = 0; row < tile.height; row++) {
      bytes.set(gray.subarray((oy + row) * width + ox, (oy + row) * width + ox + tile.width), row * tile.width);
    }
    return bytes;
  });
}

function rasterizePixels(text: string, layout: Layout, invert: boolean): Uint8Array[] {
  const { width, height } = layout.rect;
  const gray = new Uint8Array(width * height);
  if (invert) gray.fill(255, layout.band.top * width, layout.band.bottom * width);
  if (text) {
    const textWidth = pixelWidth(text);
    const x = layout.align === 'left' ? layout.anchor.x
      : layout.align === 'right' ? layout.anchor.x - textWidth : Math.round(layout.anchor.x - textWidth / 2);
    blit(gray, width, height, text, x, layout.anchor.baseline - PIXEL_HEIGHT, invert ? 0 : 255);
  }
  return sliceTiles(gray, layout);
}

function rasterizeVector(text: string, layout: Layout, invert: boolean): Uint8Array[] {
  const { width, height } = layout.rect;
  painter ??= document.createElement('canvas');
  painter.width = width;
  painter.height = height;
  const ctx = painter.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  if (invert) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, layout.band.top, width, layout.band.bottom - layout.band.top);
  }
  if (text) {
    ctx.font = fontOf(layout.font);
    ctx.fillStyle = invert ? '#000' : '#fff';
    ctx.textAlign = layout.align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, layout.anchor.x, layout.anchor.baseline);
  }
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i++) gray[i] = rgba[i * 4];
  return sliceTiles(gray, layout);
}

/**
 * One Gray8 buffer per tile of the layout. An empty text draws a dark frame;
 * `invert` lights the band behind the digits and cuts the text out of it.
 */
export function rasterize(text: string, layout: Layout, invert = false): Uint8Array[] {
  return layout.pixel ? rasterizePixels(text, layout, invert) : rasterizeVector(text, layout, invert);
}
