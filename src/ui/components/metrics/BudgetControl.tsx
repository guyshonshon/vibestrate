import { useEffect, useState, type ReactNode } from "react";
import { Pencil } from "lucide-react";
import { api, type BudgetSettings } from "../../lib/api.js";
import { Button } from "../design/Button.js";
import { Select } from "../design/Select.js";
import { cn } from "../design/cn.js";
import { Section } from "../layout/PageShell.js";
import { CARD, CSS } from "./panelChrome.js";

// Daily spend cap control. Self-contained: owns its budget fetch and form
// state, independent of the page's overview polling.

const CAP_ACTIONS: BudgetSettings["capAction"][] = [
  "stop",
  "downgrade-model",
  "reduce-effort",
];

const CAP_ACTION_LABEL: Record<BudgetSettings["capAction"], string> = {
  stop: "Stop the run",
  "downgrade-model": "Downgrade model",
  "reduce-effort": "Reduce effort",
};

export function BudgetControl() {
  const [budget, setBudget] = useState<BudgetSettings | null>(null);
  const [today, setToday] = useState(0);
  const [editing, setEditing] = useState(false);
  const [capInput, setCapInput] = useState("");
  const [action, setAction] = useState<BudgetSettings["capAction"]>("stop");
  const [fallback, setFallback] = useState("");
  const [turnsRun, setTurnsRun] = useState("");
  const [timeRun, setTimeRun] = useState("");
  const [turnsDay, setTurnsDay] = useState("");
  const [timeDay, setTimeDay] = useState("");
  const [onLimit, setOnLimit] = useState<"stop" | "pause">("stop");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const hydrate = (b: BudgetSettings) => {
    setCapInput(b.spendCapDailyUsd != null ? String(b.spendCapDailyUsd) : "");
    setAction(b.capAction);
    setFallback(b.fallbackProfile ?? "");
    const s = (n: number | null | undefined) => (n != null ? String(n) : "");
    setTurnsRun(s(b.maxTurnsPerRun));
    setTimeRun(s(b.maxWallClockMinPerRun));
    setTurnsDay(s(b.maxTurnsPerDay));
    setTimeDay(s(b.maxWallClockMinPerDay));
    setOnLimit(b.onLimit ?? "stop");
  };

  useEffect(() => {
    void api
      .getBudget()
      .then((r) => {
        setBudget(r.budget);
        setToday(r.todaySpendUsd);
        hydrate(r.budget);
      })
      .catch(() => {});
  }, []);

  const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));

  async function saveAll() {
    setSaving(true);
    setMsg(null);
    try {
      const r = await api.updateBudget({
        spendCapDailyUsd: capInput.trim() === "" ? null : Number(capInput),
        capAction: action,
        fallbackProfile: fallback.trim() === "" ? null : fallback.trim(),
        maxTurnsPerRun: numOrNull(turnsRun),
        maxWallClockMinPerRun: numOrNull(timeRun),
        maxTurnsPerDay: numOrNull(turnsDay),
        maxWallClockMinPerDay: numOrNull(timeDay),
        onLimit,
      });
      setBudget(r.budget);
      hydrate(r.budget);
      setEditing(false);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const startEdit = () => {
    if (budget) hydrate(budget);
    setMsg(null);
    setEditing(true);
  };
  const cancelEdit = () => {
    if (budget) hydrate(budget);
    setMsg(null);
    setEditing(false);
  };

  const cap = budget?.spendCapDailyUsd ?? null;
  const pct =
    cap && cap > 0 ? Math.min(100, Math.round((today / cap) * 100)) : 0;
  const meterTone = pct >= 90 ? CSS.amber : CSS.violet;

  return (
    <Section
      title="Spend cap and ceilings"
      action={
        !editing && budget ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={startEdit}
            iconLeft={<Pencil className="h-3.5 w-3.5" strokeWidth={1.9} />}
          >
            Edit
          </Button>
        ) : undefined
      }
    >
      <div className={CARD}>
        {editing ? (
          <BudgetForm
            capInput={capInput}
            setCapInput={setCapInput}
            action={action}
            setAction={setAction}
            fallback={fallback}
            setFallback={setFallback}
            turnsRun={turnsRun}
            setTurnsRun={setTurnsRun}
            timeRun={timeRun}
            setTimeRun={setTimeRun}
            turnsDay={turnsDay}
            setTurnsDay={setTurnsDay}
            timeDay={timeDay}
            setTimeDay={setTimeDay}
            onLimit={onLimit}
            setOnLimit={setOnLimit}
            saving={saving}
            msg={msg}
            onSave={() => void saveAll()}
            onCancel={cancelEdit}
          />
        ) : budget ? (
          <BudgetSummary
            budget={budget}
            cap={cap}
            today={today}
            pct={pct}
            meterTone={meterTone}
            onSetCap={startEdit}
          />
        ) : (
          <div className="h-24 animate-none rounded-[12px] bg-coal-500/30" />
        )}
      </div>
    </Section>
  );
}

