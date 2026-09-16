// A 5 × 7 pixel face for the tiny size. At one pixel per dot it is crisp on the
// glass, where a vector face this small would blur into grey. Only what a time
// can contain: digits, the colon, the point, and the dash of `--:--`.

const ROWS = 7;
const GAP = 1;

const GLYPHS: Record<string, string[]> = {
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  ':': ['.', '.', '#', '.', '.', '#', '.'],
  '.': ['.', '.', '.', '.', '.', '.', '#'],
  '-': ['...', '...', '...', '###', '...', '...', '...'],
  ' ': ['..', '..', '..', '..', '..', '..', '..']
};
// Anything else draws as a box, so a missing glyph is visible rather than silent.
const FALLBACK = ['#####', '#...#', '#...#', '#...#', '#...#', '#...#', '#####'];

export const PIXEL_HEIGHT = ROWS;
const glyph = (ch: string) => GLYPHS[ch] ?? FALLBACK;

export function pixelWidth(text: string): number {
  let width = 0;
  for (const ch of text) width += glyph(ch)[0].length + GAP;
  return Math.max(0, width - GAP);
}

/** Draw `text` into a Gray8 buffer `width` × `height`, its top-left dot at (x, top). */
export function blit(buffer: Uint8Array, width: number, height: number, text: string, x: number, top: number, ink: number): void {
  let cursor = x;
  for (const ch of text) {
    const rows = glyph(ch);
    for (let r = 0; r < ROWS; r++) {
      const y = top + r;
      if (y < 0 || y >= height) continue;
      const row = rows[r];
      for (let c = 0; c < row.length; c++) {
        const px = cursor + c;
        if (row[c] === '#' && px >= 0 && px < width) buffer[y * width + px] = ink;
      }
    }
    cursor += rows[0].length + GAP;
  }
}
