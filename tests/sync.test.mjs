import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isFinished, parseState, secondsAt, templateOf, timeText } from "../src/protocol.ts";
import { TimerDisplay } from "../src/display.ts";
import { FONT_PX, IMAGE_MAX_HEIGHT, IMAGE_MAX_WIDTH, IMAGE_MIN, MARGIN, layoutFor } from "../src/layout.ts";
import {
  DEFAULT_SETTINGS,
  POSITIONS,
  SCROLL_SECONDS_MAX,
  SCROLL_SECONDS_MIN,
  parseSettings,
  withQueryOverrides,
} from "../src/settings.ts";
import { glassesTransport } from "../src/glasses.ts";
import { PIXEL_HEIGHT, pixelWidth } from "../src/pixelfont.ts";
import { isTap, scrollOf } from "../src/events.ts";
import { Blinker } from "../src/blink.ts";
import { rasterize } from "../src/raster.ts";

const timerRoot = process.env.TIMER_PROJECT_DIR || resolve(import.meta.dirname, "../../timer");
const { sampleClock } = await import(pathToFileURL(resolve(timerRoot, "src/utils/timerClock.ts")));
const { createEvenTimerSender } = await import(pathToFileURL(resolve(timerRoot, "src/utils/evenTimerSync.ts")));
const session = "a-test-session-123456";
const base = {
  source: "gcc3-timer",
  version: 1,
  type: "state",
  session,
  sequence: 0,
  mode: "timer",
  seconds: 300,
  running: true,
  sampledAt: 100000,
  countTo: null,
};

// A stand-in for the canvas: monospace digits at 0.6 em.
const measure = (text, font) => text.length * font * 0.6;
const layout = (size, position = "right-bottom", template = "88:88.88") =>
  layoutFor({ ...DEFAULT_SETTINGS, size, position }, template, measure);
const TINY = layout("tiny");
const BIG = layout("big", "right-bottom", "88:88:88.88");
const frame = (text, l = TINY) => ({ layout: l, text });
// Bytes stand in for pixels: two per tile, derived from the text.
const fakeRasterize = (text, l, invert) =>
  l.tiles.map((_, i) => Uint8Array.of((text ? text.charCodeAt(i) : 0) + (invert ? 128 : 0), i));

test("sender and glasses advance from the same wall-clock anchor after suspension", () => {
  for (const mode of ["timer", "stopwatch"]) {
    const state = { ...base, mode };
    for (const delay of [0, 500, 60000, 400000]) {
      const now = state.sampledAt + delay;
      assert.equal(secondsAt(state, now), sampleClock(state, now).seconds);
    }
  }
  assert.equal(secondsAt(base, 500000), 0);
  assert.equal(secondsAt({ ...base, mode: "stopwatch" }, 1e12), 359999);
});

test("pause, reset, editing midnight, hour display, and completion", () => {
  const paused = { ...base, running: false, seconds: 61 };
  assert.equal(timeText(paused, 900000), "01:01");
  assert.equal(timeText({ ...paused, seconds: 3661 }, 900000), "01:01:01");
  assert.equal(timeText({ ...paused, seconds: 0 }, 900000), "00:00");
  assert.equal(timeText({ ...paused, countTo: 0 }, 900000), "00:00");
  assert.equal(timeText({ ...paused, countTo: 1439 }, 900000), "23:59");
  assert.equal(secondsAt(base, base.sampledAt - 1000), 300);
  assert.equal(isFinished(base, base.sampledAt + 400000), true, "a running countdown at zero");
  assert.equal(isFinished(base, base.sampledAt), false);
  assert.equal(isFinished({ ...base, running: false, seconds: 0 }, 900000), false, "paused at zero is reset, not finished");
  assert.equal(isFinished({ ...base, mode: "stopwatch", seconds: 0 }, base.sampledAt), false);
  assert.equal(isFinished({ ...base, seconds: 0, countTo: 5 }, 900000), false, "editing a clock time is not finishing");
});

