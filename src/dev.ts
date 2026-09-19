export {};

const children = [
  Bun.spawn(["bun", "--watch", "run", "src/server.ts"], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    env: process.env,
  }),
  Bun.spawn(["bunx", "vite", "--host", "127.0.0.1", "--port", "5173"], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    env: process.env,
  }),
];

let stopping = false;
function stop(): void {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    try { child.kill(); } catch { /* already stopped */ }
  }
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);

const exitCode = await Promise.race(children.map((child) => child.exited));
stop();
await Promise.all(children.map((child) => child.exited.catch(() => 1)));
process.exit(exitCode);
