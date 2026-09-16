timer-even
==========

Even Hub companion for [timer.gcc3.com](https://timer.gcc3.com/), using the same SDK and embedded-website approach as `../lo-even`.

The phone shows the existing timer website under a settings bar, in the light chrome `../simple-ai/sc-even` uses. The glasses show one time line — `MM:SS`, with centiseconds if asked for, and `HH:MM:SS` from an hour on — wherever and however big the reader has set it. Countdown, count-to-time editing, stopwatch, start, pause, adjustments, reset, and completion mirror the phone. A tap on the glasses is the website's Enter key: it pauses a running timer and starts a stopped one, and silences a finished countdown on both sides; a countdown paused at zero is reset by a tap instead, since there is nothing to start. Double-tap exits the glasses app; the press that begins it is held for 650 ms so it is never taken as a tap.

Glasses settings
----------------

The **Glasses** chip in the bar opens a modal with four settings, saved through the Even bridge's storage (mirrored to the WebView's localStorage for an ordinary browser):

| Setting           | Values                                                 | Default                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Show milliseconds | on / off                                               | off — Bluetooth carries one frame at a time, so centiseconds advance in visible jumps; on, they show below an hour as on the phone, and above an hour the seconds take that place                                                                                                                                                                                                                                |
| Position          | top left, top right, bottom left, bottom right, center | top left                                                                                                                                                                                                                                                                                                                                                                                                         |
| Size              | big, medium, small, tiny                               | tiny                                                                                                                                                                                                                                                                                                                                                                                                             |
| When time ends    | none, blink text, blink background                     | blink text — until the countdown is paused, reset or tapped away; _blink background_ lights a band just behind the digits (two pixels of air above and below at tiny) with the digits cut out of it. Paced by the link: a phase flips once the previous one has reached the glass and stood for 500 ms, so a quick link blinks at the phone's own rate and a slow one as fast as it can, without skipping phases |

Native glasses text has one fixed face, with digits about 15 px tall, so every size is a bitmap sent as Gray8 bytes to image containers, the way lo-even draws its map. Big, medium and small are drawn in a monospace vector face at 84, 40 and 18 px. Tiny is a hand-made 5 × 7 pixel face at one dot per pixel (`src/pixelfont.ts`): 7 px digits, half the native face, and crisp where a vector face that small would blur into grey. A bitmap wider than one container (288 px) is tiled across two, so the widest time still fits at big. Every layout is sized for the widest string of the current shape, so the box moves only when the settings change or the time gains an hour. _Blink background_ lights only the band behind the digits inside that box rather than the whole lens: a full-screen frame is four image containers of 288 × 144, more than the link can flip twice a second, and the firmware's shortest container (20 px) would stand three times taller than the pixel face.

The bar carries no status text. In an ordinary browser the website in the frame simply works on its own; on glasses, what is on the lens is the status.

Development
-----------

Requires Node 22.18+, npm, and the `evenhub` CLI / simulator for QR codes, simulation and packaging.

```sh
./setup.sh
./develop.sh
./simulate.sh
```

The helper scripts mirror `../lo-even`:

- `setup.sh` — install dependencies and create `.env` from `.env.example`.
- `develop.sh` — Vite on the LAN plus an Even Hub QR code.
- `simulate.sh` — open the simulator against port 5173 (run `develop.sh` first).
- `login.sh` — authenticate the Even Hub CLI.
- `package.sh` — run the tests, build, and produce the versioned `.ehpk`.

Production embeds `https://timer.gcc3.com/`. In development, `develop.sh` embeds the `../timer` dev server on this machine instead: run its normal `pnpm dev` command (port 3300) first, then `./develop.sh` here. It rewrites `localhost` to your LAN address so a phone can reach both servers, and prints the address it will embed. Set `VITE_TIMER_URL` to embed something else; embedding the deployed site only makes sense once the changed `../timer` is deployed there, since the old site cannot talk to the glasses and they show `--:--`. Scan the QR code with Even Hub's development flow on the phone; a packaged app's network whitelist is production-only.