test("milliseconds show as centiseconds below an hour, as on the phone", () => {
  const paused = { ...base, running: false, seconds: 61.5 };
  assert.equal(timeText(paused, 900000, true), "01:01.50");
  assert.equal(timeText(paused, 900000, false), "01:01");
  assert.equal(timeText({ ...paused, seconds: 3661.5 }, 900000, true), "01:01:01", "the seconds take the tail above an hour");
  assert.equal(timeText({ ...paused, countTo: 90 }, 900000, true), "01:30");
  assert.equal(timeText({ ...base, seconds: 300 }, base.sampledAt + 250, true), "04:59.75");
  assert.equal(templateOf("04:59.75"), "88:88.88");
  assert.equal(templateOf("--:--"), "--:--");
});

test("reject malformed or incompatible messages", () => {
  assert.deepEqual(parseState(base, session), base);
  for (const bad of [
    null,
    {},
    { ...base, version: 2 },
    { ...base, seconds: NaN },
    { ...base, seconds: Infinity },
    { ...base, seconds: -1 },
    { ...base, seconds: 360000 },
    { ...base, running: "true" },
    { ...base, mode: "unknown" },
    { ...base, sampledAt: NaN },
    { ...base, session: "wrong" },
    { ...base, sequence: -1 },
    { ...base, countTo: 1440 },
  ]) {
    assert.equal(parseState(bad, session), null);
  }
});

test("settings fall back field by field", () => {
  assert.deepEqual(DEFAULT_SETTINGS, {
    milliseconds: false,
    position: "left-top",
    size: "tiny",
    blink: "text",
    scrollSeconds: 15,
  });
  assert.deepEqual(parseSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings("x"), DEFAULT_SETTINGS);
  assert.deepEqual(
    parseSettings({
      size: "huge",
      position: "right-top",
      blink: "yes",
      milliseconds: true,
      scrollSeconds: 61,
    }),
    {
      milliseconds: true,
      position: "right-top",
      size: DEFAULT_SETTINGS.size,
      blink: "text",
      scrollSeconds: DEFAULT_SETTINGS.scrollSeconds,
    },
  );
  assert.deepEqual(
    parseSettings({
      size: "tiny",
      position: "center",
      blink: "background",
      milliseconds: true,
      scrollSeconds: 7,
    }),
    {
      milliseconds: true,
      position: "center",
      size: "tiny",
      blink: "background",
      scrollSeconds: 7,
    },
  );
  assert.equal(parseSettings({ blink: true }).blink, "text", "the old switch, on");
  assert.equal(parseSettings({ blink: false }).blink, "none", "the old switch, off");
  assert.equal(parseSettings({ milliseconds: true }).scrollSeconds, 15, "saved before there was a slider");
});

test("the scroll sensitivity is any whole second from 1 to 60, and nothing else", () => {
  assert.equal(SCROLL_SECONDS_MIN, 1);
  assert.equal(SCROLL_SECONDS_MAX, 60);
  for (const good of [1, 2, 15, 59, 60]) assert.equal(parseSettings({ scrollSeconds: good }).scrollSeconds, good);
  assert.equal(parseSettings({ scrollSeconds: "20" }).scrollSeconds, 20, "a number written as text is still that number");
  for (const bad of [0, -5, 61, 2.5, NaN, "2.5", "", null, true]) {
    assert.equal(parseSettings({ scrollSeconds: bad }).scrollSeconds, 15, `stored ${String(bad)}`);
  }
});

