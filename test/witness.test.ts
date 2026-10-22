import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { build } from "../scripts/build.mjs";
import { STORE } from "../src/extensions/schedule.js";
import { scratch } from "./pi.js";
import { agentFiles, loopbackModel, RpcPi } from "./rpc.js";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PI = join(ROOT, "node_modules", "@earendil-works", "pi-coding-agent", "dist", "cli.js");
const RELOAD = join(ROOT, "test", "fixtures", "reload.ts");
const EVERY_MS = 5_000;

const stops: (() => Promise<void>)[] = [];
afterEach(async () => { for (const stop of stops.splice(0).reverse()) await stop(); });
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

const piEnv = (agentDir: string): NodeJS.ProcessEnv => ({
  PATH: process.env["PATH"], HOME: agentDir, PI_CODING_AGENT_DIR: agentDir, PI_OFFLINE: "1", PI_SKIP_VERSION_CHECK: "1", PI_TELEMETRY: "0",
});

/** The package as npm unpacks it from its tarball, the scheduler it carries inside: nothing is read from the registry. */
let installed: string;
let packRoot: string;
beforeAll(() => {
  build(ROOT);
  packRoot = mkdtempSync(join(tmpdir(), "pi-package-pack-"));
  const [packed] = JSON.parse(execFileSync("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", packRoot], { cwd: ROOT, encoding: "utf8" })) as { filename: string }[];
  execFileSync("tar", ["-xzf", join(packRoot, packed!.filename), "-C", packRoot]);
  installed = join(packRoot, "package");
}, 120_000);
afterAll(() => rmSync(packRoot, { recursive: true, force: true }));

/**
 * A box: the seller's tree listing the unpacked package, and pi in RPC mode on one conversation kept in that tree, as a box's steward
 * runs it. `start` runs pi again on a fresh agent directory, as the box's next start does.
 */
async function box() {
  const home = scratch();
  const tenant = join(home, "tenant");
  mkdirSync(join(tenant, ".pi"), { recursive: true });
  writeFileSync(join(tenant, ".pi", "settings.json"), JSON.stringify({ packages: [installed] }));
  const model = await loopbackModel();
  stops.push(model.close);
  const files = agentFiles(model.url);
  let starts = 0;
  let pi!: RpcPi;
  const start = (): void => {
    const agentDir = join(home, `agent-${++starts}`);
    mkdirSync(agentDir);
    writeFileSync(join(agentDir, "settings.json"), JSON.stringify(files.settings));
    writeFileSync(join(agentDir, "models.json"), JSON.stringify(files.models));
    const running = new RpcPi(PI, ["--extension", RELOAD, "--session-dir", join(tenant, ".pi", "sessions"), "--session-id", "seller-chat"], { cwd: tenant, env: piEnv(agentDir) });
    stops.push(() => running.stop());
    pi = running;
  };
  start();
  const turn = async (message: string): Promise<void> => {
    const settled = pi.settled();
    expect(await pi.send({ type: "prompt", message })).toMatchObject({ success: true });
    await settled;
  };
  /** The model makes a task sending `prompt` every five seconds, through the scheduler's own tool. */
  const every = (prompt: string): Promise<void> => turn(`CALL scheduler_create ${JSON.stringify({ type: "interval", schedule: `${EVERY_MS / 1_000}s`, prompt, name: prompt })}`);
  /** When the model was sent `prompt`, each time. */
  const fired = (prompt: string, since = 0): number[] => model.times.filter((time, n) => model.texts[n] === prompt && time >= since);
  return { tenant, start, turn, every, fired, pi: () => pi };
}

describe("a task the model makes, on the pinned pi with the scheduler the tarball carries", () => {
  it("fires into the conversation it was made in, every five seconds, and not into a new one", async () => {
    const b = await box();
    await b.turn("hello");
    await b.every("TICK here");
    await sleep(3 * EVERY_MS);
    expect(b.fired("TICK here").length).toBeGreaterThanOrEqual(2);
    expect(await b.pi().send({ type: "new_session" })).toMatchObject({ success: true });
    const from = Date.now() + 1_000;
    await sleep(2 * EVERY_MS + 1_000);
    expect(b.fired("TICK here", from)).toEqual([]);
  }, 120_000);

  it("keeps one timer across the box's reloads", async () => {
    const b = await box();
    await b.turn("hello");
    await b.every("TICK reload");
    for (const _ of [1, 2]) {
      await sleep(EVERY_MS + 500);
      expect(await b.pi().send({ type: "prompt", message: "/cx-reload" })).toMatchObject({ success: true });
    }
    const from = Date.now();
    await sleep(4 * EVERY_MS);
    const times = b.fired("TICK reload", from);
    expect(times.length).toBeGreaterThanOrEqual(2);
    // A timer a reload left running fires between this timer's fires.
    expect(times.slice(1).map((time, n) => time - times[n]!).filter((gap) => gap < EVERY_MS / 2)).toEqual([]);
  }, 120_000);

  it("is kept in the seller's tree, so the next start on a fresh agent directory fires it", async () => {
    const b = await box();
    await b.turn("hello");
    await b.every("TICK kept");
    expect(readdirSync(join(b.tenant, STORE)).filter((name) => /^tasks-[0-9a-f]{64}\.json$/.test(name))).toHaveLength(1);
    await b.pi().stop();
    const stopped = Date.now();
    b.start();
    await b.turn("hello again");
    await sleep(2 * EVERY_MS + 1_000);
    expect(b.fired("TICK kept", stopped).length).toBeGreaterThanOrEqual(1);
  }, 120_000);
});
