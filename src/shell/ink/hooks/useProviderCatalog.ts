import { useEffect, useRef, useState, useCallback } from "react";
import { resolveCatalog } from "../../../providers/provider-catalog-overlay.js";
import {
  BUILTIN_CATALOG,
  type ResolvedCatalog,
} from "../../../providers/provider-apply.js";

/**
 * Resolves the capability catalog (built-in merged with the project's
 * `.vibestrate/providers-catalog.yml` overlay) so the shell's Profile editor
 * cycles through the same model/effort options the web + CLI see. Falls back to
 * the built-in catalog on any overlay error - the editor still works.
 */
export function useProviderCatalog(projectRoot: string) {
  const [catalog, setCatalog] = useState<ResolvedCatalog>(BUILTIN_CATALOG);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const resolved = await resolveCatalog(projectRoot);
      if (mounted.current) setCatalog(resolved);
    } catch {
      if (mounted.current) setCatalog(BUILTIN_CATALOG);
    }
  }, [projectRoot]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  return { catalog, refresh };
}
