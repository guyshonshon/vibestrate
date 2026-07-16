import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { ProjectConfig } from "../../../project/config-schema.js";
import {
  createProfile,
  deleteProfile,
  setProfileFields,
} from "../../../setup/config-update-service.js";
import { profileUsage } from "../../../agents/profile-usage.js";
import { capabilitiesForProvider } from "../../../providers/provider-catalog.js";
import {
  BUILTIN_CATALOG,
  type ResolvedCatalog,
} from "../../../providers/provider-apply.js";
import {
  providerOverlaySource,
  type CatalogOverlay,
} from "../../../providers/provider-catalog-overlay.js";
import { refreshCatalog } from "../../../providers/provider-probe.js";
import { ACCENT, ACCENT_BRIGHT } from "../theme.js";
import { SelectionMark } from "../components/visuals.js";

type Props = {
  projectRoot: string;
  config: ProjectConfig | null;
  /** Resolved catalog (built-in + overlay). Defaults to built-in if omitted. */
  catalog?: ResolvedCatalog;
  /** Raw overlay - used to tag which provider knobs come from it. */
  overlay?: CatalogOverlay;
  /** Re-read the catalog overlay after a refresh writes it. */
  reloadCatalog?: () => Promise<void>;
  refreshConfig: () => Promise<void>;
  onToast: (kind: "ok" | "err" | "info", message: string) => void;
  selectedIndex: number;
  setSelectedIndex: (i: number) => void;
  active: boolean;
};

function cycle<T>(arr: T[], current: T, dir: 1 | -1): T | undefined {
  if (arr.length === 0) return undefined;
  const i = arr.indexOf(current);
  const start = i === -1 ? (dir === 1 ? -1 : 0) : i;
  return arr[(start + dir + arr.length) % arr.length];
}

/** Api-aware knobs for a configured provider (empty if unconfigured). */
function capsFor(
  config: ProjectConfig | null,
  providerId: string | undefined,
  catalog: ResolvedCatalog,
): { models: string[]; powerLevels: string[] } {
  const cfg = providerId ? config?.providers[providerId] : undefined;
  if (!providerId || !cfg) return { models: [], powerLevels: [] };
  const caps = capabilitiesForProvider(providerId, cfg, catalog);
  return { models: caps.models, powerLevels: caps.powerLevels };
}

