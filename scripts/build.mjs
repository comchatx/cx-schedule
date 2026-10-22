import { readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";

/** Pi supplies these to every extension; a package declares them as peers and does not bundle them (pi's packages.md, *Dependencies*). */
const PI_SUPPLIED = ["@earendil-works/pi-ai", "@earendil-works/pi-agent-core", "@earendil-works/pi-coding-agent", "@earendil-works/pi-tui", "typebox"];
/** The package this one carries in its tarball (`bundleDependencies`): the bundle loads it from there, as published, rather than inlining it. */
const CARRIED = ["@amaster.ai/pi-task-scheduler"];

/**
 * Bundles each `src/extensions/<name>.ts` into `dist/extensions/<name>.js`, its own imports inlined, pi's left for pi to supply and the carried package's left for its own copy. Pi loads
 * every module in an extensions directory, so anything there but an extension's source is refused rather than shipped.
 */
export function build(root) {
  const extensions = join(root, "src", "extensions");
  const entries = readdirSync(extensions, { withFileTypes: true }).map((entry) => {
    if (!entry.isFile() || !entry.name.endsWith(".ts") || entry.name.endsWith(".test.ts")) throw new Error(`src/extensions/${entry.name} is not an extension; tests live under test/`);
    return join(extensions, entry.name);
  });
  if (entries.length === 0) throw new Error("src/extensions holds no extension");
  const out = join(root, "dist", "extensions");
  rmSync(join(root, "dist"), { recursive: true, force: true });
  buildSync({ entryPoints: entries, outdir: out, bundle: true, platform: "node", format: "esm", external: [...PI_SUPPLIED, ...CARRIED], logLevel: "warning" });
  return entries.map((entry) => join(out, entry.slice(extensions.length + 1).replace(/\.ts$/, ".js")));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) build(resolve(fileURLToPath(new URL("..", import.meta.url))));
