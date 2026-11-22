"use client";

import { useEffect, useState } from "react";

import AnalysisView, { type AnalysisData } from "@/components/AnalysisView";
import { readAnonymousAnalysis } from "@/lib/anonymous";

export default function ResultPage({ params }: { params: Promise<{ id: string }> }) {
  const [data, setData] = useState<AnalysisData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState(false);
  const [id, setId] = useState<string>("");
  useEffect(() => { void params.then((p) => setId(p.id)); }, [params]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const r = await fetch(`/api/analyses/${id}`);
      const j = await r.json().catch(() => ({}));
      if (r.ok) { setHasSession(true); setData(j as AnalysisData); return; }
      if (r.status === 401) {
        // Anonymous: the analysis was computed in the browser and stored in sessionStorage.
        const anon = readAnonymousAnalysis(id);
        setData(anon);
        if (!anon) setError("Analysis not available in this browser session");
        return;
      }
      setError(j.code ?? `HTTP ${r.status}`);
    })();
  }, [id]);

  return (
    <div className="wrap">
      <header className="page-header">
        <h1>FaceIQ Labs</h1>
        <div className="topbar">
          <a href="/capture" className="btn ghost">New capture</a>
          {hasSession ? <a href="/history" className="btn ghost">History</a> : null}
        </div>
      </header>
      {error ? <p className="err mt1">{error}</p> : null}
      {data ? <AnalysisView data={data} /> : <p className="muted">Loading…</p>}
    </div>
  );
}
