timer-even
==========

Even Hub companion for [timer.gcc3.com](https://timer.gcc3.com/), using the same SDK and embedded-website approach as `../lo-even`.

The phone shows the existing timer website under a settings bar, in the light chrome `../simple-ai/sc-even` uses. The glasses show one time line — `MM:SS`, with centiseconds if asked for, and `HH:MM:SS` from an hour on — wherever and however big the reader has set it. Countdown, count-to-time editing, stopwatch, start, pause, adjustments, reset, and completion mirror the phone. A tap on the glasses is the website's Enter key: it pauses a running timer and starts a stopped one, and silences a finished countdown on both sides; a countdown paused at zero is reset by a tap instead, since there is nothing to start. Double-tap brings up the system's exit confirmation; a timer left running keeps ticking if the reader stays. The press that begins the double-tap is held for 650 ms so it is never taken as a tap.

- [Glasses settings](docs/Glasses.md) — the four settings behind the **Glasses** chip, their defaults, and how each size is drawn and blinked on the lens.
- [Synchronization](docs/Synchronization.md) — how the embedded website and the companion talk: the handshake, the state messages, and the Bluetooth writes behind each frame.
- [Development](docs/Development.md) — requirements, the helper scripts, embedding the local `../timer` dev server, URL overrides for checking one layout, and building and releasing the `.ehpk`.
- [Verification](docs/Test.md) — what `npm test` covers, what the simulator has shown, and what still needs real glasses.
