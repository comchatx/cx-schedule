import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import scheduler from "@amaster.ai/pi-task-scheduler/extension";

/** Where the tasks live in the seller's tree, relative to the directory pi runs in. */
export const STORE = join(".pi", "cx-schedule", "scheduler");

/**
 * The scheduler this package carries, loaded through its own extension entry, its tasks kept in the seller's tree: by default they are in
 * the agent directory, which a box makes afresh at each start.
 */
export default function schedule(pi: ExtensionAPI): void {
  scheduler(pi, { dataDir: join(process.cwd(), STORE) });
}