test("URL overrides hold for one launch and ignore junk", () => {
  const saved = {
    milliseconds: false,
    position: "left-top",
    size: "big",
    blink: "none",
    scrollSeconds: 10,
  };
  assert.deepEqual(withQueryOverrides(saved, ""), saved);
  assert.deepEqual(withQueryOverrides(saved, "?size=tiny&position=center&milliseconds=1&blink=background&scrollSeconds=23"), {
    milliseconds: true,
    position: "center",
    size: "tiny",
    blink: "background",
    scrollSeconds: 23,
  });
  assert.equal(withQueryOverrides(saved, "?blink=on").blink, "text");
  assert.deepEqual(withQueryOverrides(saved, "?size=huge&position=nowhere&blink=maybe&scrollSeconds=0"), saved);
  for (const junk of ["", "61", "1.5", "abc"]) assert.deepEqual(withQueryOverrides(saved, `?scrollSeconds=${junk}`), saved);
});

test("sizes step down below the native face and every bitmap fits the display", () => {
  assert.deepEqual(FONT_PX, { big: 84, medium: 40, small: 18, tiny: 7 });
  assert.ok(FONT_PX.small * 0.72 < 15, "small digits come out under the native face, whose digits are 15 px tall");
  assert.equal(FONT_PX.tiny, PIXEL_HEIGHT, "tiny is the 5 × 7 pixel face: 7 px digits against the native face's 15");
  assert.equal(TINY.pixel, true);
  assert.equal(layout("small").pixel, false);
  assert.equal(TINY.rect.width, pixelWidth("88:88.88") + 4);
  assert.equal(TINY.rect.height, IMAGE_MIN, "the smallest an image container may be");
  assert.equal(TINY.anchor.baseline - PIXEL_HEIGHT, Math.round((IMAGE_MIN - PIXEL_HEIGHT) / 2), "the dots sit mid-box");
  assert.deepEqual(
    TINY.band,
    {
      top: TINY.anchor.baseline - PIXEL_HEIGHT - 2,
      bottom: TINY.anchor.baseline + 2,
    },
    "a lit background is the dots plus two pixels of air, not the 20 px box",
  );
  assert.equal(TINY.band.bottom - TINY.band.top, PIXEL_HEIGHT + 4);
  const medium = layout("medium");
  assert.ok(
    medium.band.top >= 0 &&
      medium.band.bottom <= medium.rect.height &&
      medium.band.bottom - medium.band.top >= 0.72 * medium.font,
  );
  assert.equal(TINY.tiles.length, 1);
  assert.equal(TINY.rect.x + TINY.rect.width, 576 - MARGIN);
  assert.equal(TINY.rect.y + TINY.rect.height, 288 - MARGIN);
  assert.equal(TINY.align, "right");

  const topLeft = layout("tiny", "left-top");
  assert.deepEqual([topLeft.rect.x, topLeft.rect.y, topLeft.align], [MARGIN, MARGIN, "left"]);
  const center = layout("medium", "center");
  assert.equal(center.align, "center");
  assert.equal(center.rect.x, Math.round((576 - center.rect.width) / 2));
  assert.equal(center.rect.y, Math.round((288 - center.rect.height) / 2));

  // The edge-centred cells: centred on one axis, at the margin on the other.
  const midX = (l) => Math.round((576 - l.rect.width) / 2);
  const midY = (l) => Math.round((288 - l.rect.height) / 2);
  const topCenter = layout("medium", "center-top");
  assert.deepEqual([topCenter.rect.x, topCenter.rect.y, topCenter.align], [midX(topCenter), MARGIN, "center"]);
  const bottomCenter = layout("medium", "center-bottom");
  assert.deepEqual(
    [bottomCenter.rect.x, bottomCenter.rect.y + bottomCenter.rect.height, bottomCenter.align],
    [midX(bottomCenter), 288 - MARGIN, "center"],
  );
  const leftCenter = layout("medium", "left-center");
  assert.deepEqual([leftCenter.rect.x, leftCenter.rect.y, leftCenter.align], [MARGIN, midY(leftCenter), "left"]);
  const rightCenter = layout("medium", "right-center");
  assert.deepEqual(
    [rightCenter.rect.x + rightCenter.rect.width, rightCenter.rect.y, rightCenter.align],
    [576 - MARGIN, midY(rightCenter), "right"],
  );
  assert.equal(POSITIONS.length, 9, "a full 3 × 3 grid");
  for (const position of POSITIONS) {
    const { rect } = layout("big", position, "88:88:88.88");
    assert.ok(rect.x >= MARGIN && rect.x + rect.width <= 576 - MARGIN, `${position} inside the display horizontally`);
    assert.ok(rect.y >= MARGIN && rect.y + rect.height <= 288 - MARGIN, `${position} inside the display vertically`);
  }
  assert.equal(parseSettings({ position: "center-top" }).position, "center-top");
  assert.notEqual(topLeft.key, TINY.key);
  assert.equal(layout("tiny").key, TINY.key, "same inputs, same key");
  assert.notEqual(layout("tiny", "right-bottom", "88:88").key, TINY.key, "the tail widens the box");

  assert.equal(BIG.font, FONT_PX.big);
  assert.ok(BIG.rect.x >= MARGIN && BIG.rect.x + BIG.rect.width <= 576 - MARGIN);
  assert.equal(BIG.tiles.length, 2, "wider than one container, so tiled");
  let x = BIG.rect.x;
  for (const tile of BIG.tiles) {
    assert.ok(tile.width >= IMAGE_MIN && tile.width <= IMAGE_MAX_WIDTH);
    assert.ok(tile.height >= IMAGE_MIN && tile.height <= IMAGE_MAX_HEIGHT);
    assert.equal(tile.x, x, "tiles abut");
    assert.equal(tile.height, BIG.rect.height);
    x += tile.width;
  }
  assert.equal(x, BIG.rect.x + BIG.rect.width);
  assert.deepEqual(
    BIG.anchor,
    { x: BIG.rect.width - 2, baseline: Math.round((84 + 0.72 * 84) / 2) },
    "right-aligned, digits centred in the box",
  );
});

