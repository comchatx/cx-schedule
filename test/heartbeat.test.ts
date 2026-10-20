import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { expect, it } from "vitest";
import heartbeat, { clearTracked, linkStore, STORE, trackPiCronIntervals } from "../src/extensions/heartbeat.js";
import { scratch } from "./pi.js";

const dirs = () => {
  const root = scratch();
  const agentDir = join(root, "agent");
  const cwd = join(root, "tenant");
  mkdirSync(agentDir);
  mkdirSync(cwd);
  return { agentDir, cwd, link: join(agentDir, "cron"), store: join(cwd, STORE) };
};

it("links the agent directory's cron to the store in the tree, and keeps a link that is already right", () => {
  const { agentDir, cwd, link, store } = dirs();
  expect(linkStore(agentDir, cwd)).toBe("linked");
  expect(readlinkSync(link)).toBe(store);
  expect(lstatSync(store).isDirectory()).toBe(true);
  expect(linkStore(agentDir, cwd)).toBe("kept");
});

it("replaces a link that points elsewhere", () => {
  const { agentDir, cwd, link, store } = dirs();
  symlinkSync(agentDir, link, "dir");
  expect(linkStore(agentDir, cwd)).toBe("linked");
  expect(readlinkSync(link)).toBe(store);
});

it("moves what a real directory holds into the store before linking", () => {
  const { agentDir, cwd, link, store } = dirs();
  mkdirSync(join(link, "logs"), { recursive: true });
  writeFileSync(join(link, "jobs.json"), "{\"jobs\":[]}\n");
  expect(linkStore(agentDir, cwd)).toBe("linked");
  expect(readFileSync(join(store, "jobs.json"), "utf8")).toBe("{\"jobs\":[]}\n");
  expect(existsSync(join(store, "logs"))).toBe(true);
  expect(lstatSync(link).isSymbolicLink()).toBe(true);
});

it("leaves a real directory whose names the store also holds, and a file, as they are", () => {
  const { agentDir, cwd, link, store } = dirs();
  mkdirSync(link);
  writeFileSync(join(link, "jobs.json"), "here");
  mkdirSync(store, { recursive: true });
  writeFileSync(join(store, "jobs.json"), "there");
  expect(linkStore(agentDir, cwd)).toBe("refused");
  expect(readFileSync(join(link, "jobs.json"), "utf8")).toBe("here");
  expect(readFileSync(join(store, "jobs.json"), "utf8")).toBe("there");

  const other = dirs();
  writeFileSync(other.link, "a file");
  expect(linkStore(other.agentDir, other.cwd)).toBe("refused");
  expect(readFileSync(other.link, "utf8")).toBe("a file");
});

it("never throws: a store that cannot be made is a refusal", () => {
  const { agentDir, cwd } = dirs();
  writeFileSync(join(cwd, ".pi"), "not a directory");
  expect(linkStore(agentDir, cwd)).toBe("refused");
});

/** A scope of its own, so the test's own timers are not wrapped; `callFrom` runs `setInterval` from a file of the given name. */
const scope = () => ({ setInterval: globalThis.setInterval }) as unknown as typeof globalThis;
const callFrom = (file: string) =>
  new Function("target", `return target.setInterval(() => {}, 60000);\n//# sourceURL=${file}`) as (target: typeof globalThis) => ReturnType<typeof setInterval>;

it("notes the intervals pi-cron's extension file creates, once per scope, and clears them", () => {
  const target = scope();
  const tracked = trackPiCronIntervals(target);
  expect(trackPiCronIntervals(target)).toBe(tracked);
  const cron = callFrom("/tenant/.pi/npm/node_modules/@bacnh85/pi-cron/extensions/index.ts")(target);
  const other = callFrom("/tenant/.pi/npm/node_modules/other/extensions/index.ts")(target);
  expect([...tracked]).toEqual([cron]);
  clearTracked(tracked);
  expect(tracked.size).toBe(0);
  clearInterval(other);
  expect((cron as unknown as { _destroyed: boolean })._destroyed).toBe(true);
});

it("registers a start and a shutdown handler, and links nothing in a print-mode session", () => {
  const handlers = new Map<string, (event: unknown, ctx: unknown) => unknown>();
  heartbeat({ on: (name: string, handler: never) => handlers.set(name, handler) } as unknown as ExtensionAPI);
  expect([...handlers.keys()]).toEqual(["session_start", "session_shutdown"]);
  const { cwd } = dirs();
  handlers.get("session_start")!({}, { mode: "print", cwd });
  expect(existsSync(join(cwd, STORE))).toBe(false);
});
