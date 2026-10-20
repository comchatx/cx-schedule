import { execFileSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { build } from "../scripts/build.mjs";
import { STORE } from "../src/extensions/heartbeat.js";
import { scratch } from "./pi.js";
import { agentFiles, loopbackModel, RpcPi } from "./rpc.js";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PI = join(ROOT, "node_modules", "@earendil-works", "pi-coding-agent", "dist", "cli.js");
const RELOAD = join(ROOT, "test", "fixtures", "reload.ts");
/** The version this package is checked against; the range it is said to work with is this one. */
const PI_CRON = "npm:@bacnh85/pi-cron@0.4.0";
const TICK_MS = 5_000;

const stops: (() => Promise<void>)[] = [];
afterEach(async () => { for (const stop of stops.splice(0).reverse()) await stop(); });
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

const piEnv = (agentDir: string): NodeJS.ProcessEnv => ({
  PATH: process.env["PATH"], HOME: agentDir, PI_CODING_AGENT_DIR: agentDir, PI_OFFLINE: "1", PI_SKIP_VERSION_CHECK: "1", PI_TELEMETRY: "0",
});

/** A tenant tree with pi-cron as `pi install -l` from npm leaves it, made once: the npm registry is read here and nowhere else. */
let installed: string;
let installRoot: string;
beforeAll(() => {
  build(ROOT);
  installRoot = mkdtempSync(join(tmpdir(), "pi-package-install-"));
  installed = join(installRoot, "tenant");
  const agentDir = join(installed, "..", "agent");
  mkdirSync(installed, { recursive: true });
  mkdirSync(agentDir);
  execFileSync(process.execPath, [PI, "install", "-l", PI_CRON], { cwd: installed, env: { ...piEnv(agentDir), PI_OFFLINE: "0", npm_config_ignore_scripts: "true" }, stdio: "pipe" });
}, 120_000);
afterAll(() => rmSync(installRoot, { recursive: true, force: true }));

type Job = { name: string; lastRun?: number; lastStatus?: "ok" | "fail"; lastError?: string };

async function box(packages: readonly string[]) {
  const home = scratch();
  const tenant = join(home, "tenant");
  const agentDir = join(home, "agent");
  cpSync(installed, tenant, { recursive: true });
  writeFileSync(join(tenant, ".pi", "settings.json"), JSON.stringify({ packages }));
  const model = await loopbackModel();
  stops.push(model.close);
  const files = agentFiles(model.url, { cron: { tickMs: TICK_MS } });
  mkdirSync(agentDir);
  writeFileSync(join(agentDir, "settings.json"), JSON.stringify(files.settings));
  writeFileSync(join(agentDir, "models.json"), JSON.stringify(files.models));
  const pi = new RpcPi(PI, ["--extension", RELOAD], { cwd: tenant, env: piEnv(agentDir) });
  stops.push(() => pi.stop());
  const cwd = realpathSync(tenant);
  const store = join(agentDir, "cron");
  const jobs = (): Job[] => { try { return (JSON.parse(readFileSync(join(store, "jobs.json"), "utf8")) as { jobs: Job[] }).jobs; } catch { return []; } };
  /** A job due at `due`, written beside the others as pi-cron writes its own store. */
  const seed = (name: string, due: number) => {
    mkdirSync(store, { recursive: true });
    const all = [...jobs(), { name, schedule: "0 0 1 1 *", prompt: `HEARTBEAT ${name}`, cwd, enabled: true, nextRun: due }];
    writeFileSync(join(store, ".seed"), JSON.stringify({ jobs: all }));
    renameSync(join(store, ".seed"), join(store, "jobs.json"));
  };
  const ended = async (name: string): Promise<Job> => {
    const until = Date.now() + 4 * TICK_MS;
    for (;;) {
      const job = jobs().find((candidate) => candidate.name === name);
      if (job?.lastStatus !== undefined || Date.now() > until) return job ?? { name };
      await sleep(100);
    }
  };
  const turn = async (message: string) => {
    const settled = pi.settled();
    expect(await pi.send({ type: "prompt", message })).toMatchObject({ success: true });
    await settled;
  };
  /** The live ticker's phase, read from a job it fires: pi-cron stamps `lastRun` with the tick's own clock. */
  const phase = async (name: string): Promise<number> => {
    const settled = pi.settled();
    seed(name, Date.now());
    const job = await ended(name);
    expect(job).toMatchObject({ lastStatus: "ok" });
    await settled;
    return job.lastRun!;
  };
  /**
   * `/cx-reload` sent half a tick after the live ticker's phase, then a job due a second before that old ticker's next tick: an interval
   * the reload left running takes it first, and only a ticker armed by the reload delivers it.
   */
  const reloadThenDue = async (name: string, live: number) => {
    await sleep(TICK_MS - ((Date.now() - live) % TICK_MS) + TICK_MS / 2);
    expect(await pi.send({ type: "prompt", message: "/cx-reload" })).toMatchObject({ success: true });
    let due = live;
    while (due < Date.now() + 500) due += TICK_MS;
    due -= 1_000;
    if (due < Date.now() + 200) due += TICK_MS;
    seed(name, due);
    const job = await ended(name);
    // `ok` is written when pi takes the turn; the model request follows.
    const reached = () => model.texts.some((text) => text.includes(`HEARTBEAT ${name}`));
    const until = Date.now() + (job.lastStatus === "ok" ? 10_000 : 0);
    while (!reached() && Date.now() < until) await sleep(100);
    return { ...job, reached: reached() };
  };
  /** A click's change of the list, run as the box's package door runs it: its own pi, its own agent directory. */
  const click = () => {
    const op = join(home, "op");
    const pkg = join(home, "pk");
    mkdirSync(op);
    mkdirSync(pkg);
    writeFileSync(join(op, "settings.json"), JSON.stringify(files.settings));
    writeFileSync(join(pkg, "package.json"), JSON.stringify({ name: "pk", version: "0.0.1", keywords: ["pi-package"], pi: { skills: [] } }));
    execFileSync(process.execPath, [PI, "install", "-l", pkg], { cwd: tenant, env: piEnv(op), stdio: "pipe" });
    return op;
  };
  return { pi, tenant, agentDir, store, turn, phase, reloadThenDue, click, jobs };
}

const HEARTBEAT = ROOT;

describe("due jobs after a reload, on the pinned pi with pi-cron as npm installs it", () => {
  for (const [order, packages] of [["first", [HEARTBEAT, PI_CRON]], ["last", [PI_CRON, HEARTBEAT]]] as const) {
    it(`are delivered after the first turn's /cx-reload and after a click's, cx-heartbeat listed ${order}`, async () => {
      const b = await box(packages);
      await b.turn("hello");
      const first = await b.reloadThenDue("after-first", await b.phase("phase-1"));
      expect(first).toMatchObject({ lastStatus: "ok", reached: true });

      const op = b.click();
      // The package op's pi loaded the extensions and started a session, and was not linked: only the seller's session is.
      expect(existsSync(join(op, "cron"))).toBe(false);
      const second = await b.reloadThenDue("after-click", first.lastRun!);
      expect(second).toMatchObject({ lastStatus: "ok", reached: true });
    }, 180_000);
  }

  it("are taken by the interval the reload left running when cx-heartbeat is not loaded", async () => {
    const b = await box([PI_CRON]);
    await b.turn("hello");
    const job = await b.reloadThenDue("after-first", await b.phase("phase-1"));
    expect(job).toMatchObject({ lastStatus: "fail", lastError: "delivery failed", reached: false });
  }, 120_000);
});

describe("the jobs' store", () => {
  it("is the seller's tree: the session links it, and a new process on a new agent directory finds the jobs", async () => {
    const b = await box([HEARTBEAT, PI_CRON]);
    await b.turn("hello");
    const store = join(realpathSync(b.tenant), STORE);
    expect(lstatSync(b.store).isSymbolicLink()).toBe(true);
    expect(readlinkSync(b.store)).toBe(store);
    await b.phase("kept");
    await b.pi.stop();

    const again = await box([HEARTBEAT, PI_CRON]);
    cpSync(join(b.tenant, ".pi", "cx-heartbeat"), join(again.tenant, ".pi", "cx-heartbeat"), { recursive: true });
    await again.turn("hello");
    expect(again.jobs().map((job) => [job.name, job.lastStatus])).toEqual([["kept", "ok"]]);
  }, 120_000);
});
