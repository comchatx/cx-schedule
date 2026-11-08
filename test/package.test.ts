import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { loadPackage, scratch } from "./pi.js";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const SCHEDULER = "@amaster.ai/pi-task-scheduler";
const manifest = (): Record<string, any> => JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

it("the pinned pi loads the one skill named for the package, and no extension", async () => {
  const { loader, extensions, errors } = await loadPackage(ROOT);
  expect(errors).toEqual([]);
  expect(extensions).toEqual([]);
  const skills = loader.getSkills();
  expect(skills.diagnostics).toEqual([]);
  expect(skills.skills.map((skill) => [skill.name, skill.filePath])).toEqual([["cx-schedule", join(ROOT, "skills", "cx-schedule", "SKILL.md")]]);
});

it("is @comchatx/cx-schedule, and its skill says how it installs, that it needs the scheduler, and how cx tells the scheduler is not installed", async () => {
  expect([manifest()["name"], manifest()["repository"]["url"]]).toEqual(["@comchatx/cx-schedule", "git+https://github.com/comchatx/cx-schedule.git"]);
  const { loader } = await loadPackage(ROOT);
  const [skill] = loader.getSkills().skills;
  expect(skill!.description).toContain("`pi install -l npm:@comchatx/cx-schedule` run in /tenant (without -l it is gone at the box's next start)");
  expect(skill!.description).toContain("cx-schedule needs `@amaster.ai/pi-task-scheduler`: where no `scheduler_*` tool is there, the scheduler is not installed, and the seller installs it in Plugins");
  const body = readFileSync(join(ROOT, "skills", "cx-schedule", "SKILL.md"), "utf8");
  // What the signed README says of a time that falls while the computer is off.
  expect(body).toContain("A task whose time falls while the box sleeps does not run, and does not wake the box");
  expect(body).toContain("`/tenant/.pi/pi-scheduler/`");
});

it("names the scheduler as required for the Plugins page and carries no copy of it", () => {
  expect(manifest()["comchatx"]["builds"]).toEqual([SCHEDULER]);
  expect(manifest()["dependencies"]).toBeUndefined();
  expect(manifest()["bundleDependencies"]).toBeUndefined();
  expect(manifest()["pi"]).toEqual({ skills: ["./skills"] });
  expect(JSON.stringify(manifest())).not.toContain("pi-cron");
  const out = scratch();
  const [packed] = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts", "--pack-destination", out], { cwd: ROOT, encoding: "utf8" })) as { files: { path: string }[] }[];
  expect(packed!.files.map((file) => file.path).sort()).toEqual(["LICENSE", "README.md", "README.zh-CN.md", "package.json", "skills/cx-schedule/SKILL.md"]);
}, 60_000);

it("the comchatx field carries no description, which the Plugins page never draws: the card's Chinese line is about", () => {
  const field = (JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { comchatx: Record<string, unknown> }).comchatx;
  expect(field["description"]).toBeUndefined();
  expect(field["about"]).toMatch(/[一-鿿]/);
});
