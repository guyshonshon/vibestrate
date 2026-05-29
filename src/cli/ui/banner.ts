// Purple ASCII VIBESTRATE banner shown above the root `vibe` help. Colored
// only when stdout is a TTY and NO_COLOR isn't set, so piped/non-tty output
// stays clean. String.raw keeps the figlet backslashes literal.
const ART = String.raw`__     _____ ____  _____ ____ _____ ____      _  _____ _____
\ \   / /_ _| __ )| ____/ ___|_   _|  _ \    / \|_   _| ____|
 \ \ / / | ||  _ \|  _| \___ \ | | | |_) |  / _ \ | | |  _|
  \ V /  | || |_) | |___ ___) || | |  _ <  / ___ \| | | |___
   \_/  |___|____/|_____|____/ |_| |_| \_\/_/   \_\_| |_____|`;

// Top→bottom violet gradient matching the brand mark.
const GRADIENT: [number, number, number][] = [
  [183, 148, 255],
  [154, 123, 255],
  [124, 92, 255],
  [106, 63, 224],
  [91, 33, 182],
];

const useColor = process.stdout.isTTY === true && !process.env.NO_COLOR;

export function renderBanner(): string {
  const lines = ART.split("\n");
  if (!useColor) return lines.join("\n");
  return lines
    .map((line, i) => {
      const [r, g, b] = GRADIENT[Math.min(i, GRADIENT.length - 1)]!;
      return `\x1b[38;2;${r};${g};${b}m${line}\x1b[0m`;
    })
    .join("\n");
}
