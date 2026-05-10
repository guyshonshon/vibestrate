import { useEffect, useState } from "react";
import { api } from "./api.js";
import type { ValidationProfileSummary } from "./types.js";

let cache: ValidationProfileSummary[] | null = null;
let inFlight: Promise<ValidationProfileSummary[]> | null = null;

/**
 * Lazy, cached fetch of /api/validation/profiles. Profiles are static at the
 * project-config level, so a per-mount fetch is fine — but we share one
 * promise across components so a Suggestions tab + Review-pass panel mounted
 * together don't double-fetch.
 */
export function useValidationProfiles(): {
  profiles: ValidationProfileSummary[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const [profiles, setProfiles] = useState<ValidationProfileSummary[]>(
    cache ?? [],
  );
  const [loading, setLoading] = useState<boolean>(cache === null);
  const [error, setError] = useState<string | null>(null);

  async function load(force: boolean): Promise<void> {
    if (!force && cache !== null) {
      setProfiles(cache);
      setLoading(false);
      return;
    }
    if (!inFlight) {
      inFlight = api
        .listValidationProfiles()
        .then((r) => {
          cache = r;
          return r;
        })
        .finally(() => {
          inFlight = null;
        });
    }
    setLoading(true);
    try {
      const r = await inFlight;
      setProfiles(r);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(false);
  }, []);

  return { profiles, loading, error, refresh: () => void load(true) };
}
