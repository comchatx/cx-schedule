# cx-heartbeat

A [pi](https://pi.dev) package for scheduled jobs in a [ComChatX](https://comchatx.com) box, run by [pi-cron](https://www.npmjs.com/package/@bacnh85/pi-cron) (`@bacnh85/pi-cron`). It does not schedule anything itself and neither bundles nor lists pi-cron: the seller installs pi-cron beside it.

It is one extension and one skill.

## The extension

- **The jobs live in the seller's tree.** pi-cron keeps its jobs in `<agentDir>/cron/jobs.json`. In a box, the agent directory is made afresh at each start, so at the start of the seller's session (pi's RPC mode, `ctx.mode === "rpc"`) the extension links `<agentDir>/cron` to `<cwd>/.pi/cx-heartbeat/cron`, before pi-cron's first write. A real directory already there is moved into the store, unless a name in it is also in the store; then both are left as they are. Other pi processes — `pi install -l` and `pi remove -l` load extensions and start a session too — are not linked.
- **One timer per session.** pi loads extensions afresh at every reload. pi-cron 0.4.0 arms its interval at load and again at `session_start` and has no `session_shutdown` handler, so the interval of the extension a reload replaced keeps ticking: it marks a due job fired, fails to deliver it, and records `delivery failed`. The extension notes each interval created from pi-cron's extension file (`…/pi-cron/extensions/index.ts`) and clears them all at every `session_shutdown`. It depends on that path and on pi-cron re-arming at `session_start`; it comes out once pi-cron clears its own interval.

## The skill

`cx-heartbeat` tells the model what pi-cron's own words miss in a box: when a job runs (only while the box is awake, which is billed), where a fired job lands, why a job needs no pin, the clock's zone, and where the jobs are kept.

## Install

```bash
pi install -l npm:@bacnh85/pi-cron
pi install -l npm:cx-heartbeat
```

Run in `/tenant`; without `-l` the install is gone at the box's next start. On ComChatX, a seller installs both from the Plugins page once they are listed.

## Develop

```bash
npm ci
npm run typecheck
npm test
```

`test/witness.test.ts` installs pi-cron 0.4.0 from npm (without its scripts), runs the pinned pi in RPC mode against a model on loopback, reloads it as the box does, and checks that a due job is delivered, in both load orders, after the first reload and after a package op's reload; without this package the same job fails. It takes about a minute and a half.

The source is `src/extensions/`; `npm run build` bundles it into `dist/extensions/`, the directory the package's `pi` manifest names. Tests live under `test/`.
