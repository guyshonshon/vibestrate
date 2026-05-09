import { readText, writeText } from "./fs.js";

export async function readJson<T>(filePath: string): Promise<T> {
  const raw = await readText(filePath);
  return JSON.parse(raw) as T;
}

export async function writeJson(filePath: string, value: unknown): Promise<void> {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  await writeText(filePath, text);
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(value);
}
