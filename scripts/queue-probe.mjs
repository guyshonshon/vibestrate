import pty from "node-pty";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distEntry = resolve(repoRoot, "dist/index.js");

const p = pty.spawn(
  process.execPath,
  [distEntry],
  {
    cwd: "/tmp/vibestrate-shell-smoke",
    cols: 160,
    rows: 30,
    env: { ...process.env, TERM: "xterm-256color" },
  },
);
let buf = "";
p.onData((d) => (buf += d));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (s) =>
  s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "").replace(/\x1b\[\?[0-9;]*[hl]/g, "");
await sleep(2200);
p.write("3"); // Queue tab
await sleep(700);
console.log(strip(buf).split(/\r?\n/).slice(-30).join("\n"));
p.write("q");
await sleep(300);
p.kill();