test("the pixel face draws crisp dots without a canvas", () => {
  assert.equal(pixelWidth("88:88.88"), 8 * 5 - 2 * 4 + 7, "five-wide digits, one-wide colon and point, one-dot gaps");
  assert.equal(pixelWidth("--:--"), 4 * 3 + 1 + 4);
  const [tile] = rasterize("05:00", TINY);
  assert.equal(tile.length, TINY.rect.width * TINY.rect.height);
  const lit = (bytes) => bytes.reduce((n, b) => n + (b === 255 ? 1 : 0), 0);
  assert.ok(lit(tile) > 40 && lit(tile) < 120, "a handful of dots, nothing grey");
  assert.ok(tile.every((b) => b === 0 || b === 255));
  const rows = new Set();
  tile.forEach((b, i) => {
    if (b) rows.add(Math.floor(i / TINY.rect.width));
  });
  assert.equal(rows.size, PIXEL_HEIGHT, "seven rows of dots");
  assert.equal(Math.min(...rows), TINY.anchor.baseline - PIXEL_HEIGHT);
  const [inverted] = rasterize("05:00", TINY, true);
  const bandRows = TINY.band.bottom - TINY.band.top;
  assert.equal(lit(inverted), bandRows * TINY.rect.width - lit(tile), "the same dots, cut out of a lit band");
  assert.ok(rasterize("", TINY)[0].every((b) => b === 0));
  const [blankLit] = rasterize("", TINY, true);
  blankLit.forEach((b, i) => {
    const row = Math.floor(i / TINY.rect.width);
    assert.equal(b, row >= TINY.band.top && row < TINY.band.bottom ? 255 : 0, `row ${row} is lit only inside the band`);
  });
  const leftLayout = layout("tiny", "left-top");
  const left = rasterize("05:00", leftLayout)[0];
  const columns = new Set();
  left.forEach((b, i) => {
    if (b) columns.add(i % leftLayout.rect.width);
  });
  assert.equal(Math.min(...columns), 2, "left-aligned dots start two pixels in");
  assert.equal(Math.max(...columns), 2 + pixelWidth("05:00") - 1);
});

