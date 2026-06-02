import { useEffect, useRef, useState, useCallback } from "react";
import {
  loadCatalogOverlay,
  mergeCatalog,
  type CatalogOverlay,
} from "../../../providers/provider-catalog-overlay.js";
import {
  BUILTIN_CATALOG,
  type ResolvedCatalog,
} from "../../../providers/provider-apply.js";

/**
 * Resolves the capability catalog (built-in merged with the project's
 * `.vibestrate/providers-catalog.yml` overlay) so the shell's Profile editor
 * cycles through the same model/effort options the web + CLI see, and exposes
 * the raw overlay so the page can show which knobs come from it (parity with
 * `vibe provider catalog`). Falls back to the built-in catalog on any overlay
 * error - the editor still works.
 */
export function useProviderCatalog(projectRoot: string) {
  const [catalog, setCatalog] = useState<ResolvedCatalog>(BUILTIN_CATALOG);
  const [overlay, setOverlay] = useState<CatalogOverlay>({});
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const ov = await loadCatalogOverlay(projectRoot);
      if (!mounted.current) return;
      setOverlay(ov);
      setCatalog(mergeCatalog(ov));
    } catch {
      if (!mounted.current) return;
      setOverlay({});
      setCatalog(BUILTIN_CATALOG);
    }
  }, [projectRoot]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  return { catalog, overlay, refresh };
}
