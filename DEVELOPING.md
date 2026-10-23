# Developing cx-schedule

What a seller reads is `README.md`, which npm and the Plugins page show. This page is for whoever works on the package.

A [pi](https://pi.dev) package for scheduled tasks in a [ComChatX](https://comchatx.com) box, run by [`@amaster.ai/pi-task-scheduler`](https://www.npmjs.com/package/@amaster.ai/pi-task-scheduler). It schedules nothing itself and carries no copy of the scheduler: it needs it, as one plugin can be a part of another.

It is one skill. It was published as `cx-heartbeat` until 2026-10-22, built around `@bacnh85/pi-cron`, and as 0.2.0 it carried the scheduler in its tarball; from 0.3.0 it names it instead (Jack, 2026-10-22).

## What it needs

- **Its manifest names the scheduler as required.** The `comchatx` field's `builds` lists `@amaster.ai/pi-task-scheduler`: the Plugins page shows it under Plugins it uses, installs it with this package where it is missing, and uses the seller's own copy where there is one, so either order ends with one copy.
- **cx knows it is installed by its tools.** The scheduler ships no skill, so the skill's description says that where no `scheduler_*` tool is there it is not installed, and that the seller installs it in Plugins.
- **The tasks live in the seller's tree.** The scheduler keeps its tasks in `<agent directory>/data` unless its own `pi-scheduler.dataDir` setting says otherwise, and a box makes the agent directory afresh at each start. The ComChatX box sets that option to `/tenant/.pi/pi-scheduler` at each start; its repository's `src/sandbox/steward/task-store.test.ts` runs the pinned pi with the scheduler and a stand-in of this package, installed in either order, and checks that a task fires after a stop and a start on a fresh agent directory, from one copy.

## The skill

`cx-schedule` tells the model what the scheduler's own words miss in a box: when a task runs (only while the box is awake, which is billed), what happens to a time the box slept through, where a task lands, the clock's zone, and where the tasks are kept.

## Install

```bash
pi install -l npm:@comchatx/cx-schedule
pi install -l npm:@amaster.ai/pi-task-scheduler
```

Run in `/tenant`; without `-l` the install is gone at the box's next start. On ComChatX, a seller installs it from the Plugins page, which installs the scheduler with it.

## Develop

```bash
npm ci
npm run typecheck
npm test
```

`test/package.test.ts` loads the package on the pinned pi: one skill, no extension, the manifest naming the scheduler as required, and a tarball holding the skill alone.

## Release

A `v*` tag whose name is the version publishes by npm's trusted publishing (`.github/workflows/release.yml`).