function senderHarness(origin = "https://app.example") {
  let receive;
  const sent = [];
  const parent = { postMessage: (data, target) => sent.push({ data, target }) };
  const host = {
    location: {
      search: `?evenSession=${session}&evenParentOrigin=${encodeURIComponent(origin)}`,
    },
    parent,
    addEventListener: (type, listener) => {
      receive = listener;
    },
    removeEventListener: () => {
      receive = null;
    },
  };
  let snapshot = { ...base };
  const commands = [];
  const sender = createEvenTimerSender(
    host,
    () => snapshot,
    (command) => commands.push(command),
  );
  const request = {
    source: "gcc3-timer-even",
    version: 1,
    type: "request-state",
    session,
  };
  const say = (data, overrides = {}) => receive({ source: parent, origin, data, ...overrides });
  return {
    sender,
    sent,
    parent,
    commands,
    set: (value) => {
      snapshot = value;
    },
    request: (overrides = {}) => say(request, overrides),
    toggle: (overrides = {}) => say({ ...request, type: "toggle" }, overrides),
    adjust: (seconds, overrides = {}) => say({ ...request, type: "adjust", seconds }, overrides),
  };
}

test("handshake restricts source, origin and session; sender is inert until connected", () => {
  const h = senderHarness();
  h.sender.publish();
  h.request({ origin: "https://untrusted.example" });
  h.request({ source: {} });
  h.request({
    data: {
      source: "gcc3-timer-even",
      version: 1,
      type: "request-state",
      session: "wrong",
    },
  });
  assert.equal(h.sent.length, 0);
  h.request();
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].target, "https://app.example");
  assert.ok(parseState(h.sent[0].data, session));
  h.sender.publish();
  assert.equal(h.sent.length, 1, "duplicate ticks are coalesced");
  h.set({ ...base, seconds: 299, sampledAt: 101000 });
  h.sender.publish();
  assert.ok(h.sent[1].data.sequence > h.sent[0].data.sequence, "sequence numbers rise");
  assert.ok(Number.isSafeInteger(h.sent[1].data.sequence) && parseState(h.sent[1].data, session));
  h.set({ ...base, running: false });
  h.sender.publish();
  assert.equal(h.sent[2].data.running, false);
  h.request();
  assert.equal(h.sent.length, 4, "heartbeat answers even when unchanged");
});

test("a toggle from the glasses is honoured only from the connected companion", () => {
  const h = senderHarness();
  h.toggle();
  assert.deepEqual(h.commands, [], "not before the handshake");
  h.request();
  h.toggle({ origin: "https://untrusted.example" });
  h.toggle({ source: {} });
  h.toggle({
    data: {
      source: "gcc3-timer-even",
      version: 1,
      type: "toggle",
      session: "wrong",
    },
  });
  h.toggle({
    data: { source: "gcc3-timer-even", version: 1, type: "pause", session },
  });
  assert.deepEqual(h.commands, [], "nor from anyone else, nor for a command that does not exist");
  h.toggle();
  assert.deepEqual(h.commands, [{ type: "toggle" }]);
  assert.equal(h.sent.length, 1, "a command is not a state request");
});

test("a scroll's adjustment is honoured only from the connected companion, in whole seconds", () => {
  const h = senderHarness();
  h.adjust(60);
  assert.deepEqual(h.commands, [], "not before the handshake");
  h.request();
  h.adjust(60, { origin: "https://untrusted.example" });
  h.adjust(60, { source: {} });
  for (const bad of [undefined, null, "60", 1.5, NaN, Infinity, 2 ** 53]) h.adjust(bad);
  assert.deepEqual(h.commands, [], "nor from anyone else, nor for a time that is not whole seconds");
  h.adjust(60);
  h.adjust(-60);
  assert.deepEqual(h.commands, [
    { type: "adjust", seconds: 60 },
    { type: "adjust", seconds: -60 },
  ]);
  assert.equal(h.sent.length, 1, "a command is not a state request");
});

