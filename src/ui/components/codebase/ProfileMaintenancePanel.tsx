import { useEffect, useState } from "react";
import { ApiError, api } from "../../lib/api.js";
import type {
  ProfileMigrationAudit,
  ProfileMigrationPreview,
  ProfileRenamePreview,
  ValidationProfileSummary,
  ValidationProfileUsageEntry,
} from "../../lib/types.js";
import { Button } from "../design/Button.js";

const FIELD =
  "mono rounded-[10px] border border-[color:var(--line-strong)] bg-coal-800 px-2 py-1 text-[11px] text-chalk-100 placeholder:text-chalk-400 outline-none focus:border-violet-soft/50";

/**
 * Lightweight maintenance panel for validation profiles. Reads:
 *   - the live profile list (default + named)
 *   - usage telemetry (.vibestrate/validation-profile-usage.json)
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
          `This rewrites .vibestrate/project.yml. The profile's ${renamePreview.preservedCommandCount} command(s)` +
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
    <div className="space-y-4 text-[12px]">
      <header>
        <h2 className="text-[18px] font-bold text-violet-vivid">
          Validation profiles
        </h2>
        <p className="mt-1 text-[11px] text-chalk-300">
          Migrations update future suggestion / bundle assignments only.
          Historical validation results keep the profile metadata they ran
          with.
        </p>
      </header>

      {error ? (
        <div className="rounded-[10px] border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-rose-300">
          {error}
        </div>
      ) : null}
      {info ? (
        <div className="rounded-[10px] border border-emerald/30 bg-emerald/10 px-3 py-1.5 text-emerald">
          {info}
        </div>
      ) : null}

      <section>
        <h3 className="text-[12px] font-semibold text-chalk-300">Profiles</h3>
        <ul className="mt-2 space-y-1">
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
                className="rounded-[12px] border border-[color:var(--line)] bg-coal-600 px-3 py-2"
              >
                <div className="flex items-baseline gap-2">
                  <span className="font-medium text-chalk-100">
                    {p.profileName}
                  </span>
                  <span className="mono text-[10px] text-chalk-400">
                    {p.source}
                  </span>
                  {p.hasCommands ? (
                    <span className="mono text-[10px] text-chalk-400">
                      {p.commands.length} command{p.commands.length === 1 ? "" : "s"}
                    </span>
                  ) : (
                    <span className="mono text-[10px] text-amber-soft">
                      empty
                    </span>
                  )}
                  {u ? (
                    <span className="mono ml-auto text-[10px] text-chalk-400">
                      {u.totalUses} use{u.totalUses === 1 ? "" : "s"} ·{" "}
                      last {u.lastUsedAt ?? "-"}
                    </span>
                  ) : (
                    <span className="mono ml-auto text-[10px] text-chalk-400">
                      never used
                    </span>
                  )}
                </div>
                {p.description ? (
                  <p className="text-[10.5px] text-chalk-300">
                    {p.description}
                  </p>
                ) : null}
                <p className="mono mt-0.5 truncate text-[10px] text-chalk-400">
                  {p.commands.length === 0
                    ? "(no commands)"
                    : `→ ${p.commands.join("  ·  ")}`}
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-[16px] border border-[color:var(--line)] bg-coal-600 p-4">
        <h3 className="text-[12px] font-semibold text-chalk-300">
          Migrate profile references
        </h3>
        <p className="mt-0.5 text-[10.5px] text-chalk-300">
          Preview first. Apply requires confirmation.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-[10.5px] text-chalk-300">
            from
            <input
              type="text"
              value={fromProfile}
              onChange={(e) => {
                setFromProfile(e.target.value);
                setPreview(null);
              }}
              placeholder="quikc"
              className={FIELD}
            />
          </label>
          <label className="flex items-center gap-1 text-[10.5px] text-chalk-300">
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
              className={`${FIELD} disabled:opacity-50`}
            />
          </label>
          <label className="flex items-center gap-1 text-[10.5px] text-chalk-300">
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
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void doPreview()}
            disabled={busy}
          >
            Preview changes
          </Button>
          {preview &&
          (preview.affectedSuggestions.length > 0 ||
            preview.affectedBundles.length > 0) ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => void doApply()}
              disabled={busy}
            >
              Apply migration
            </Button>
          ) : null}
        </div>
        {preview ? (
          <div className="mt-2 rounded-[10px] border border-[color:var(--line)] bg-coal-500 px-3 py-2">
            <div className="mono text-[10.5px] text-chalk-300">
              {preview.fromProfile} →{" "}
              {preview.toProfile ?? "default (clear)"} · scanned{" "}
              {preview.scannedRuns} run(s)
            </div>
            <div className="mono mt-1 text-[10.5px] text-chalk-300">
              suggestions: {preview.affectedSuggestions.length} · bundles:{" "}
              {preview.affectedBundles.length} · malformed:{" "}
              {preview.malformedFiles.length}
            </div>
            {preview.affectedSuggestions.length === 0 &&
            preview.affectedBundles.length === 0 ? (
              <p className="text-chalk-400">
                Nothing to migrate - no records reference “
                {preview.fromProfile}” in the scanned runs.
              </p>
            ) : (
              <ul className="mono mt-1 max-h-32 overflow-y-auto text-[10px] text-chalk-300">
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

      <section className="rounded-[16px] border border-[color:var(--line)] bg-coal-600 p-4">
        <h3 className="text-[12px] font-semibold text-chalk-300">
          Rename profile
        </h3>
        <p className="mt-0.5 text-[10.5px] text-chalk-300">
          Renames a profile key in{" "}
          <code className="mono rounded-[6px] bg-coal-500 px-1 py-0.5 text-chalk-200">
            commands.validationProfiles
          </code>{" "}
          and migrates every matching suggestion/bundle reference atomically.
          Preview first; apply requires confirmation.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-[10.5px] text-chalk-300">
            from
            <input
              type="text"
              value={renameFrom}
              onChange={(e) => {
                setRenameFrom(e.target.value);
                setRenamePreview(null);
              }}
              placeholder="quikc"
              className={FIELD}
            />
          </label>
          <label className="flex items-center gap-1 text-[10.5px] text-chalk-300">
            to
            <input
              type="text"
              value={renameTo}
              onChange={(e) => {
                setRenameTo(e.target.value);
                setRenamePreview(null);
              }}
              placeholder="quick"
              className={FIELD}
            />
          </label>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void doRenamePreview()}
            disabled={busy}
          >
            Preview rename
          </Button>
          {renamePreview ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => void doRenameApply()}
              disabled={busy}
            >
              Apply rename
            </Button>
          ) : null}
        </div>
        {renamePreview ? (
          <div className="mt-2 rounded-[10px] border border-[color:var(--line)] bg-coal-500 px-3 py-2">
            <div className="mono text-[10.5px] text-chalk-300">
              {renamePreview.fromProfile} → {renamePreview.toProfile} · scanned{" "}
              {renamePreview.scannedRuns} run(s)
            </div>
            <div className="mono mt-1 text-[10.5px] text-chalk-300">
              preserves {renamePreview.preservedCommandCount} command
              {renamePreview.preservedCommandCount === 1 ? "" : "s"}
              {renamePreview.preservedDescription
                ? ` · description "${renamePreview.preservedDescription}"`
                : ""}
            </div>
            <div className="mono mt-1 text-[10.5px] text-chalk-300">
              references: {renamePreview.affectedSuggestions.length} suggestion(s),{" "}
              {renamePreview.affectedBundles.length} bundle(s),{" "}
              {renamePreview.malformedFiles.length} malformed
            </div>
            {renamePreview.warnings.length > 0 ? (
              <ul className="mt-1 text-[10.5px] text-amber-soft">
                {renamePreview.warnings.map((w) => (
                  <li key={w}>! {w}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </section>

      <section>
        <h3 className="text-[12px] font-semibold text-chalk-300">
          Migration history
        </h3>
        <p className="mt-0.5 text-[10.5px] text-chalk-300">
          Every rename/migrate/clear writes a single audit JSON under{" "}
          <code className="mono rounded-[6px] bg-coal-500 px-1 py-0.5 text-chalk-200">
            .vibestrate/validation-profile-migrations/
          </code>
          .
        </p>
        {history.length === 0 ? (
          <p className="mt-1 text-[10.5px] text-chalk-400">
            No migrations recorded yet.
          </p>
        ) : (
          <ul className="mono mt-2 max-h-48 space-y-1 overflow-y-auto text-[10.5px]">
            {history.map((m) => {
              const kind = m.kind ?? "migrate_references";
              const tagClass =
                kind === "rename_profile"
                  ? "text-violet-soft"
                  : kind === "clear_references"
                    ? "text-amber-soft"
                    : "text-chalk-400";
              const target = m.toProfile ?? "default";
              const total =
                m.affectedSuggestions.length + m.affectedBundles.length;
              const stamp = m.appliedAt ?? m.createdAt;
              return (
                <li
                  key={m.id}
                  className="rounded-[12px] border border-[color:var(--line)] bg-coal-600 px-3 py-2"
                >
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className={tagClass}>
                      {kind.replace("_", " ")}
                    </span>
                    <span className="text-chalk-100">
                      {m.fromProfile} → {target}
                    </span>
                    <span className="text-chalk-400">
                      {total} reference{total === 1 ? "" : "s"}
                    </span>
                    <span className="ml-auto text-[10px] text-chalk-400">
                      {stamp}
                    </span>
                  </div>
                  <div className="text-[10px] text-chalk-400">
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
