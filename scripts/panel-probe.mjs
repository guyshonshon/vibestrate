// Spawn `amaco` in a real PTY, send a sequence of keystrokes, and
// snapshot the visible frame between each one so we can see what
// actually changed. Used for triaging navigation bugs the user
// reports.
import pty from "node-pty";

const cwd = process.argv[2] ?? process.cwd();

const p = pty.spawn(process.execPath, [
  "/Users/guy/Programming/amaco/dist/index.js",
], {
  cwd,
  cols: 160,
  rows: 40,
  env: { ...process.env, NO_COLOR: "0", TERM: "xterm-256color" },
});

let buf = "";
p.onData((d) => {
  buf += d;
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stripAnsi = (s) =>
  s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "").replace(/\x1b\[\?[0-9;]*[hl]/g, "");

async function snapshot(label) {
  await sleep(450);
  const visible = stripAnsi(buf);
  const lines = visible.split(/\r?\n/);
  const tail = lines.slice(-40).join("\n");
  console.log(`\n========== ${label} ==========\n${tail}`);
}

(async () => {
  await sleep(2200);
  await snapshot("initial");

  console.log("\n>>> press 4 (Runs)");
  p.write("4");
  await snapshot("after 4");

  console.log("\n>>> press tab");
  p.write("\t");
  await snapshot("after tab");

  console.log("\n>>> press e");
  p.write("e");
  await snapshot("after e");

  console.log("\n>>> press /");
  p.write("/");
  await snapshot("after /");

  console.log("\n>>> press Esc");
  p.write("\x1b");
  await snapshot("after Esc");

  console.log("\n>>> press v");
  p.write("v");
  await snapshot("after v");

  console.log("\n>>> press o");
  p.write("o");
  await snapshot("after o");

  console.log("\n>>> press r (lowercase resume — should err-toast on blocked run)");
  p.write("r");
  await snapshot("after r");

  console.log("\n>>> press R (re-run)");
  p.write("R");
  await snapshot("after R");

  console.log("\n>>> press q");
  p.write("q");
  await sleep(400);
  p.kill();
})().catch((e) => {
  console.error(e);
  p.kill();
});
