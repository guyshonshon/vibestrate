import { useEffect, useState } from "react";
import { ApiError, api } from "../../lib/api.js";
import type {
  ProfileMigrationAudit,
  ProfileMigrationPreview,
  ProfileRenamePreview,
  ValidationProfileSummary,
  ValidationProfileUsageEntry,
} from "../../lib/types.js";

/**
 * Lightweight maintenance panel for validation profiles. Reads:
 *   - the live profile list (default + named)
 *   - usage telemetry (.amaco/validation-profile-usage.json)
 *   - per-row staleness via a profile-migration preview pass
 *
 * Lets the user dry-run a `fromProfile → toProfile (or clear)` migration
 * and then explicitly Apply it after a confirm prompt. Writes nothing
 * outside the user-triggered Apply call.
 */
export function ProfileMaintenancePanel() {
  const [profiles, setProfiles] = useState<ValidationProfileSummary[]>([]);
  const [usage, setUsage] = useState<ValidationProfileUsageEntry[]>([]);
  const [history, setHistory] = useState<ProfileMigrationAudit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Reference-migration form state
  const [fromProfile, setFromProfile] = useState("");
  const [toProfile, setToProfile] = useState<string>("");
  const [clear, setClear] = useState(false);
  const [preview, setPreview] = useState<ProfileMigrationPreview | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Rename form state
  const [renameFrom, setRenameFrom] = useState("");
  const [renameTo, setRenameTo] = useState("");
  const [renamePreview, setRenamePreview] =
    useState<ProfileRenamePreview | null>(null);

  async function load(): Promise<void> {
    try {
      const [p, u, h] = await Promise.all([
        api.listValidationProfiles(),
        api.getProfileUsage(),
        api.listProfileMigrations(),
      ]);
      setProfiles(p);
      setUsage(u.entries);
      // newest first
      setHistory(
        [...h].sort((a, b) =>
          (b.appliedAt ?? b.createdAt).localeCompare(a.appliedAt ?? a.createdAt),
        ),
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const usageFor = (
    profileName: string,
    source: "default" | "named",
  ): ValidationProfileUsageEntry | undefined =>
    usage.find((e) => e.profileName === profileName && e.source === source);

  async function doPreview(): Promise<void> {
    if (!fromProfile.trim()) {
      setError("Pick a fromProfile (this is the name you want to migrate away from).");
      return;
    }
    setBusy(true);
    setInfo(null);
    setError(null);
    try {
      const r = await api.previewProfileMigration({
        fromProfile: fromProfile.trim(),
        toProfile: clear ? null : toProfile.trim() || null,
      });
      setPreview(r.preview);
    } catch (err) {
      setError(messageFor(err));
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  async function doRenamePreview(): Promise<void> {
    if (!renameFrom.trim() || !renameTo.trim()) {
      setError("Both fromProfile and toProfile are required.");
      return;
    }
    setBusy(true);
    setInfo(null);
    setError(null);
    try {
      const r = await api.previewProfileRename({
        fromProfile: renameFrom.trim(),
        toProfile: renameTo.trim(),
      });
      setRenamePreview(r.preview);
    } catch (err) {
      setError(messageFor(err));
      setRenamePreview(null);
    } finally {
      setBusy(false);
    }
  }

  async function doRenameApply(): Promise<void> {
    if (!renamePreview) return;
    const total =
      renamePreview.affectedSuggestions.length +
      renamePreview.affectedBundles.length;
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `Rename profile "${renamePreview.fromProfile}" → "${renamePreview.toProfile}" in project.yml AND migrate ${total} reference(s)?\n\n` +
          `This rewrites .amaco/project.yml. The profile's ${renamePreview.preservedCommandCount} command(s)` +
          (renamePreview.preservedDescription
            ? ` and description "${renamePreview.preservedDescription}"`
            : "") +
          ` will be preserved. Historical validation results will NOT be rewritten.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api.applyProfileRename({
        fromProfile: renamePreview.fromProfile,
        toProfile: renamePreview.toProfile,
      });
      setInfo(`Renamed. Audit: ${r.audit.id}`);
      setRenamePreview(null);
      setRenameFrom("");
      setRenameTo("");
      await load();
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  async function doApply(): Promise<void> {
    if (!preview) return;
    const target = preview.toProfile ?? "default (clear)";
    const total =
      preview.affectedSuggestions.length + preview.affectedBundles.length;
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `Migrate ${total} record(s) from "${preview.fromProfile}" → "${target}"?\n\n` +
          `Historical validation results are NOT rewritten. This only updates suggestion and bundle profile assignments for future validation runs.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api.applyProfileMigration({
        fromProfile: preview.fromProfile,
        toProfile: preview.toProfile,
      });
      setInfo(`Applied. Audit: ${r.audit.id}`);
      setPreview(null);
      setFromProfile("");
      setToProfile("");
      setClear(false);
      await load();
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 p-4 text-[12px]">
      <header>
        <h2 className="text-[13px] font-medium text-amaco-fg">
          Validation profiles
        </h2>
        <p className="mt-0.5 text-[10.5px] text-amaco-fg-muted">
          Migrations update future suggestion / bundle assignments only.
          Historical validation results keep the profile metadata they ran
          with.
        </p>
      </header>

      {error ? (
        <div className="rounded border border-amaco-fail/40 bg-amaco-fail/10 px-2 py-1 text-amaco-fail">
          {error}
        </div>
      ) : null}
      {info ? (
        <div className="rounded border border-amaco-success/40 bg-amaco-success/10 px-2 py-1 text-amaco-success">
          {info}
        </div>
      ) : null}

      <section>
        <h3 className="text-[11px] uppercase tracking-[0.1em] text-amaco-fg-muted">
          Profiles
        </h3>
        <ul className="mt-1 space-y-1">
          {profiles.map((p) => {
            // Profile list only carries default / named; usage telemetry
            // uses the same two values, so coerce safely.
            const u = usageFor(
              p.profileName,
              p.source === "default" ? "default" : "named",
            );
            return (
              <li
                key={`${p.source}:${p.profileName}`}
                className="rounded border border-amaco-border bg-amaco-panel-2 px-2 py-1.5"
              >
                <div className="flex items-baseline gap-2">
                  <span className="font-medium">{p.profileName}</span>
                  <span className="amaco-mono text-[10px] text-amaco-fg-muted">
                    {p.source}
                  </span>
                  {p.hasCommands ? (
                    <span className="amaco-mono text-[10px] text-amaco-fg-muted">
                      {p.commands.length} command{p.commands.length === 1 ? "" : "s"}
                    </span>
                  ) : (
                    <span className="amaco-mono text-[10px] text-amaco-warn">
                      empty
                    </span>
                  )}
                  {u ? (
                    <span className="amaco-mono ml-auto text-[10px] text-amaco-fg-muted">
                      {u.totalUses} use{u.totalUses === 1 ? "" : "s"} ·{" "}
                      last {u.lastUsedAt ?? "—"}
                    </span>
                  ) : (
                    <span className="amaco-mono ml-auto text-[10px] text-amaco-fg-muted">
                      never used
                    </span>
                  )}
                </div>
                {p.description ? (
                  <p className="text-[10.5px] text-amaco-fg-dim">
                    {p.description}
                  </p>
                ) : null}
                <p className="amaco-mono mt-0.5 truncate text-[10px] text-amaco-fg-muted">
                  {p.commands.length === 0
                    ? "(no commands)"
                    : `→ ${p.commands.join("  ·  ")}`}
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded border border-amaco-border bg-amaco-panel-2 p-2">
        <h3 className="text-[11px] uppercase tracking-[0.1em] text-amaco-fg-muted">
          Migrate profile references
        </h3>
        <p className="text-[10.5px] text-amaco-fg-muted">
          Preview first. Apply requires confirmation.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-[10.5px]">
            from
            <input
              type="text"
              value={fromProfile}
              onChange={(e) => {
                setFromProfile(e.target.value);
                setPreview(null);
              }}
              placeholder="quikc"
              className="amaco-mono rounded border border-amaco-border bg-amaco-panel px-1.5 py-0.5 text-[11px]"
            />
          </label>
          <label className="flex items-center gap-1 text-[10.5px]">
            to
            <input
              type="text"
              value={toProfile}
              onChange={(e) => {
                setToProfile(e.target.value);
                setPreview(null);
              }}
              placeholder="quick"
              disabled={clear}
              className="amaco-mono rounded border border-amaco-border bg-amaco-panel px-1.5 py-0.5 text-[11px] disabled:opacity-50"
            />
          </label>
          <label className="flex items-center gap-1 text-[10.5px]">
            <input
              type="checkbox"
              checked={clear}
              onChange={(e) => {
                setClear(e.target.checked);
                setPreview(null);
              }}
            />
            Clear to default
          </label>
          <button
            type="button"
            onClick={() => void doPreview()}
            disabled={busy}
            className="rounded border border-amaco-border px-2 py-0.5 text-[11px] text-amaco-fg-dim hover:bg-amaco-panel"
          >
            Preview changes
          </button>
          {preview &&
          (preview.affectedSuggestions.length > 0 ||
            preview.affectedBundles.length > 0) ? (
            <button
              type="button"
              onClick={() => void doApply()}
              disabled={busy}
              className="rounded border border-amaco-accent/40 bg-amaco-accent-soft/30 px-2 py-0.5 text-[11px] text-amaco-fg hover:bg-amaco-accent-soft/50"
            >
              Apply migration
            </button>
          ) : null}
        </div>
        {preview ? (
          <div className="mt-2 rounded border border-amaco-border bg-amaco-panel px-2 py-1.5">
            <div className="amaco-mono text-[10.5px] text-amaco-fg-dim">
              {preview.fromProfile} →{" "}
              {preview.toProfile ?? "default (clear)"} · scanned{" "}
              {preview.scannedRuns} run(s)
            </div>
            <div className="amaco-mono mt-1 text-[10.5px]">
              suggestions: {preview.affectedSuggestions.length} · bundles:{" "}
              {preview.affectedBundles.length} · malformed:{" "}
              {preview.malformedFiles.length}
            </div>
            {preview.affectedSuggestions.length === 0 &&
            preview.affectedBundles.length === 0 ? (
              <p className="text-amaco-fg-muted">
                Nothing to migrate — no records reference “
                {preview.fromProfile}” in the scanned runs.
              </p>
            ) : (
              <ul className="amaco-mono mt-1 max-h-32 overflow-y-auto text-[10px] text-amaco-fg-dim">
                {[
                  ...preview.affectedSuggestions.map(
                    (r) => `suggestion ${r.runId}/${r.id}`,
                  ),
                  ...preview.affectedBundles.map(
                    (r) => `bundle ${r.runId}/${r.id}`,
                  ),
                ]
                  .slice(0, 50)
                  .map((line) => (
                    <li key={line}>{line}</li>
                  ))}
              </ul>
            )}
          </div>
        ) : null}
      </section>

      <section className="rounded border border-amaco-border bg-amaco-panel-2 p-2">
        <h3 className="text-[11px] uppercase tracking-[0.1em] text-amaco-fg-muted">
          Rename profile
        </h3>
        <p className="text-[10.5px] text-amaco-fg-muted">
          Renames a profile key in <code>commands.validationProfiles</code> and
          migrates every matching suggestion/bundle reference atomically.
          Preview first; apply requires confirmation.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-[10.5px]">
            from
            <input
              type="text"
              value={renameFrom}
              onChange={(e) => {
                setRenameFrom(e.target.value);
                setRenamePreview(null);
              }}
              placeholder="quikc"
              className="amaco-mono rounded border border-amaco-border bg-amaco-panel px-1.5 py-0.5 text-[11px]"
            />
          </label>
          <label className="flex items-center gap-1 text-[10.5px]">
            to
            <input
              type="text"
              value={renameTo}
              onChange={(e) => {
                setRenameTo(e.target.value);
                setRenamePreview(null);
              }}
              placeholder="quick"
              className="amaco-mono rounded border border-amaco-border bg-amaco-panel px-1.5 py-0.5 text-[11px]"
            />
          </label>
          <button
            type="button"
            onClick={() => void doRenamePreview()}
            disabled={busy}
            className="rounded border border-amaco-border px-2 py-0.5 text-[11px] text-amaco-fg-dim hover:bg-amaco-panel"
          >
            Preview rename
          </button>
          {renamePreview ? (
            <button
              type="button"
              onClick={() => void doRenameApply()}
              disabled={busy}
              className="rounded border border-amaco-accent/40 bg-amaco-accent-soft/30 px-2 py-0.5 text-[11px] text-amaco-fg hover:bg-amaco-accent-soft/50"
            >
              Apply rename
            </button>
          ) : null}
        </div>
        {renamePreview ? (
          <div className="mt-2 rounded border border-amaco-border bg-amaco-panel px-2 py-1.5">
            <div className="amaco-mono text-[10.5px] text-amaco-fg-dim">
              {renamePreview.fromProfile} → {renamePreview.toProfile} · scanned{" "}
              {renamePreview.scannedRuns} run(s)
            </div>
            <div className="amaco-mono mt-1 text-[10.5px]">
              preserves {renamePreview.preservedCommandCount} command
              {renamePreview.preservedCommandCount === 1 ? "" : "s"}
              {renamePreview.preservedDescription
                ? ` · description "${renamePreview.preservedDescription}"`
                : ""}
            </div>
            <div className="amaco-mono mt-1 text-[10.5px]">
              references: {renamePreview.affectedSuggestions.length} suggestion(s),{" "}
              {renamePreview.affectedBundles.length} bundle(s),{" "}
              {renamePreview.malformedFiles.length} malformed
            </div>
            {renamePreview.warnings.length > 0 ? (
              <ul className="mt-1 text-[10.5px] text-amaco-warn">
                {renamePreview.warnings.map((w) => (
                  <li key={w}>! {w}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </section>

      <section>
        <h3 className="text-[11px] uppercase tracking-[0.1em] text-amaco-fg-muted">
          Migration history
        </h3>
        <p className="text-[10.5px] text-amaco-fg-muted">
          Every rename/migrate/clear writes a single audit JSON under{" "}
          <code>.amaco/validation-profile-migrations/</code>.
        </p>
        {history.length === 0 ? (
          <p className="mt-1 text-[10.5px] text-amaco-fg-muted">
            No migrations recorded yet.
          </p>
        ) : (
          <ul className="amaco-mono mt-1 max-h-48 space-y-1 overflow-y-auto text-[10.5px]">
            {history.map((m) => {
              const kind = m.kind ?? "migrate_references";
              const tagClass =
                kind === "rename_profile"
                  ? "text-amaco-accent"
                  : kind === "clear_references"
                    ? "text-amaco-warn"
                    : "text-amaco-fg-muted";
              const target = m.toProfile ?? "default";
              const total =
                m.affectedSuggestions.length + m.affectedBundles.length;
              const stamp = m.appliedAt ?? m.createdAt;
              return (
                <li
                  key={m.id}
                  className="rounded border border-amaco-border bg-amaco-panel-2 px-2 py-1"
                >
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className={tagClass}>
                      {kind.replace("_", " ")}
                    </span>
                    <span className="text-amaco-fg">
                      {m.fromProfile} → {target}
                    </span>
                    <span className="text-amaco-fg-muted">
                      {total} reference{total === 1 ? "" : "s"}
                    </span>
                    <span className="ml-auto text-[10px] text-amaco-fg-muted">
                      {stamp}
                    </span>
                  </div>
                  <div className="text-[10px] text-amaco-fg-muted">
                    {m.id}
                    {m.renamedProfile &&
                    typeof m.preservedCommandCount === "number"
                      ? ` · preserved ${m.preservedCommandCount} command(s)`
                      : ""}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function messageFor(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return err instanceof Error ? err.message : String(err);
}
