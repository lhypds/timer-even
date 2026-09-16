// What the reader can change about the glasses line. Stored through the Even
// bridge's storage, which outlives the WebView, and mirrored to localStorage
// for an ordinary browser (the same arrangement as ../simple-ai/sc-even).

// A 3 × 3 grid in reading order: `<horizontal>-<vertical>`, with the middle cell just "center".
export const POSITIONS = [
  "left-top",
  "center-top",
  "right-top",
  "left-center",
  "center",
  "right-center",
  "left-bottom",
  "center-bottom",
  "right-bottom",
] as const;
export const SIZES = ["big", "medium", "small", "tiny"] as const;
export const BLINKS = ["none", "text", "background"] as const;
export type Position = (typeof POSITIONS)[number];
export type Size = (typeof SIZES)[number];
export type Blink = (typeof BLINKS)[number];

export interface GlassesSettings {
  /** Show centiseconds below one hour, as the phone does. */
  milliseconds: boolean;
  position: Position;
  /** Font size of the bitmap the time is drawn as. */
  size: Size;
  /**
   * What a finished countdown does, at the phone's own flash rate: nothing,
   * the digits blink, or their box lights up with the digits cut out of it.
   */
  blink: Blink;
}

// Milliseconds are off by default: Bluetooth carries a frame at a time, so
// centiseconds on the glass advance in visible jumps rather than smoothly.
export const DEFAULT_SETTINGS: GlassesSettings = {
  milliseconds: false,
  position: "left-top",
  size: "tiny",
  blink: "text",
};

const oneOf = <T extends string>(list: readonly T[], value: unknown, fallback: T): T =>
  (list as readonly unknown[]).includes(value) ? (value as T) : fallback;

// Blink used to be a switch; a stored or typed on/off still means something.
const blinkOf = (value: unknown, fallback: Blink): Blink =>
  value === true || value === "1" || value === "on"
    ? "text"
    : value === false || value === "0" || value === "off"
      ? "none"
      : oneOf(BLINKS, value, fallback);

export function parseSettings(raw: unknown): GlassesSettings {
  const s = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    milliseconds: typeof s.milliseconds === "boolean" ? s.milliseconds : DEFAULT_SETTINGS.milliseconds,
    position: oneOf(POSITIONS, s.position, DEFAULT_SETTINGS.position),
    size: oneOf(SIZES, s.size, DEFAULT_SETTINGS.size),
    blink: blinkOf(s.blink, DEFAULT_SETTINGS.blink),
  };
}

/**
 * Overrides from the page URL, such as `?size=tiny&position=center`, so each
 * layout can be checked on glasses without tapping through the modal. They
 * hold for this launch and are stored only if the reader saves the modal.
 */
export function withQueryOverrides(settings: GlassesSettings, search: string): GlassesSettings {
  const params = new URLSearchParams(search);
  const milliseconds = params.get("milliseconds");
  return {
    milliseconds:
      milliseconds === null ? settings.milliseconds : !["0", "false", "off", "no"].includes(milliseconds.toLowerCase()),
    position: oneOf(POSITIONS, params.get("position"), settings.position),
    size: oneOf(SIZES, params.get("size"), settings.size),
    blink: blinkOf(params.get("blink"), settings.blink),
  };
}

/** The host's storage, as the SDK hands it over. */
export interface SettingsStore {
  get(key: string): Promise<string>;
  set(key: string, value: string): Promise<unknown>;
}

const KEY = "glassesSettings";
// The bridge's storage calls can hang on a real device; never let one block.
const STORE_TIMEOUT_MS = 1500;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("storage timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function fromJSON(raw: string): GlassesSettings | null {
  try {
    return parseSettings(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function readLocalSettings(): GlassesSettings {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return fromJSON(raw) ?? { ...DEFAULT_SETTINGS };
  } catch {
    // No window, or storage blocked.
  }
  return { ...DEFAULT_SETTINGS };
}

export async function loadSettings(store: SettingsStore | null): Promise<GlassesSettings> {
  if (store) {
    try {
      const raw = await withTimeout(store.get(KEY), STORE_TIMEOUT_MS);
      const parsed = raw ? fromJSON(raw) : null;
      if (parsed) return parsed;
    } catch {
      // Unavailable, errored or timed out: fall through to the WebView's copy.
    }
  }
  return readLocalSettings();
}

export async function saveSettings(store: SettingsStore | null, settings: GlassesSettings): Promise<void> {
  const raw = JSON.stringify(settings);
  try {
    window.localStorage.setItem(KEY, raw);
  } catch {
    /* nothing else to do */
  }
  if (store) {
    try {
      await withTimeout(store.set(KEY, raw), STORE_TIMEOUT_MS);
    } catch {
      /* the mirror above stands */
    }
  }
}