test("a scroll up is 1, a scroll down is -1, and nothing else is a scroll", () => {
  assert.equal(scrollOf({ textEvent: { containerID: 1, eventType: 1 } }), 1, "scroll to the top");
  assert.equal(scrollOf({ sysEvent: { eventType: 2, eventSource: 1 } }), -1, "scroll to the bottom");
  assert.equal(scrollOf({ sysEvent: { eventSource: 1 } }), 0, "a tap");
  assert.equal(scrollOf({ textEvent: { containerID: 1, eventType: 3 } }), 0, "a double tap");
  assert.equal(scrollOf({}), 0);
});

test("a tap is a click event, or the typeless press the host sends for one", () => {
  assert.equal(isTap({ sysEvent: { eventType: 0, eventSource: 1 } }), true, "CLICK_EVENT spelled out");
  assert.equal(isTap({ sysEvent: { eventSource: 1 } }), true, "the zero dropped by protobuf, source from the right arm");
  assert.equal(isTap({ sysEvent: { eventSource: 3 } }), true, "left arm");
  assert.equal(isTap({ sysEvent: { eventSource: 2 } }), true, "ring");
  assert.equal(isTap({ sysEvent: { eventSource: 0 } }), false, "a dummy source is not a press");
  assert.equal(isTap({ textEvent: { containerID: 1, containerName: "timer" } }), true, "a typeless container event");
  assert.equal(isTap({ textEvent: { containerID: 1, eventType: 3 } }), false, "a double tap is the exit gesture");
  assert.equal(isTap({ sysEvent: { eventType: 4, eventSource: 1 } }), false, "foreground enter");
  assert.equal(isTap({ sysEvent: { eventType: 9, eventSource: 1 } }), false, "a long press");
  assert.equal(isTap({ audioEvent: { audioPcm: new Uint8Array(2) } }), false);
  assert.equal(isTap({}), false);
});

test("a re-created sender continues above its predecessor, so a remount is not old news", async () => {
  const first = senderHarness();
  first.request();
  first.set({ ...base, seconds: 299 });
  first.sender.publish();
  first.set({ ...base, seconds: 298 });
  first.sender.publish();
  const last = first.sent.at(-1).data.sequence;
  await new Promise((r) => setTimeout(r, 5));
  const second = senderHarness();
  second.request();
  assert.ok(second.sent[0].data.sequence > last, "the clock has moved on further than the old sender counted");
});

test("opaque native origins respond only to their parent with the session token", () => {
  const h = senderHarness("null");
  h.request();
  assert.equal(h.sent[0].target, "*");
  assert.equal(h.sent[0].data.session, session);
});

test("slow Bluetooth writes serialize and coalesce to the latest time", async () => {
  const calls = [];
  let release;
  const display = new TimerDisplay({
    create: async (f) => {
      calls.push(f.text);
      await new Promise((r) => {
        release = r;
      });
    },
    update: async (f) => {
      calls.push(f.text);
    },
  });
  const first = display.paint(frame("05:00"));
  await display.paint(frame("04:59"));
  await display.paint(frame("04:58"));
  release();
  await first;
  assert.deepEqual(calls, ["05:00", "04:58"]);
  await display.paint(frame("04:58"));
  assert.equal(calls.length, 2);
});

test("a refused update rebuilds the page; reconnect resends paused text", async () => {
  let creates = 0;
  let updates = 0;
  const display = new TimerDisplay({
    create: async () => {
      creates++;
    },
    update: async () => {
      updates++;
      if (updates === 1) throw Error("Disconnected");
    },
  });
  await display.paint(frame("05:00"));
  await display.paint(frame("04:59"));
  await display.paint(frame("04:59"));
  assert.equal(updates, 1, "a failed write waits before retrying");
  display.reconnect();
  await display.paint(frame("04:59"));
  assert.equal(creates, 2, "the container may be gone after a refused update");
  display.suspend();
  await display.paint(frame("04:58"));
  assert.equal(updates, 1, "nothing is written while suspended");
  display.reconnect();
  await display.paint(frame("04:58"));
  assert.equal(creates, 2);
  assert.equal(updates, 2, "a healthy page is written into, not rebuilt");
});

