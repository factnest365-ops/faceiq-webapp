import type { AnalysisData } from "@/components/AnalysisView";

const KEY = "faceiq_anonymous_analyses";

/**
 * Save an anonymous analysis so the result page can render it without a session.
 * sessionStorage round-trips NaN to null, matching the server JSON shape.
 */
export function saveAnonymousAnalysis(id: string, data: AnalysisData): void {
  try {
    const map = JSON.parse(sessionStorage.getItem(KEY) ?? "{}") as Record<string, AnalysisData>;
    map[id] = data;
    sessionStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // sessionStorage unavailable - the result page shows a loading error.
  }
}

/** Read back an anonymous analysis by id, or null when absent. */
export function readAnonymousAnalysis(id: string): AnalysisData | null {
  try {
    const map = JSON.parse(sessionStorage.getItem(KEY) ?? "{}") as Record<string, AnalysisData>;
    return map[id] ?? null;
  } catch {
    return null;
  }
}
