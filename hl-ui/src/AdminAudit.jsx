import { useEffect, useMemo, useState } from "react";
import { API_BASE } from "./config";

const FILTERS = [
  { value: "all", label: "All Activity" },
  { value: "triage.override", label: "Changed Triage Level" },
  { value: "triage.flag.update", label: "Updated Flags" },
  { value: "member", label: "User Added/Managed" },
  { value: "account", label: "Account Changes" },
];

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
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError("");
        const data = await api("/api/admin/audit?limit=200");
        setRows(Array.isArray(data) ? data : []);
      } catch (e) {
        setError(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (!matchesFilter(row, filter)) return false;
      if (!needle) return true;

      const haystack = [
        row.at,
        row.email,
        row.actor_membership_id,
        row.action,
        row.resource_type,
        row.resource_id,
        row.details_json,
        JSON.stringify(row.details || {}),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(needle);
    });
  }, [rows, filter, search]);

  return (
    <div style={page}>
      <div style={hero}>
        <div>
          <div style={eyebrow}>Admin</div>
          <h2 style={title}>Audit Log</h2>
          <p style={subtitle}>
            Review workflow and admin events, then narrow the list to triage changes, user activity, or a specific actor.
          </p>
        </div>
        <div style={summaryPill}>{filteredRows.length} visible</div>
      </div>

      <div style={toolbar}>
        <div style={filterGroup}>
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFilter(option.value)}
              style={filterChip(filter === option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search actor, case, action, or details"
          style={searchInput}
        />
      </div>

      {error ? <div style={errorBox}>{error}</div> : null}

      {loading ? (
        <div style={loadingCard}>Loading audit log...</div>
      ) : filteredRows.length === 0 ? (
        <div style={emptyCard}>No audit rows match the current filters.</div>
      ) : (
        <div style={tableShell}>
          <div style={table}>
            <div style={headerRow}>
              <div>When</div>
              <div>Actor</div>
              <div>Action</div>
              <div>Resource</div>
              <div>Details</div>
            </div>

            <div style={scrollBody}>
              {filteredRows.map((row) => (
                <div key={row.id} style={rowStyle}>
                  <div>
                    <div style={timeStamp}>{formatAuditTime(row.at)}</div>
                    <div style={dateStamp}>{formatAuditDate(row.at)}</div>
                  </div>
                  <div>
                    <div style={primaryText}>{row.email || "Unknown actor"}</div>
                    <div style={secondaryText}>Membership {row.actor_membership_id || "-"}</div>
                  </div>
                  <div>
                    <span style={actionPill(row.action)}>{formatActionLabel(row.action)}</span>
                  </div>
                  <div>
                    <div style={primaryText}>{row.resource_type || "-"}</div>
                    <div style={secondaryText}>{row.resource_id || "-"}</div>
                  </div>
                  <div style={detailsCell}>
                    <pre style={detailsPre}>{formatDetails(row)}</pre>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function matchesFilter(row, filter) {
  if (filter === "all") return true;
  const action = String(row?.action || "");
  if (filter === "member") return action.startsWith("member.");
  if (filter === "account") return action.startsWith("account.");
  return action === filter;
}

function formatActionLabel(action) {
  if (action === "triage.override") return "Changed triage level";
  if (action === "triage.flag.update") return "Updated triage flags";
  if (action === "member.invite") return "Added user invite";
  if (action === "member.approve") return "Approved user";
  if (action === "member.disable") return "Disabled user";
  if (action === "account.profile.update") return "Updated profile";
  if (action === "account.delete") return "Deleted account";
  return action || "Unknown";
}

function formatDetails(row) {
  const details = row?.details;
  if (details && Object.keys(details).length > 0) {
    try {
      return JSON.stringify(details, null, 2);
    } catch {
      return String(row.details_json || "-");
    }
  }
  return row?.details_json || "-";
}

function formatAuditTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "-";
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatAuditDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function actionPill(action) {
  const isTriage = String(action || "").startsWith("triage.");
  const isMember = String(action || "").startsWith("member.");
  const isAccount = String(action || "").startsWith("account.");

  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    background: isTriage ? "#eff6ff" : isMember ? "#ecfdf5" : isAccount ? "#fff7ed" : "#f8fafc",
    color: isTriage ? "#1d4ed8" : isMember ? "#047857" : isAccount ? "#c2410c" : "#334155",
    border: `1px solid ${isTriage ? "#bfdbfe" : isMember ? "#a7f3d0" : isAccount ? "#fed7aa" : "#e2e8f0"}`,
  };
}

function filterChip(active) {
  return {
    padding: "10px 14px",
    borderRadius: 999,
    border: active ? "1px solid #0f172a" : "1px solid #dbe5f4",
    background: active ? "#0f172a" : "#ffffff",
    color: active ? "#f8fafc" : "#0f172a",
    fontWeight: 800,
    cursor: "pointer",
  };
}

const page = {
  maxWidth: 1240,
  margin: "0 auto",
  padding: 16,
};

const hero = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  flexWrap: "wrap",
  marginBottom: 18,
};

const eyebrow = {
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: 1.1,
  textTransform: "uppercase",
  color: "#0f766e",
  marginBottom: 10,
};

const title = {
  margin: 0,
  color: "#0f172a",
};

const subtitle = {
  margin: "10px 0 0",
  color: "#475569",
  maxWidth: 700,
  lineHeight: 1.5,
};

const summaryPill = {
  padding: "10px 14px",
  borderRadius: 999,
  background: "#0f172a",
  color: "#f8fafc",
  fontSize: 13,
  fontWeight: 800,
};

const toolbar = {
  display: "flex",
  justifyContent: "space-between",
  gap: 14,
  flexWrap: "wrap",
  alignItems: "center",
  marginBottom: 16,
};

const filterGroup = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const searchInput = {
  minWidth: "min(360px, 100%)",
  flex: "1 1 320px",
  padding: "11px 14px",
  borderRadius: 12,
  border: "1px solid #dbe5f4",
  outline: "none",
};

const errorBox = {
  padding: 12,
  borderRadius: 12,
  border: "1px solid #fecaca",
  background: "#fff1f2",
  color: "#991b1b",
  marginBottom: 12,
};

const loadingCard = {
  padding: 18,
  borderRadius: 14,
  border: "1px solid #e2e8f0",
  background: "#ffffff",
};

const emptyCard = {
  padding: 18,
  borderRadius: 14,
  border: "1px dashed #cbd5e1",
  background: "#f8fafc",
  color: "#64748b",
  fontWeight: 700,
};

const tableShell = {
  border: "1px solid #e7edf5",
  borderRadius: 18,
  overflowX: "auto",
  overflowY: "hidden",
  background: "#ffffff",
  boxShadow: "0 16px 40px rgba(15, 23, 42, 0.06)",
};

const table = {
  minWidth: 980,
};

const headerRow = {
  display: "grid",
  gridTemplateColumns: "140px 220px 220px 160px minmax(280px, 1fr)",
  padding: "12px 14px",
  background: "#f8fafc",
  fontWeight: 800,
  fontSize: 13,
  color: "#334155",
  borderBottom: "1px solid #e2e8f0",
};

const scrollBody = {
  maxHeight: "calc(100vh - 290px)",
  overflow: "auto",
};

const rowStyle = {
  display: "grid",
  gridTemplateColumns: "140px 220px 220px 160px minmax(280px, 1fr)",
  padding: "14px",
  borderTop: "1px solid #eef2f7",
  alignItems: "start",
  gap: 12,
  fontSize: 13,
};

const timeStamp = {
  fontWeight: 800,
  color: "#0f172a",
};

const dateStamp = {
  marginTop: 4,
  fontSize: 12,
  color: "#64748b",
};

const primaryText = {
  fontWeight: 700,
  color: "#0f172a",
  overflowWrap: "anywhere",
};

const secondaryText = {
  marginTop: 4,
  fontSize: 12,
  color: "#64748b",
  overflowWrap: "anywhere",
};

const detailsCell = {
  minWidth: 0,
};

const detailsPre = {
  margin: 0,
  padding: 10,
  borderRadius: 12,
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  fontFamily: "Consolas, Monaco, monospace",
  fontSize: 11,
  lineHeight: 1.5,
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
};
