import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { build } from "../scripts/build.mjs";
import { loadPackage, scratch } from "./pi.js";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const EXTENSION = join(ROOT, "dist", "extensions", "schedule.js");
const SCHEDULER = "@amaster.ai/pi-task-scheduler";
const manifest = (): Record<string, any> => JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

it("the pinned pi loads the built extension, the scheduler's handlers and command, and the one skill named for the package", async () => {
  expect(build(ROOT)).toEqual([EXTENSION]);
  const { loader, extensions, errors } = await loadPackage(ROOT);
  expect(errors).toEqual([]);
  expect(extensions.map((extension) => extension.path)).toEqual([EXTENSION]);
  expect(extensions.map((extension) => [[...extension.handlers.keys()], [...extension.commands.keys()]])).toEqual([[["session_start", "session_shutdown"], ["cron"]]]);
  const skills = loader.getSkills();
  expect(skills.diagnostics).toEqual([]);
  expect(skills.skills.map((skill) => [skill.name, skill.filePath])).toEqual([["cx-schedule", join(ROOT, "skills", "cx-schedule", "SKILL.md")]]);
});

it("is @comchatx/cx-schedule, and its skill says how it installs and that the scheduler is not installed beside it", async () => {
  expect([manifest()["name"], manifest()["repository"]["url"]]).toEqual(["@comchatx/cx-schedule", "git+https://github.com/comchatx/cx-schedule.git"]);
  const { loader } = await loadPackage(ROOT);
  const [skill] = loader.getSkills().skills;
  expect(skill!.description).toContain("`pi install -l npm:@comchatx/cx-schedule` run in /tenant (without -l it is gone at the box's next start)");
  expect(skill!.description).toContain("Do not install `@amaster.ai/pi-task-scheduler` beside it");
  // What the signed README says of a time that falls while the computer is off.
  expect(readFileSync(join(ROOT, "skills", "cx-schedule", "SKILL.md"), "utf8")).toContain("A task whose time falls while the box sleeps does not run, and does not wake the box");
});

it("carries the scheduler at one version in its tarball, names it carried for the Plugins page, and leaves its code to that copy", () => {
  const pinned = manifest()["dependencies"][SCHEDULER];
  expect(pinned).toMatch(/^\d+\.\d+\.\d+$/);
  expect(manifest()["bundleDependencies"]).toEqual([SCHEDULER]);
  expect(manifest()["comchatx"]["builds"]).toEqual([{ on: SCHEDULER, carried: true }]);
  expect(JSON.stringify(manifest())).not.toContain("pi-cron");
  build(ROOT);
  expect(readFileSync(EXTENSION, "utf8")).toContain(`from "${SCHEDULER}/extension"`);
  const out = scratch();
  const [packed] = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts", "--pack-destination", out], { cwd: ROOT, encoding: "utf8" })) as { files: { path: string }[] }[];
  const files = packed!.files.map((file) => file.path);
  expect(files).toContain(`node_modules/${SCHEDULER}/dist/extension.js`);
  expect(JSON.parse(readFileSync(join(ROOT, "node_modules", SCHEDULER, "package.json"), "utf8")).version).toBe(pinned);
}, 60_000);
