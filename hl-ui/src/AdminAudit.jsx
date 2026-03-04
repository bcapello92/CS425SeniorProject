import { useEffect, useState } from "react";

const API_BASE =
  (import.meta.env.VITE_API_BASE?.replace(/\/$/, "") || "http://localhost:4000");

async function api(path) {
  const res = await fetch(`${API_BASE}${path}`, { credentials: "include" });
  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("application/json")
    ? await res.json().catch(() => ({}))
    : { error: await res.text() };
  if (!res.ok || data?.error) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

export default function AdminAudit() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await api("/api/admin/audit?limit=200");
        setRows(Array.isArray(data) ? data : []);
      } catch (e) {
        setError(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div style={{ padding: 16, maxWidth: 1100, margin: "0 auto" }}>
      <h2 style={{ marginTop: 0 }}>Audit Log</h2>

      {error ? (
        <div style={errorBox}>{error}</div>
      ) : null}

      {loading ? (
        <div>Loading audit log...</div>
      ) : rows.length === 0 ? (
        <div style={{ opacity: 0.7 }}>No audit rows found.</div>
      ) : (
        <div style={table}>
          <div style={headerRow}>
            <div>When</div>
            <div>Actor</div>
            <div>Action</div>
            <div>Resource</div>
            <div>Details</div>
          </div>
          <div style={bodyScroll}>
            {rows.map((r) => (
              <div key={r.id} style={rowStyle}>
                <div style={mono}>{r.at}</div>
                <div>{r.email || r.actor_membership_id}</div>
                <div>{r.action}</div>
                <div>{`${r.resource_type || "-"} ${r.resource_id || ""}`.trim()}</div>
                <div style={monoSmall}>{r.details_json || "-"}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const errorBox = {
  padding: 12,
  borderRadius: 8,
  border: "1px solid #fecaca",
  background: "#fff1f2",
  color: "#991b1b",
  marginBottom: 12,
};

const table = {
  border: "1px solid #e7edf5",
  borderRadius: 12,
  overflow: "hidden",
  background: "#ffffff",
};

const headerRow = {
  display: "grid",
  gridTemplateColumns: "1.2fr 1fr 1fr 1fr 2fr",
  padding: "10px 12px",
  background: "#f6f8fb",
  fontWeight: 800,
  fontSize: 13,
  position: "sticky",
  top: 0,
  zIndex: 1,
};

const bodyScroll = {
  maxHeight: "70vh",
  overflowY: "auto",
};

const rowStyle = {
  display: "grid",
  gridTemplateColumns: "1.2fr 1fr 1fr 1fr 2fr",
  padding: "12px",
  borderTop: "1px solid #eee",
  alignItems: "center",
  fontSize: 13,
};

const mono = {
  fontFamily: "monospace",
  fontSize: 12,
};

const monoSmall = {
  fontFamily: "monospace",
  fontSize: 11,
  opacity: 0.9,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

