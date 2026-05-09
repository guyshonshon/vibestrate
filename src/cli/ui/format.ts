const isTTY = process.stdout.isTTY === true;
const COLOR = process.env.NO_COLOR ? false : isTTY;

function wrap(open: string, close: string, s: string): string {
  if (!COLOR) return s;
  return `\x1b[${open}m${s}\x1b[${close}m`;
}

export const color = {
  bold: (s: string) => wrap("1", "22", s),
  dim: (s: string) => wrap("2", "22", s),
  green: (s: string) => wrap("32", "39", s),
  yellow: (s: string) => wrap("33", "39", s),
  red: (s: string) => wrap("31", "39", s),
  cyan: (s: string) => wrap("36", "39", s),
  gray: (s: string) => wrap("90", "39", s),
};

export const symbol = {
  ok: () => color.green("✓"),
  warn: () => color.yellow("!"),
  fail: () => color.red("✗"),
  bullet: () => color.dim("•"),
  arrow: () => color.cyan("→"),
};

export function header(title: string): string {
  return color.bold(title);
}

export function indent(text: string, n = 2): string {
  const pad = " ".repeat(n);
  return text
    .split("\n")
    .map((l) => (l.length ? pad + l : l))
    .join("\n");
}

export function isInteractiveTTY(): boolean {
  return process.stdin.isTTY === true && process.stdout.isTTY === true;
}
