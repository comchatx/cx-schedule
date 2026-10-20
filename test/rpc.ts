import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { createInterface } from "node:readline";

/** A model on loopback that answers `Done.` and keeps the last user text of each request. */
export async function loopbackModel() {
  const texts: string[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString()) as { model: string; messages: { role: string; content: unknown }[] };
      const last = body.messages.filter((message) => message.role !== "system").at(-1);
      const content = last?.content;
      texts.push(typeof content === "string" ? content : (content as { text?: string }[] | undefined ?? []).map((block) => block.text ?? "").join(""));
      const chunk = (delta: unknown, finish: string | null) =>
        `data: ${JSON.stringify({ id: "x", object: "chat.completion.chunk", created: 1, model: body.model, choices: [{ index: 0, delta, finish_reason: finish }], ...(finish === null ? {} : { usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }) })}\n\n`;
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write(chunk({ role: "assistant", content: "Done." }, null));
      response.write(chunk({}, "stop"));
      response.end("data: [DONE]\n\n");
    });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,
    texts,
    close: () => new Promise<void>((done) => { server.closeAllConnections(); server.close(() => done()); }),
  };
}

/** The agent directory's two files for a pi that talks to the loopback model alone. */
export function agentFiles(modelUrl: string, extra: Record<string, unknown> = {}) {
  return {
    settings: { defaultProvider: "fixture", defaultModel: "fixture-a", defaultThinkingLevel: "off", defaultProjectTrust: "always", quietStartup: true, retry: { enabled: false }, ...extra },
    models: { providers: { fixture: { baseUrl: modelUrl, apiKey: "fixture", api: "openai-completions", models: [{ id: "fixture-a", name: "fixture-a", reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 1024 }] } } },
  };
}

type Message = Record<string, unknown>;

/** pi in RPC mode, as a box's steward runs it: one command a line, answered by id. */
export class RpcPi {
  readonly #child: ChildProcess;
  readonly #waiting = new Map<string, (message: Message) => void>();
  readonly #settled = new Set<() => void>();
  #next = 0;
  stderr = "";

  constructor(pi: string, args: readonly string[], options: { cwd: string; env: NodeJS.ProcessEnv }) {
    this.#child = spawn(process.execPath, [pi, "--mode", "rpc", ...args], { cwd: options.cwd, env: options.env, stdio: ["pipe", "pipe", "pipe"] });
    this.#child.stderr?.on("data", (chunk: Buffer) => { this.stderr += chunk.toString(); });
    createInterface({ input: this.#child.stdout! }).on("line", (line) => {
      let message: Message;
      try { message = JSON.parse(line) as Message; } catch { return; }
      if (message["type"] === "response" && typeof message["id"] === "string") this.#waiting.get(message["id"])?.(message);
      if (message["type"] === "agent_settled") for (const settle of [...this.#settled]) settle();
    });
  }

  send(command: Message): Promise<Message> {
    const id = `c${this.#next++}`;
    return new Promise((resolve) => {
      this.#waiting.set(id, (message) => { this.#waiting.delete(id); resolve(message); });
      this.#child.stdin!.write(`${JSON.stringify({ ...command, id })}\n`);
    });
  }

  /** Resolves at pi's next `agent_settled`. */
  settled(): Promise<void> {
    return new Promise((resolve) => {
      const done = () => { this.#settled.delete(done); resolve(); };
      this.#settled.add(done);
    });
  }

  async stop(): Promise<void> {
    if (this.#child.exitCode !== null) return;
    const exited = new Promise<void>((done) => this.#child.once("exit", () => done()));
    this.#child.kill("SIGTERM");
    await exited;
  }
}
