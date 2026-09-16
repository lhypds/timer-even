export const MAX_SECONDS = 359999;
export const PROTOCOL = "gcc3-timer";
export interface TimerState {
  source: typeof PROTOCOL;
  version: 1;
  type: "state";
  session: string;
  sequence: number;
  mode: "timer" | "stopwatch";
  seconds: number;
  running: boolean;
  sampledAt: number;
  countTo: number | null;
}

export function parseState(data: unknown, session: string): TimerState | null {
  if (!data || typeof data !== "object") return null;
  const s = data as Record<string, unknown>;
  const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
  if (
    s.source !== PROTOCOL ||
    s.version !== 1 ||
    s.type !== "state" ||
    s.session !== session ||
    !Number.isSafeInteger(s.sequence) ||
    (s.sequence as number) < 0 ||
    (s.mode !== "timer" && s.mode !== "stopwatch") ||
    !finite(s.seconds) ||
    s.seconds < 0 ||
    s.seconds > MAX_SECONDS ||
    typeof s.running !== "boolean" ||
    !finite(s.sampledAt) ||
    s.sampledAt <= 0 ||
    !(s.countTo === null || (Number.isInteger(s.countTo) && (s.countTo as number) >= 0 && (s.countTo as number) <= 1439))
  )
    return null;
  return s as unknown as TimerState;
}

export function secondsAt(state: TimerState, now: number): number {
  const elapsed = state.running ? Math.max(0, now - state.sampledAt) / 1000 : 0;
  return Math.min(MAX_SECONDS, Math.max(0, state.seconds + (state.mode === "timer" ? -elapsed : elapsed)));
}

/** A countdown that has run out and is still running: the phone flashes for this. */
export function isFinished(state: TimerState, now: number): boolean {
  return state.mode === "timer" && state.running && state.countTo === null && secondsAt(state, now) <= 0;
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * What the glasses show. Below an hour the phone shows centiseconds and above
 * it the seconds take that place, so `milliseconds` only applies below an hour.
 */
export function timeText(state: TimerState, now: number, milliseconds = false): string {
  if (state.countTo !== null) return `${pad(Math.floor(state.countTo / 60))}:${pad(state.countTo % 60)}`;
  const seconds = secondsAt(state, now);
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const base = `${hours ? `${pad(hours)}:` : ""}${pad(Math.floor(whole / 60) % 60)}:${pad(whole % 60)}`;
  return milliseconds && !hours ? `${base}.${pad(Math.floor((seconds % 1) * 100))}` : base;
}

/** The shape of a time with every digit at its widest, which is what a layout is sized for. */
export const templateOf = (text: string): string => text.replace(/\d/g, "8");
