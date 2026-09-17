import { DeviceConnectType, OsEventTypeList, waitForEvenAppBridge } from "@evenrealities/even_hub_sdk";
import { Blinker } from "./blink.ts";
import { TimerDisplay } from "./display.ts";
import { eventTypeOf, isTap, scrollOf } from "./events.ts";
import { glassesTransport } from "./glasses.ts";
import { layoutFor, type Layout } from "./layout.ts";
import { isFinished, parseState, templateOf, timeText, type TimerState } from "./protocol.ts";
import { measureText } from "./raster.ts";
import {
  loadSettings,
  readLocalSettings,
  saveSettings,
  withQueryOverrides,
  type GlassesSettings,
  type SettingsStore,
} from "./settings.ts";
import { createUI } from "./ui.ts";
import "./style.css";

// Fast enough to offer every centisecond; the glasses coalesce to whatever
// Bluetooth can carry (see display.ts).
const TICK_MS = 50;
const HEARTBEAT_MS = 2000;
// A missing heartbeat may mean the website navigated away. Do not silently
// present an unverified running time indefinitely.
const STALE_MS = 10000;
// The phone flips its background at this rate when a countdown ends; the
// glasses follow it as closely as the link allows (see blink.ts).
const BLINK_MS = 500;
const blinker = new Blinker(BLINK_MS);
// How long a tap waits before it is taken as a tap. The host reports the first
// press of a double tap as a press of its own, and the double tap is the exit
// gesture: acting on the tap at once would start or pause the timer on the way
// out. lo-even's number, long enough for the second press to come over BLE.
const DOUBLE_TAP_MS = 650;

const timerURL = new URL(import.meta.env.VITE_TIMER_URL || "https://timer.gcc3.com/");
if (!["http:", "https:"].includes(timerURL.protocol)) throw new Error("Timer URL must use HTTP(S)");
// getRandomValues also works on HTTP LAN URLs used by a phone in development.
const session = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
timerURL.searchParams.set("evenSession", session);
timerURL.searchParams.set("evenParentOrigin", location.origin);

let settings: GlassesSettings = withQueryOverrides(readLocalSettings(), location.search);
let settingsEdited = false;
let store: SettingsStore | null = null;
let state: TimerState | null = null;
let receivedAt = 0;
let sequence = -1;
let display: TimerDisplay | null = null;
let closed = false;
// A tap on the glasses has silenced the finished countdown this side, while
// the website is asked to pause; cleared once the countdown is no longer finished.
let acknowledged = false;
let tapTimer = 0;

const ui = createUI(document.querySelector<HTMLElement>("#app")!, {
  settings,
  onReconnect() {
    display?.reconnect();
    if (!state || Date.now() - receivedAt > STALE_MS) {
      state = null;
      frame.src = timerURL.href;
    }
    requestState();
    render();
  },
  async onSave(next) {
    settings = next;
    settingsEdited = true;
    render();
    await saveSettings(store, next);
  },
});
const frame = ui.frame;

// What the companion says to the website: the handshake that asks for state,
// the toggle a tap on the glasses turns into, and the adjustment scrolling does.
// All carry the session token the website was opened with, and only its origin
// may receive them.
type Message = { type: "request-state" } | { type: "toggle" } | { type: "adjust"; seconds: number };
function send(message: Message) {
  frame.contentWindow?.postMessage({ source: "gcc3-timer-even", version: 1, ...message, session }, timerURL.origin);
}
const requestState = () => send({ type: "request-state" });

/**
 * A tap, once it is clear it was not the first half of a double tap: the
 * website's Enter key — pause while running, otherwise start. A finished
 * countdown goes quiet here at once, before the pause comes back as state.
 */
function tapped() {
  if (!state || Date.now() - receivedAt > STALE_MS) return;
  if (isFinished(state, Date.now())) acknowledged = true;
  send({ type: "toggle" });
  render();
}

/**
 * A step of scrolling: up adds time and down takes it away, running or
 * stopped, each step by the scroll sensitivity's seconds, so the more the
 * scrolling the more the change. The website applies it like its adjust
 * buttons, which stop at zero, and the new time comes back as state, so
 * nothing is drawn here.
 */
function scrolled(direction: 1 | -1) {
  if (!state || Date.now() - receivedAt > STALE_MS) return;
  send({ type: "adjust", seconds: direction * settings.scrollSeconds });
}

function armTap() {
  window.clearTimeout(tapTimer);
  tapTimer = window.setTimeout(() => {
    tapTimer = 0;
    tapped();
  }, DOUBLE_TAP_MS);
}

function disarmTap() {
  window.clearTimeout(tapTimer);
  tapTimer = 0;
}

