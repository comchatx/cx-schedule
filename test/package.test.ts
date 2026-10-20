import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { build } from "../scripts/build.mjs";
import { loadPackage } from "./pi.js";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const EXTENSION = join(ROOT, "dist", "extensions", "heartbeat.js");

it("the pinned pi loads the built extension, its two handlers and the one skill named for the package", async () => {
  expect(build(ROOT)).toEqual([EXTENSION]);
  const { loader, extensions, errors } = await loadPackage(ROOT);
  expect(errors).toEqual([]);
  expect(extensions.map((extension) => extension.path)).toEqual([EXTENSION]);
  expect(extensions.map((extension) => [...extension.handlers.keys()])).toEqual([["session_start", "session_shutdown"]]);
  const skills = loader.getSkills();
  expect(skills.diagnostics).toEqual([]);
  expect(skills.skills.map((skill) => [skill.name, skill.filePath])).toEqual([["cx-heartbeat", join(ROOT, "skills", "cx-heartbeat", "SKILL.md")]]);
});

it("the skill's description says what it needs and how both packages install", async () => {
  const { loader } = await loadPackage(ROOT);
  const [skill] = loader.getSkills().skills;
  expect(skill!.description).toContain("if no cron skill is listed, it is not installed");
  expect(skill!.description).toContain("`pi install -l npm:@bacnh85/pi-cron` run in /tenant (without -l it is gone at the box's next start)");
  expect(skill!.description).toContain("`pi install -l npm:cx-heartbeat` in /tenant");
});

it("the package neither bundles nor lists pi-cron", () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as Record<string, unknown>;
  for (const field of ["dependencies", "optionalDependencies", "bundleDependencies", "bundledDependencies"]) expect(manifest[field], field).toBeUndefined();
  for (const field of ["peerDependencies", "devDependencies", "overrides"]) expect(JSON.stringify(manifest[field]), field).not.toContain("pi-cron");
  expect(readFileSync(EXTENSION, "utf8")).not.toMatch(/cron-parser|luxon/);
});
