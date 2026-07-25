import React from "react";
import { createRoot } from "react-dom/client";
import { InitGate } from "./app/InitGate.js";
import { ConfirmProvider } from "./components/design/ConfirmDialog.js";
import "./index.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Vibestrate UI: #root not found");
}

createRoot(container).render(
  <React.StrictMode>
    <ConfirmProvider>
      <InitGate />
    </ConfirmProvider>
  </React.StrictMode>,
);
