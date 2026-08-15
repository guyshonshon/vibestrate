import React from "react";
import { createRoot } from "react-dom/client";
import { InitGate } from "./app/InitGate.js";
import { ConfirmProvider } from "./components/design/ConfirmDialog.js";
import "./index.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Vibestrate UI: #root not found");
}

/**
 * Clears the boot gate in index.html.
 *
 * An effect, so it runs after React has actually COMMITTED a frame - the point
 * where there is really something behind the gate to uncover. A timeout would
 * be guessing, and guessing wrong in either direction is the bug: too early
 * shows the half-built page the gate exists to hide, too late holds a ready one
 * hostage.
 */
function ClearBootGate({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    document.documentElement.setAttribute("data-booted", "");
  }, []);
  return <>{children}</>;
}

createRoot(container).render(
  <React.StrictMode>
    <ConfirmProvider>
      <ClearBootGate>
        <InitGate />
      </ClearBootGate>
    </ConfirmProvider>
  </React.StrictMode>,
);
