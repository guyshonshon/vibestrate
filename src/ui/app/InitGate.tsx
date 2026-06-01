import { useCallback, useEffect, useState } from "react";
import { App } from "./App.js";
import { InitScreen, type InitVariant } from "./InitScreen.js";
import { api } from "../lib/api.js";

/** `?initv=1|2|3` forces an onboarding layout (for comparing variants). */
function previewVariant(): InitVariant {
  if (typeof window === "undefined") return 1;
  const v = new URLSearchParams(window.location.search).get("initv");
  return v === "2" ? 2 : v === "3" ? 3 : 1;
}

type Status = Awaited<ReturnType<typeof api.getSetupStatus>>;

/**
 * Gate the dashboard on whether the project is initialized. On first run (no
 * `.vibestrate/`) we show the onboarding screen instead of a half-broken
 * dashboard rendering against missing config; once initialized we hand off to
 * the real app. A failed status check fails open to the app (better to show a
 * working dashboard than to trap the user behind a checker error).
 */
export function InitGate() {
  const [status, setStatus] = useState<Status | null>(null);
  const [checked, setChecked] = useState(false);

  const check = useCallback(async () => {
    try {
      setStatus(await api.getSetupStatus());
    } catch {
      setStatus(null); // fail open
    } finally {
      setChecked(true);
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  // Brief, quiet hold while we check - just the backdrop + mark, no copy, so it
  // doesn't flash a spinner on the common (already-initialized) path.
  if (!checked) {
    return (
      <div className="relative min-h-screen w-full overflow-hidden bg-ink-0">
        <div className="vibestrate-backdrop" />
      </div>
    );
  }

  if (status && !status.initialized) {
    return (
      <InitScreen
        status={status}
        variant={previewVariant()}
        onEntered={() => void check()}
      />
    );
  }

  return <App />;
}
