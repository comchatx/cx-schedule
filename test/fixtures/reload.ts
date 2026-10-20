import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** The ComChatX box's reload command (`src/sandbox/image/reload.ts` in that repository), which its steward sends after a pi's first turn and after a package change. */
export default function reload(pi: ExtensionAPI): void {
  pi.registerCommand("cx-reload", {
    description: "Reload packages after the list changed",
    handler: async (_args, ctx) => {
      await ctx.reload();
    },
  });
}