To check one layout without tapping through the modal, add query overrides to the URL, for example `?size=tiny&position=center&milliseconds=0&blink=background`. They hold for that launch and are stored only if you save the modal.

Build and release
-----------------

```sh
./login.sh
./package.sh
```

This produces `com.gcc3.timer-0.1.0.ehpk` for Even Hub. `package.sh` refuses to run while `VITE_TIMER_URL` points at a local server, and requires `app.json` and `package.json` to carry the same version. `npm test` also exercises the integration files in sibling `../timer`; use `TIMER_PROJECT_DIR` to point to another checkout.

1. Build the changed `../timer` and deploy its `dist/` to the **existing** timer.gcc3.com host.
2. Keep embedding permitted: no `X-Frame-Options: DENY/SAMEORIGIN`, and any CSP `frame-ancestors` must allow the Even host. The current website sends neither header.
3. Package this project with its default production URL, then upload the `.ehpk` through Even Hub under `com.gcc3.timer`.
4. On connected glasses, verify set/start/pause/reset in each mode, completion and blinking, each size and position, disconnect/reconnect, and foreground/background behavior.

The old deployed timer cannot send state until step 1 is complete. This repository does not change DNS or deploy either project automatically.

Synchronization
---------------

The web timer remains authoritative. `timer-even` loads it in an iframe with a random `evenSession` and `evenParentOrigin`, then requests version-1 state messages. The timer sends only after a matching handshake from its actual parent. Standalone visits do not broadcast. The parent accepts messages only from its own iframe and the configured timer origin, validates every field, and rejects old sequence numbers. Sequence numbers start at the sender's clock, so a sender re-created without a page load (a remounted component, a hot reload) continues above its predecessor; and a parent that has heard nothing current for ten seconds accepts a restarted count rather than staying blank. The one message the companion sends besides the handshake is `toggle`, which a tap on the glasses turns into; the timer honours it only from the connected companion and treats it like its Enter key (pause, start, or reset a countdown paused at zero).

Snapshots carry `mode`, `seconds`, `running`, `sampledAt`, and the clock time being edited (`countTo`, otherwise null). The companion advances the snapshot using the same wall-clock formula between messages, which is also where the centiseconds come from: the website sends a message once a second, not once a centisecond. A two-second heartbeat repairs missed updates; after ten seconds without a valid state the glasses show `--:--`.

Bluetooth writes are serialized, coalesced to the latest frame, and retried after two seconds on failure. A tick re-sends only the tiles whose bytes changed. A changed layout rebuilds the page through `rebuildPageContainer`, and so does a refused write, since the containers may be gone (glasses that rebooted, a host that dropped the page). The SDK allows only one text-only start-up page per launch — here an invisible one-space text container that captures events — so every bitmap page is a rebuild. A start-up call the host answers with `invalid` is taken as a page that already exists (a hot reload, or a WebView reloaded under a page the host kept) and rebuilt. Every container on a page carries its own z-order; the SDK refuses duplicates. Reconnect resends even a paused time.

This links the timer **inside the Even app** to that phone's connected glasses. It does not synchronize a separate browser or another device over the internet. The app must remain running in Even Hub; a fully suspended or terminated host cannot transmit Bluetooth updates. On resume, time is recalculated and synchronized.

Verification
------------

`npm test` covers elapsed-time projection, suspension catch-up, completion and bounds, paused/reset times, midnight editing, centisecond text, the finished-countdown test behind blinking, protocol validation, settings parsing and URL overrides, the size ladder and bitmap tiling within the firmware's container limits, parent-origin/session checks, frame coalescing, retry, rebuild after a refused write or a changed layout, blank and inverted frames, reconnect, and the start-up/rebuild/tile order against a fake bridge. The pixel face is rasterized without a canvas, so its dots are checked directly. The Even Hub simulator rendered the small, big and tiny bitmaps at their positions. Physical-glasses behavior still needs the release check above.
