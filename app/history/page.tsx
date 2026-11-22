"use client";

import { useEffect, useState } from "react";

export default function HistoryPage() {
  const [rows, setRows] = useState<Array<{ analysisId: string; overall: number; band: string; createdAt: Date; captureMode?: "live" | "upload" }> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const r = await fetch("/api/history", { credentials: "same-origin" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.code ?? `HTTP ${r.status}`); return; }
      setRows(j);
    })();
  }, []);

  return (
    <div className="wrap">
      <header className="page-header">
        <h1>FaceIQ Labs</h1>
        <div className="topbar">
          <a href="/capture" className="btn ghost">New capture</a>
          <a href="/api/account" className="btn ghost" style={{ color: "#b30000" }} onClick={() => window.location.reload()}>Delete account</a>
        </div>
      </header>
      {error ? <p className="err mt1">{error}</p> : null}
      {rows === null ? <p className="muted mt1">Loading…</p> : null}
      {rows && rows.length === 0 ? <p className="muted mt1">No analyses yet.</p> : null}
      {rows && (
        <table className="data mt2" style={{ width: "100%" }}>
          <thead>
            <tr><th>Score</th><th>Band</th><th>Date</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.analysisId}>
                <td className="num">{a.overall.toFixed(1)}</td>
                <td>{a.band}</td>
                <td>{new Date(a.createdAt).toLocaleString()} {a.captureMode === "upload" ? "(upload)" : ""}</td>
                <td className="num">
                  <a href={`/result/${a.analysisId}`}>View</a>
                  <span className="muted">  ·  </span>
                  <a href={`/api/analyses/${a.analysisId}/export`}>Export</a>
                  <span className="muted">  ·  </span>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      if (confirm("Delete this analysis? This cannot be undone.")) {
                        void fetch(`/api/analyses/${a.analysisId}`, { method: "DELETE", credentials: "same-origin" }).then(() => window.location.reload());
                      }
                    }}
                  >Delete</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
