Development
===========

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

To check one layout without tapping through the modal, add query overrides to the URL, for example `?size=tiny&position=center&milliseconds=0&blink=background&scrollSeconds=20`. They hold for that launch and are stored only if you save the modal.

Build and release
-----------------

```sh
./login.sh
./package.sh
```

This produces `com.gcc3.timer-0.1.0.ehpk` for Even Hub. `package.sh` refuses to run while `VITE_TIMER_URL` points at a local server, and requires `app.json` and `package.json` to carry the same version. Bump both at once with `npm version patch` (or `minor`, `major`): it updates `package.json` and `package-lock.json`, copies the version into `app.json`, and commits the three files as `x.y.z` with a `vx.y.z` tag. `npm test` also exercises the integration files in sibling `../timer`; use `TIMER_PROJECT_DIR` to point to another checkout.

1. Build the changed `../timer` and deploy its `dist/` to the **existing** timer.gcc3.com host.
2. Keep embedding permitted: no `X-Frame-Options: DENY/SAMEORIGIN`, and any CSP `frame-ancestors` must allow the Even host. The current website sends neither header.
3. Package this project with its default production URL, then upload the `.ehpk` through Even Hub under `com.gcc3.timer`.
4. On connected glasses, verify set/start/pause/reset in each mode, completion and blinking, each size and position, disconnect/reconnect, and foreground/background behavior.

The old deployed timer cannot send state until step 1 is complete. This repository does not change DNS or deploy either project automatically.
