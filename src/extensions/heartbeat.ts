import { lstatSync, mkdirSync, readdirSync, readlinkSync, renameSync, rmdirSync, symlinkSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

/** Where the jobs live in the seller's tree, relative to the session's working directory. */
export const STORE = join(".pi", "cx-heartbeat", "cron");

/** pi-cron's extension file: an interval it creates is one this package clears at the session's end. */
export const PI_CRON_EXTENSION = /[\\/]pi-cron[\\/]extensions[\\/]index\.ts(?::|$)/m;

/**
 * Links `<agentDir>/cron`, where pi-cron keeps its jobs, to `<cwd>/.pi/cx-heartbeat/cron`, so the jobs outlast the process. Never throws:
 * an extension that throws at start stops pi. A real directory already there is emptied into the store and replaced, and is left as it
 * is when a name in it is also in the store, since moving it would lose one of the two.
 */
export function linkStore(agentDir: string, cwd: string): "linked" | "kept" | "refused" {
  try {
    const store = join(cwd, STORE);
    const link = join(agentDir, "cron");
    mkdirSync(store, { recursive: true });
    const found = lstatOrUndefined(link);
    if (found?.isSymbolicLink()) {
      if (readlinkSync(link) === store) return "kept";
      unlinkSync(link);
    } else if (found?.isDirectory()) {
      const names = readdirSync(link);
      const taken = new Set(readdirSync(store));
      if (names.some((name) => taken.has(name))) return "refused";
      for (const name of names) renameSync(join(link, name), join(store, name));
      rmdirSync(link);
    } else if (found !== undefined) {
      return "refused";
    }
    symlinkSync(store, link, "dir");
    return "linked";
  } catch {
    return "refused";
  }
}

function lstatOrUndefined(path: string) {
  try {
    return lstatSync(path);
  } catch {
    return undefined;
  }
}

const TRACKED = Symbol.for("cx-heartbeat.pi-cron-intervals");
type Tracking = Set<ReturnType<typeof setInterval>>;

/**
 * pi loads an extension afresh at each reload, so pi-cron's own handle on its interval is gone and the old interval goes on ticking: it
 * marks a due job fired and fails to deliver it. Once per process, `setInterval` is wrapped to note the intervals pi-cron's file creates.
 */
export function trackPiCronIntervals(scope: typeof globalThis = globalThis): Tracking {
  const holder = scope as unknown as Record<symbol, Tracking | undefined>;
  const existing = holder[TRACKED];
  if (existing !== undefined) return existing;
  const tracked: Tracking = new Set();
  holder[TRACKED] = tracked;
  const original = scope.setInterval;
  const wrapped = function (this: unknown, ...args: Parameters<typeof setInterval>) {
    const handle = Reflect.apply(original, this, args) as ReturnType<typeof setInterval>;
    const limit = Error.stackTraceLimit;
    Error.stackTraceLimit = 32;
    const stack = new Error().stack ?? "";
    Error.stackTraceLimit = limit;
    if (PI_CRON_EXTENSION.test(stack.split("\n").slice(2).join("\n"))) tracked.add(handle);
    return handle;
  };
  scope.setInterval = Object.assign(wrapped, original) as typeof setInterval;
  return tracked;
}

export function clearTracked(tracked: Tracking): void {
  for (const handle of tracked) clearInterval(handle);
  tracked.clear();
}

export default function heartbeat(pi: ExtensionAPI): void {
  const tracked = trackPiCronIntervals();
  pi.on("session_start", (_event, ctx: ExtensionContext) => {
    // A package op's pi (`pi install -l`, `pi remove -l`) loads extensions and starts a session too; only the seller's session is linked.
    if (ctx.mode === "rpc") linkStore(getAgentDir(), ctx.cwd);
  });
  pi.on("session_shutdown", () => clearTracked(tracked));
}
