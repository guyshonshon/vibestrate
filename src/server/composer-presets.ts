// Composer presets: saved (brief? + guideId + slotProviders + skills +
// readOnly) combos surfaced by the Mission Control composer's "Save crew
// as preset" and "Save as template" affordances.
//
// Stored under .amaco/composer-presets.json — one JSON file, one slot
// per preset name. Names are slugged so they're URL-safe and stable.
// Path-guarded: the route never trusts a body-supplied path; everything
// goes through this module's known on-disk location.

import path from "node:path";
import fs from "node:fs/promises";
import { z } from "zod";
import { amacoRoot } from "../utils/paths.js";
import { pathExists } from "../utils/fs.js";

const PRESETS_FILENAME = "composer-presets.json";

const guideRefSchema = z
  .object({
    id: z.string().min(1).max(80),
    contextPolicy: z
      .enum(["balanced", "compact", "artifact-heavy"])
      .default("balanced"),
    slotProviders: z
      .record(z.string().min(1).max(80), z.string().min(1).max(128))
      .default({}),
    skippedOptionalSteps: z.array(z.string().min(1).max(80)).max(64).default([]),
  })
  .strict();

export const composerPresetSchema = z
  .object({
    name: z.string().min(1).max(120),
    kind: z.enum(["crew", "template"]).default("crew"),
    brief: z.string().max(4000).nullable().default(null),
    guide: guideRefSchema.nullable().default(null),
    provider: z.string().min(1).max(128).nullable().default(null),
    skills: z.array(z.string().min(1).max(80)).max(64).default([]),
    readOnly: z.boolean().default(false),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .strict();

export type ComposerPreset = z.infer<typeof composerPresetSchema>;

const presetsFileSchema = z
  .object({
    schemaVersion: z.literal(1).default(1),
    presets: z.array(composerPresetSchema).default([]),
  })
  .strict();

export type ComposerPresetUpsert = Omit<
  ComposerPreset,
  "createdAt" | "updatedAt"
>;

function presetsPath(projectRoot: string): string {
  return path.join(amacoRoot(projectRoot), PRESETS_FILENAME);
}

/**
 * Stable slug — drives uniqueness so renaming a preset replaces it
 * instead of creating a duplicate. Lower-cased, dashed, ASCII-only.
 */
export function slugifyPresetName(raw: string): string {
  const slug = raw
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "preset";
}

export async function readComposerPresets(
  projectRoot: string,
): Promise<ComposerPreset[]> {
  const file = presetsPath(projectRoot);
  if (!(await pathExists(file))) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    // Corrupt file — surface as empty rather than throwing so the
    // dashboard keeps loading.
    return [];
  }
  const parsed = presetsFileSchema.safeParse(raw);
  if (!parsed.success) return [];
  return parsed.data.presets;
}

async function writePresetsFile(
  projectRoot: string,
  presets: ComposerPreset[],
): Promise<void> {
  const file = presetsPath(projectRoot);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const body = JSON.stringify(
    { schemaVersion: 1, presets },
    null,
    2,
  );
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, body, { encoding: "utf8", mode: 0o600 });
  try {
    await fs.rename(tmp, file);
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => undefined);
    throw err;
  }
}

/**
 * Upsert by slug. Returns the saved preset (with createdAt / updatedAt
 * filled in) and whether this was a fresh insert.
 */
export async function upsertComposerPreset(input: {
  projectRoot: string;
  preset: ComposerPresetUpsert;
}): Promise<{ preset: ComposerPreset; created: boolean }> {
  const { projectRoot, preset } = input;
  const slug = slugifyPresetName(preset.name);
  const now = new Date().toISOString();
  const existing = await readComposerPresets(projectRoot);
  const idx = existing.findIndex((p) => slugifyPresetName(p.name) === slug);

  const merged: ComposerPreset = {
    ...preset,
    createdAt: idx >= 0 ? existing[idx]!.createdAt ?? now : now,
    updatedAt: now,
  };
  const next =
    idx >= 0
      ? existing.map((p, i) => (i === idx ? merged : p))
      : [...existing, merged];
  await writePresetsFile(projectRoot, next);
  return { preset: merged, created: idx < 0 };
}

export async function deleteComposerPreset(input: {
  projectRoot: string;
  name: string;
}): Promise<{ deleted: boolean }> {
  const slug = slugifyPresetName(input.name);
  const existing = await readComposerPresets(input.projectRoot);
  const next = existing.filter((p) => slugifyPresetName(p.name) !== slug);
  if (next.length === existing.length) return { deleted: false };
  await writePresetsFile(input.projectRoot, next);
  return { deleted: true };
}