export function ProfilesPage({
  projectRoot,
  config,
  catalog = BUILTIN_CATALOG,
  overlay = {},
  reloadCatalog,
  refreshConfig,
  onToast,
  selectedIndex,
  setSelectedIndex,
  active,
}: Props) {
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const overlayActive = !!(overlay.cli || overlay.http);

  async function probeCatalog() {
    onToast("info", "Probing providers' --help for model/effort…");
    try {
      const r = await refreshCatalog(projectRoot);
      const added = r.findings.filter((f) => f.status === "added").length;
      await reloadCatalog?.();
      onToast(
        "ok",
        added > 0
          ? `Catalog: added ${added} provider(s) to the overlay - review it.`
          : "Catalog: no new knobs found (built-in + overlay already cover them).",
      );
    } catch (err) {
      onToast("err", err instanceof Error ? err.message : String(err));
    }
  }

  const profiles = config
    ? Object.entries(config.profiles).map(([id, p]) => ({ id, ...p }))
    : [];
  const usage = config ? profileUsage(config) : new Map();
  const idx = Math.max(0, Math.min(profiles.length - 1, selectedIndex));
  const selected = profiles[idx] ?? null;

  async function mutate(fn: () => Promise<void>, ok: string) {
    try {
      await fn();
      await refreshConfig();
      onToast("ok", ok);
    } catch (err) {
      onToast("err", err instanceof Error ? err.message : String(err));
    }
  }

  async function cycleEffort(dir: 1 | -1) {
    if (!selected) return;
    const levels = capsFor(config, selected.provider, catalog).powerLevels;
    if (levels.length === 0) {
      onToast("info", `${selected.provider} exposes no effort control.`);
      return;
    }
    const next = cycle(levels, selected.power ?? "", dir) ?? levels[0]!;
    await mutate(
      () => setProfileFields(projectRoot, selected.id, { power: next }),
      `${selected.id} effort -> ${next}.`,
    );
  }

  async function cycleModel(dir: 1 | -1) {
    if (!selected) return;
    const models = capsFor(config, selected.provider, catalog).models;
    if (models.length === 0) {
      onToast(
        "info",
        `${selected.provider} has no preset models to cycle - set one in the web editor or 'vibe profile set'.`,
      );
      return;
    }
    const options = ["", ...models]; // "" = provider default
    const next = cycle(options, selected.model ?? "", dir) ?? "";
    await mutate(
      () => setProfileFields(projectRoot, selected.id, { model: next || null }),
      `${selected.id} model -> ${next || "(default)"}.`,
    );
  }

  async function duplicate() {
    if (!selected) return;
    const existing = new Set(profiles.map((p) => p.id));
    let newId = `${selected.id}-copy`;
    let n = 2;
    while (existing.has(newId)) newId = `${selected.id}-copy-${n++}`;
    await mutate(
      () =>
        createProfile(projectRoot, newId, {
          provider: selected.provider,
          label: newId,
          model: selected.model ?? undefined,
          power: selected.power ?? undefined,
        }),
      `Duplicated -> ${newId}.`,
    );
  }

  async function create() {
    const provider = selected?.provider ?? Object.keys(config?.providers ?? {})[0];
    if (!provider) {
      onToast("err", "No provider configured. Add one first (vibe provider setup).");
      return;
    }
    const existing = new Set(profiles.map((p) => p.id));
    let newId = `${provider}-2`;
    let n = 2;
    while (existing.has(newId)) newId = `${provider}-${++n}`;
    await mutate(
      () => createProfile(projectRoot, newId, { provider, label: newId }),
      `Created ${newId} (provider ${provider}).`,
    );
  }

  async function confirmDelete() {
    const id = pendingDelete;
    setPendingDelete(null);
    if (!id) return;
    await mutate(() => deleteProfile(projectRoot, id), `Deleted ${id}.`);
  }

  useInput(
    (input, key) => {
      if (!active) return;
      if (pendingDelete) {
        if (input === "y" || input === "Y") void confirmDelete();
        else setPendingDelete(null);
        return;
      }
      if (key.upArrow || input === "k") {
        setSelectedIndex(Math.max(0, idx - 1));
        return;
      }
      if (key.downArrow || input === "j") {
        setSelectedIndex(Math.min(profiles.length - 1, idx + 1));
        return;
      }
      if (input === "e") return void cycleEffort(1);
      if (input === "E") return void cycleEffort(-1);
      if (input === "m") return void cycleModel(1);
      if (input === "M") return void cycleModel(-1);
      if (input === "n") return void create();
      if (input === "d") return void duplicate();
      if (input === "r") return void probeCatalog();
      if (input === "x" && selected) {
        setPendingDelete(selected.id);
        return;
      }
    },
    { isActive: active },
  );

  if (!config) return <Text dimColor>loading project config…</Text>;
  if (profiles.length === 0) {
    return (
      <Box flexDirection="column">
        <Text dimColor>No profiles yet.</Text>
        <Text dimColor>
          Press <Text color={ACCENT}>n</Text> to create one for a configured provider.
        </Text>
      </Box>
    );
  }

  const levels = selected ? capsFor(config, selected.provider, catalog).powerLevels : [];
  const usedBy = selected ? usage.get(selected.id) ?? [] : [];
  const selectedProviderConfig = selected ? config.providers[selected.provider] : undefined;
  const selectedSource =
    selected && selectedProviderConfig
      ? providerOverlaySource(overlay, selected.provider, selectedProviderConfig)
      : "built-in";

  return (
    <Box flexDirection="column">
      <Text bold color={ACCENT_BRIGHT}>
        PROFILES <Text dimColor>  ({profiles.length})  presets your crew runs on</Text>
      </Text>
      {overlayActive ? (
        <Text dimColor>
          catalog: <Text color={ACCENT}>overlay active</Text> · .vibestrate/providers-catalog.yml
          {"  "}(vibe provider catalog)
        </Text>
      ) : null}
      <Box marginTop={1} flexDirection="row" gap={2}>
        <Box flexDirection="column" minWidth={30}>
          {profiles.map((p, i) => {
            const used = usage.get(p.id)?.length ?? 0;
            return (
              <Text key={p.id} wrap="truncate-end">
                <SelectionMark selected={i === idx} />
                <Text bold={i === idx} color={i === idx ? ACCENT : undefined}>
                  {p.id}
                </Text>
                <Text dimColor>  @{p.provider}{used ? ` ·${used}` : ""}</Text>
              </Text>
            );
          })}
        </Box>
        {selected ? (
          <Box flexDirection="column" flexGrow={1}>
            <Text bold color={ACCENT}>{selected.id}</Text>
            <Box marginTop={1} flexDirection="column">
              <KV label="provider" value={selected.provider} />
              <KV label="model" value={selected.model ?? "(provider default)"} />
              <KV
                label="effort"
                value={
                  levels.length === 0
                    ? "(none for this provider)"
                    : `${selected.power ?? "(unset)"}   [${levels.join(" ")}]`
                }
              />
              <KV
                label="used by"
                value={
                  usedBy.length
                    ? usedBy.map((u: { crewId: string; roleId: string }) => `${u.crewId}/${u.roleId}`).join(", ")
                    : "unused"
                }
              />
              <KV label="catalog" value={selectedSource} />
            </Box>
            {pendingDelete === selected.id ? (
              <Box marginTop={1}>
                <Text color="yellow">
                  delete {selected.id}? {usedBy.length ? `(used by ${usedBy.length} role(s)) ` : ""}
                  <Text color={ACCENT}>y</Text>/<Text color={ACCENT}>n</Text>
                </Text>
              </Box>
            ) : (
              <Box marginTop={1}>
                <Text dimColor>
                  <Text color={ACCENT}>e/E</Text> effort · <Text color={ACCENT}>m/M</Text> model ·{" "}
                  <Text color={ACCENT}>n</Text> new · <Text color={ACCENT}>d</Text> dup ·{" "}
                  <Text color={ACCENT}>x</Text> del · <Text color={ACCENT}>r</Text> refresh
                </Text>
              </Box>
            )}
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}

const LABEL_WIDTH = 10;
function KV({ label, value }: { label: string; value: string }) {
  return (
    <Text wrap="truncate-end">
      <Text dimColor>{label.padEnd(LABEL_WIDTH)}</Text>
      <Text>{value}</Text>
    </Text>
  );
}