// The layout is sized for the widest string of the current shape, so it only
// changes when the settings do or the text grows an hour or loses its tail.
let layout: Layout | null = null;
let layoutKey = "";
function layoutOf(text: string): Layout {
  const template = templateOf(text);
  const key = `${template}|${JSON.stringify(settings)}`;
  if (!layout || layoutKey !== key) {
    layout = layoutFor(settings, template, measureText);
    layoutKey = key;
  }
  return layout;
}

function render() {
  if (closed || !display) return;
  const now = Date.now();
  const live = state && now - receivedAt <= STALE_MS ? state : null;
  const text = live ? timeText(live, now, settings.milliseconds) : "--:--";
  // A finished countdown flashes at the phone's own rate: the digits go out,
  // or the box behind them lights up with the digits cut out of it. A tap on
  // the glasses silences it (see `tapped`); the next finish blinks again.
  if (!live || !isFinished(live, now)) acknowledged = false;
  const finished = live !== null && !acknowledged && isFinished(live, now);
  const flash = blinker.phase(now, finished && settings.blink !== "none", display.settled());
  void display.paint({
    layout: layoutOf(text),
    text: flash && settings.blink === "text" ? "" : text,
    invert: flash && settings.blink === "background",
  });
}

window.addEventListener("message", (event) => {
  if (event.source !== frame.contentWindow || event.origin !== timerURL.origin) return;
  const next = parseState(event.data, session);
  if (!next || Math.abs(Date.now() - next.sampledAt) > STALE_MS) return;
  // Old news is dropped — unless nothing current has arrived for a while, in
  // which case a sender that restarted its count is better than no sender.
  if (next.sequence <= sequence && Date.now() - receivedAt <= STALE_MS) return;
  sequence = next.sequence;
  state = next;
  receivedAt = Date.now();
  render();
});

frame.addEventListener("load", () => {
  // A child reload restarts its sequence; the new page must answer the handshake.
  sequence = -1;
  state = null;
  requestState();
  render();
});
frame.src = timerURL.href;

const tick = window.setInterval(render, TICK_MS);
const heartbeat = window.setInterval(requestState, HEARTBEAT_MS);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    requestState();
    display?.reconnect();
    render();
  }
});
window.addEventListener("pageshow", () => {
  requestState();
  render();
});

async function connectGlasses() {
  try {
    const bridge = await waitForEvenAppBridge();
    store = {
      get: (key) => bridge.getLocalStorage(key),
      set: (key, value) => bridge.setLocalStorage(key, value),
    };
    // The host's copy outlives the WebView, so it wins over the local mirror —
    // unless the reader has already changed something this launch.
    void loadSettings(store).then((loaded) => {
      if (settingsEdited) return;
      settings = withQueryOverrides(loaded, location.search);
      ui.setSettings(settings);
      render();
    });
    display = new TimerDisplay(glassesTransport(bridge));
    const unsubscribeDevice = bridge.onDeviceStatusChanged((device) => {
      if (device.connectType === DeviceConnectType.Connected) {
        display?.reconnect();
        requestState();
      }
      // Device status may also belong to a ring. A failed display write is the
      // authoritative signal that the glasses cannot be reached.
    });
    const unsubscribeEvents = bridge.onEvenHubEvent((event) => {
      const type = eventTypeOf(event);
      const scroll = scrollOf(event);
      if (isTap(event)) {
        armTap();
      } else if (scroll) {
        scrolled(scroll);
      } else if (type === OsEventTypeList.FOREGROUND_ENTER_EVENT) {
        display?.reconnect();
        requestState();
        render();
      } else if (type === OsEventTypeList.FOREGROUND_EXIT_EVENT) {
        display?.suspend();
      } else if (type === OsEventTypeList.DOUBLE_CLICK_EVENT) {
        // Standard Even Hub exit gesture: the host puts up its confirmation and
        // the reader decides. Nothing is torn down yet — a reader who says no
        // keeps a ticking timer, and one who says yes comes back as a system
        // exit. The press that began this double tap is not a tap.
        disarmTap();
        void bridge.shutDownPageContainer(1).catch(console.error);
      } else if (type === OsEventTypeList.SYSTEM_EXIT_EVENT || type === OsEventTypeList.ABNORMAL_EXIT_EVENT) {
        // The reader confirmed the exit, or the host is taking the app down.
        // Phone timer continues independently; the page container goes now.
        close();
        void bridge.shutDownPageContainer(0).catch(console.error);
      }
    });
    function close() {
      closed = true;
      disarmTap();
      display?.suspend();
      window.clearInterval(tick);
      window.clearInterval(heartbeat);
      unsubscribeDevice();
      unsubscribeEvents();
    }
    render();
  } catch (error) {
    // An ordinary browser: the website in the frame still works on its own.
    console.info("Even bridge unavailable", error);
  }
}

void connectGlasses();
