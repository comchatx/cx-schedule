# Developing cx-schedule

What a seller reads is `README.md`, which npm and the Plugins page show. This page is for whoever works on the package.

A [pi](https://pi.dev) package for scheduled tasks in a [ComChatX](https://comchatx.com) box, run by [`@amaster.ai/pi-task-scheduler`](https://www.npmjs.com/package/@amaster.ai/pi-task-scheduler). It schedules nothing itself: it carries the scheduler in its own tarball, as pi's `docs/packages.md` asks of a package that uses another, and loads it.

It is one extension and one skill. It was published as `cx-heartbeat` until 2026-10-22, built around `@bacnh85/pi-cron`.

## The extension

- **It carries the scheduler.** `package.json` pins `@amaster.ai/pi-task-scheduler` at one version in `dependencies` and names it in `bundleDependencies`, so `npm pack` puts it, and what it depends on, in the tarball's `node_modules`. The build leaves its import for that copy rather than inlining it. Its `comchatx` field names it in `builds` with `carried: true`: the Plugins page shows it under Plugins it uses, with its warning on the install card, and installs nothing beside this package.
- **It loads the scheduler through the scheduler's own extension entry**, the `./extension` export, the file its own `pi` manifest names, with no change to its code.
- **The tasks live in the seller's tree.** The scheduler keeps its tasks in `<agent directory>/data` unless told otherwise, and a box makes the agent directory afresh at each start. The extension gives it `<cwd>/.pi/cx-schedule/scheduler`.

The scheduler stops its timers at each `session_shutdown`, which pi sends before a reload, so a reload leaves one timer; a task belongs to the session it was made in; a time that falls while pi is not running is skipped.

## The skill

`cx-schedule` tells the model what the scheduler's own words miss in a box: when a task runs (only while the box is awake, which is billed), what happens to a time the box slept through, where a task lands, the clock's zone, and where the tasks are kept.

## Install

```bash
pi install -l npm:@comchatx/cx-schedule
```

Run in `/tenant`; without `-l` the install is gone at the box's next start. On ComChatX, a seller installs it from the Plugins page. Do not install the scheduler beside it.

## Develop

```bash
npm ci
npm run typecheck
npm test
```

`test/witness.test.ts` packs this package, unpacks the tarball as npm would install it, and runs the pinned pi in RPC mode against a model on loopback that calls `scheduler_create`. It checks that a task fires into the session it was made in and not into another, keeps one timer across reloads, and keeps its tasks across a start on a fresh agent directory; without the task directory the same tasks are gone.

The source is `src/extensions/`; `npm run build` bundles it into `dist/extensions/`, the directory the package's `pi` manifest names. Tests live under `test/`.

## Release

A `v*` tag whose name is the version publishes by npm's trusted publishing (`.github/workflows/release.yml`).