test("the blink keeps the phone's rate on a quick link and never skips a phase on a slow one", () => {
  const quick = new Blinker(500);
  assert.equal(quick.phase(0, false, true), false, "nothing blinks before the countdown ends");
  assert.equal(quick.phase(1000, true, false), false, "the frame at zero has not landed yet");
  assert.equal(quick.phase(1100, true, true), true, "the first flip comes as soon as it has");
  assert.equal(quick.phase(1500, true, true), true, "held for the period");
  assert.equal(quick.phase(1600, true, true), false);
  assert.equal(quick.phase(2100, true, true), true, "exactly two flips a second, like the phone");
  assert.equal(quick.phase(2600, true, true), false);
  assert.equal(quick.phase(2700, false, true), false, "reset to dark once the countdown is paused");
  assert.equal(quick.phase(2800, true, true), true, "and starts afresh on the next finish");

  // A link where each frame takes 800 ms to land.
  const slow = new Blinker(500);
  const flips = [];
  let landsAt = 0;
  let last = false;
  for (let now = 0; now <= 6000; now += 50) {
    const phase = slow.phase(now, true, now >= landsAt);
    if (phase !== last) {
      flips.push(now);
      landsAt = now + 800;
      last = phase;
    }
  }
  const gaps = flips.slice(1).map((t, i) => t - flips[i]);
  assert.ok(
    gaps.every((g) => g >= 800 && g <= 850),
    `each phase lasts one frame, not two: ${gaps}`,
  );
  // The first flip waits out one period from a cold start, then one every 800 ms up to 6 s.
  assert.deepEqual(flips, [500, 1300, 2100, 2900, 3700, 4500, 5300], "no phase is skipped");
});

test("a display is settled once the frame asked for is the one on the glass", async () => {
  let release;
  const display = new TimerDisplay({
    create: async () => {
      await new Promise((r) => {
        release = r;
      });
    },
    update: async () => {},
  });
  assert.equal(display.settled(), false, "nothing asked for yet");
  const first = display.paint(frame("05:00"));
  assert.equal(display.settled(), false, "still writing");
  release();
  await first;
  assert.equal(display.settled(), true);
  await display.paint(frame("04:59"));
  assert.equal(display.settled(), true);
  display.reconnect();
  assert.equal(display.settled(), false, "a reconnect owes the glass its frame again");
});

test("a changed layout rebuilds the page once; blank and inverted frames are writes", async () => {
  const calls = [];
  const display = new TimerDisplay({
    create: async (f) => {
      calls.push(["create", f.layout.font, f.text]);
    },
    update: async (f) => {
      calls.push(["update", f.layout.font, f.text, f.invert ?? false]);
    },
  });
  await display.paint(frame("05:00"));
  await display.paint(frame("05:00", BIG));
  await display.paint(frame("04:59", BIG));
  await display.paint(frame("", BIG));
  await display.paint(frame("04:59", BIG));
  await display.paint({ ...frame("04:59", BIG), invert: true });
  await display.paint({ ...frame("04:59", BIG), invert: true });
  await display.paint(frame("04:59", BIG));
  await display.paint(frame("04:59"));
  assert.deepEqual(calls, [
    ["create", 7, "05:00"],
    ["create", 84, "05:00"],
    ["update", 84, "04:59", false],
    ["update", 84, "", false],
    ["update", 84, "04:59", false],
    ["update", 84, "04:59", true],
    ["update", 84, "04:59", false],
    ["create", 7, "04:59"],
  ]);
});

const textBox = (t) => [t.containerID, t.isEventCapture, t.content, t.xPosition, t.yPosition, t.width, t.height, t.borderWidth];