// Read-only default: a prominent cap meter plus the rest of the policy as quiet
// facts. Editing lives behind the Edit reveal (BudgetForm).
function BudgetSummary({
  budget,
  cap,
  today,
  pct,
  meterTone,
  onSetCap,
}: {
  budget: BudgetSettings;
  cap: number | null;
  today: number;
  pct: number;
  meterTone: string;
  onSetCap: () => void;
}) {
  const facts: { label: string; value: string; muted: boolean }[] = [
    {
      label: "at cap",
      value: cap ? CAP_ACTION_LABEL[budget.capAction] : "-",
      muted: !cap,
    },
    {
      label: "turns/run",
      value: budget.maxTurnsPerRun != null ? String(budget.maxTurnsPerRun) : "off",
      muted: budget.maxTurnsPerRun == null,
    },
    {
      label: "min/run",
      value:
        budget.maxWallClockMinPerRun != null
          ? String(budget.maxWallClockMinPerRun)
          : "off",
      muted: budget.maxWallClockMinPerRun == null,
    },
    {
      label: "turns/day",
      value: budget.maxTurnsPerDay != null ? String(budget.maxTurnsPerDay) : "off",
      muted: budget.maxTurnsPerDay == null,
    },
    {
      label: "min/day",
      value:
        budget.maxWallClockMinPerDay != null
          ? String(budget.maxWallClockMinPerDay)
          : "off",
      muted: budget.maxWallClockMinPerDay == null,
    },
    {
      label: "on hit",
      value: budget.onLimit ?? "stop",
      muted: false,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {cap ? (
        <div>
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11.5px] font-semibold text-chalk-200">
                Today&apos;s spend
              </div>
              <div className="mt-1 font-display num-tabular text-[30px] font-bold leading-none tracking-tight text-chalk-100">
                ${today.toFixed(2)}
                <span className="ml-1.5 text-[13px] font-semibold text-chalk-400">
                  / ${cap.toFixed(0)} daily cap
                </span>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div
                className="num-tabular font-display text-[22px] font-bold leading-none"
                style={{ color: meterTone }}
              >
                {pct}%
              </div>
              <div className="mt-1 text-[10.5px] font-medium text-violet-soft">
                of cap used
              </div>
            </div>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-coal-500">
            <div
              className="h-full rounded-full transition-[width]"
              style={{ width: `${Math.max(pct, 1.5)}%`, background: meterTone }}
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-2.5 rounded-[14px] border border-[color:var(--line-soft)] bg-coal-500/40 px-4 py-4">
          <span className="text-[12.5px] text-chalk-300">
            No daily spend cap set. Add one to auto-throttle or halt runs before
            they overspend.
          </span>
          <Button variant="secondary" size="sm" onClick={onSetCap}>
            Set a daily cap
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-[color:var(--line-soft)] pt-4">
        {facts.map((f) => (
          <div
            key={f.label}
            className="flex min-w-[68px] flex-col gap-0.5 rounded-[10px] border border-[color:var(--line-soft)] bg-coal-500/50 px-2.5 py-1.5"
          >
            <span
              className={cn(
                "num-tabular text-[13px] font-bold leading-none",
                f.muted ? "text-chalk-400" : "text-chalk-100",
              )}
            >
              {f.value}
            </span>
            <span className="text-[10.5px] font-medium text-violet-soft">
              {f.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const FIELD_CLS =
  "w-full rounded-[10px] border border-[color:var(--line-strong)] bg-coal-800 px-2.5 py-1.5 text-[13px] text-chalk-100 outline-none placeholder:text-chalk-400 focus:border-violet-soft/50";

function BudgetForm(props: {
  capInput: string;
  setCapInput: (v: string) => void;
  action: BudgetSettings["capAction"];
  setAction: (v: BudgetSettings["capAction"]) => void;
  fallback: string;
  setFallback: (v: string) => void;
  turnsRun: string;
  setTurnsRun: (v: string) => void;
  timeRun: string;
  setTimeRun: (v: string) => void;
  turnsDay: string;
  setTurnsDay: (v: string) => void;
  timeDay: string;
  setTimeDay: (v: string) => void;
  onLimit: "stop" | "pause";
  setOnLimit: (v: "stop" | "pause") => void;
  saving: boolean;
  msg: string | null;
  onSave: () => void;
  onCancel: () => void;
}) {
  const ceilings = [
    ["turns/run", props.turnsRun, props.setTurnsRun],
    ["min/run", props.timeRun, props.setTimeRun],
    ["turns/day", props.turnsDay, props.setTurnsDay],
    ["min/day", props.timeDay, props.setTimeDay],
  ] as const;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="mb-2.5 text-[12.5px] font-semibold text-violet-soft">
          Daily cap
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <FieldLabel label="Cap ($/day)">
            <div className="flex items-center gap-1.5">
              <span className="text-chalk-400">$</span>
              <input
                type="number"
                min={0}
                step="0.5"
                value={props.capInput}
                onChange={(e) => props.setCapInput(e.target.value)}
                placeholder="off"
                aria-label="Daily spend cap in dollars"
                className={cn(FIELD_CLS, "w-24")}
              />
            </div>
          </FieldLabel>
          <FieldLabel label="At cap">
            <Select
              value={props.action}
              ariaLabel="At cap action"
              className="min-w-[190px]"
              onChange={(v) =>
                props.setAction(v as BudgetSettings["capAction"])
              }
              options={CAP_ACTIONS.map((a) => ({
                value: a,
                label: CAP_ACTION_LABEL[a],
              }))}
            />
          </FieldLabel>
          {props.action === "downgrade-model" ? (
            <FieldLabel label="Fallback profile">
              <input
                value={props.fallback}
                onChange={(e) => props.setFallback(e.target.value)}
                placeholder="profile id"
                aria-label="Fallback profile id"
                className={cn(FIELD_CLS, "w-32")}
              />
            </FieldLabel>
          ) : null}
        </div>
      </div>

      <div className="border-t border-[color:var(--line-soft)] pt-4">
        <div className="mb-2.5 text-[12.5px] font-semibold text-violet-soft">
          Hard ceilings
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {ceilings.map(([label, val, set]) => (
            <FieldLabel key={label} label={label}>
              <input
                type="number"
                min={0}
                value={val}
                onChange={(e) => set(e.target.value)}
                placeholder="off"
                aria-label={label}
                className={cn(FIELD_CLS, "w-20")}
              />
            </FieldLabel>
          ))}
          <FieldLabel label="On hit">
            <Select
              value={props.onLimit}
              ariaLabel="On limit hit"
              className="min-w-[120px]"
              onChange={(v) => props.setOnLimit(v as "stop" | "pause")}
              options={[
                { value: "stop", label: "stop" },
                { value: "pause", label: "pause" },
              ]}
            />
          </FieldLabel>
        </div>
      </div>

      <p className="text-[11.5px] leading-relaxed text-chalk-300">
        Checked before each agent turn. <b>Stop the run</b> blocks it;{" "}
        <b>Downgrade model</b> switches to the cheaper fallback Profile;{" "}
        <b>Reduce effort</b> drops to the provider&apos;s minimum effort.
        Ceilings bind even when token cost is unmeasured (local CLI providers) -
        the reliable backstop for unattended runs. Leave a field blank for no
        limit.
      </p>

      <div className="flex items-center gap-2 border-t border-[color:var(--line-soft)] pt-4">
        <Button
          variant="primary"
          size="sm"
          disabled={props.saving}
          onClick={props.onSave}
        >
          {props.saving ? "Saving..." : "Save changes"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={props.saving}
          onClick={props.onCancel}
        >
          Cancel
        </Button>
        {props.msg ? (
          <span className="text-[11.5px] text-rose-300">{props.msg}</span>
        ) : null}
      </div>
    </div>
  );
}

function FieldLabel({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10.5px] font-medium text-chalk-400">{label}</span>
      {children}
    </label>
  );
}