function fakeBridge(startResults = [0]) {
  const calls = [];
  let refuse = false;
  return {
    calls,
    refuseImages(value) {
      refuse = value;
    },
    async createStartUpPageContainer(page) {
      calls.push(["start", page.containerTotalNum, page.textObject.map(textBox)]);
      return startResults.length > 1 ? startResults.shift() : startResults[0];
    },
    async rebuildPageContainer(page) {
      calls.push([
        "rebuild",
        page.containerTotalNum,
        page.textObject.map(textBox),
        page.imageObject.map((i) => [i.containerID, i.width, i.height, i.zOrderIndex]),
      ]);
      return true;
    },
    async updateImageRawData(image) {
      calls.push(["image", image.containerID, Array.from(image.imageData)]);
      return refuse ? "sendFailed" : "success";
    },
  };
}

// One space across the whole display: nothing to draw, and nothing that could
// overflow the box and grow a scroll bar.
const CAPTURE = [[1, 1, " ", 0, 0, 576, 288, 0]];

test("a refused start-up page is retried; every build after it is a rebuild", async () => {
  const bridge = fakeBridge([3, 0]); // outOfMemory, then success
  const transport = glassesTransport(bridge, fakeRasterize);
  await assert.rejects(transport.create(frame("05:00")), /Glasses startup: 3/);
  await transport.create(frame("05:00"));
  await transport.update(frame("14:59"));
  await transport.create(frame("04:58", BIG));
  assert.deepEqual(bridge.calls, [
    ["start", 1, CAPTURE],
    ["start", 1, CAPTURE],
    ["rebuild", 2, CAPTURE, [[2, TINY.rect.width, TINY.rect.height, 1]]],
    ["image", 2, [48, 0]],
    ["image", 2, [49, 0]],
    ["rebuild", 3, CAPTURE, BIG.tiles.map((t, i) => [2 + i, t.width, t.height, 1 + i])],
    ["image", 2, [48, 0]],
    ["image", 3, [52, 1]],
  ]);
});

test("a start-up page the host already has is rebuilt rather than retried", async () => {
  const bridge = fakeBridge([1]); // invalid: the page exists (hot reload, kept WebView)
  const transport = glassesTransport(bridge, fakeRasterize);
  await transport.create(frame("05:00"));
  assert.deepEqual(
    bridge.calls.map((c) => c[0]),
    ["start", "rebuild", "image"],
  );
});

test("ticks send only the tiles whose bytes moved; a refused tile is offered again", async () => {
  const bridge = fakeBridge();
  const transport = glassesTransport(bridge, fakeRasterize);
  await transport.create(frame("05:00", BIG));
  bridge.calls.length = 0;
  await transport.update(frame("05:00", BIG));
  assert.deepEqual(bridge.calls, [], "unchanged tiles are not resent");
  await transport.update(frame("15:00", BIG));
  assert.deepEqual(bridge.calls, [["image", 2, [49, 0]]], "only the tile whose bytes moved");
  bridge.calls.length = 0;
  await transport.update(frame("", BIG));
  assert.deepEqual(
    bridge.calls.map((c) => c[2]),
    [
      [0, 0],
      [0, 1],
    ],
    "a blank frame darkens every tile",
  );
  bridge.calls.length = 0;
  bridge.refuseImages(true);
  await assert.rejects(transport.update(frame("25:00", BIG)), /image refused/);
  bridge.refuseImages(false);
  bridge.calls.length = 0;
  await transport.update(frame("25:00", BIG));
  assert.deepEqual(
    bridge.calls.map((c) => c[1]),
    [2, 3],
    "after a refusal every tile is sent again",
  );
  bridge.calls.length = 0;
  await transport.update({ ...frame("25:00", BIG), invert: true });
  assert.deepEqual(
    bridge.calls.map((c) => c[2]),
    [
      [50 + 128, 0],
      [53 + 128, 1],
    ],
    "an inverted frame is new bytes for every tile",
  );
});
