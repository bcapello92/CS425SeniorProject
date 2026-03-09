import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./useAuth";
import { buildLogoutUrl, API_BASE } from "./auth";

export default function ProviderHome() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [homeData, setHomeData] = useState(null);
  const [homeLoading, setHomeLoading] = useState(true);
  const [homeError, setHomeError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadHome() {
      try {
        setHomeLoading(true);
        setHomeError("");

        const res = await fetch(`${API_BASE}/api/provider/home`, {
          method: "GET",
          credentials: "include",
        });

        const ct = res.headers.get("content-type") || "";
        const data = ct.includes("application/json")
          ? await res.json()
          : { error: await res.text() };

        if (!res.ok || data.error) {
          throw new Error(data.error || `HTTP ${res.status}`);
        }

        if (!cancelled) setHomeData(data);
      } catch (e) {
        if (!cancelled) setHomeError(e?.message || "Failed to load provider home data");
      } finally {
        if (!cancelled) setHomeLoading(false);
      }
    }

    loadHome();
    return () => {
      cancelled = true;
    };
  }, []);

  function handleLogout() {
    logout?.();
    window.location.href = buildLogoutUrl();
  }

  const triage = homeData?.summary?.triage;
  const recentAudit = homeData?.recentAudit || [];
  const provider = homeData?.provider || {};
  const providerRoles = provider.roles || [];
  const providerPerms = new Set(provider.permissions || []);
  const canAdmin = providerRoles.includes("admin") || providerPerms.has("members.manage");

  return (
    <div style={page}>
      <header style={topBar}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={brandRow}>
            <div style={brandDot} />
            <div style={brandTitle}>ENT Triage Provider Portal</div>
          </div>
          <div style={brandSub}>
            Secure clinician dashboard • Triage • Scheduling • Uploads
          </div>
        </div>

        <div style={topActions}>
          <div style={summaryBanner}>
            {homeLoading ? (
              <div style={summaryBannerText}>Loading summary...</div>
            ) : homeError ? (
              <div style={summaryBannerError}>Summary unavailable</div>
            ) : (
              <>
                <SummaryPill label="Open" value={triage?.openTotal ?? 0} />
                <SummaryPill label="Red" value={triage?.counts?.red ?? 0} />
                <SummaryPill label="Semi-Routine" value={triage?.counts?.orange ?? 0} />
                <SummaryPill label="Routine" value={triage?.counts?.yellow ?? 0} />
                <SummaryPill label="Audit" value={homeData?.summary?.recentAuditCount ?? 0} />
              </>
            )}
          </div>

          <div style={pillRow}>
            <button style={dangerPill} onClick={handleLogout}>
              Logout
            </button>
          </div>
        </div>
      </header>

      <main style={content}>
        <div style={sectionHeader}>
          <h1 style={h1}>Provider Dashboard</h1>
          <p style={p}>Choose a module below. All provider pages are protected by login.</p>
        </div>

        <div style={grid}>
          <ClinicalCard
            title="Triage Board"
            desc="Review triage cases, apply flags, and complete escalation workflow."
            meta="Primary provider workflow"
            onClick={() => navigate("/provider/triage")}
          />
          <ClinicalCard
            title="Scheduling"
            desc="View and manage appointments generated from triage cases."
            meta="Workflow queue"
            onClick={() => navigate("/provider/schedule")}
          />
          <ClinicalCard
            title="File Upload"
            desc="Upload de-identified files for downstream review and training workflows."
            meta="Data operations"
            onClick={() => navigate("/provider/upload")}
          />
          <ClinicalCard
            title="Account Management"
            desc="Review profile, access status, and account settings."
            meta="Security and access"
            onClick={() => navigate("/provider/account")}
          />
          <ClinicalCard
            title="Audit"
            desc="View recent workflow and admin audit events."
            meta="Audit trail"
            onClick={() => navigate("/provider/admin/audit")}
          />
          {canAdmin && (
            <ClinicalCard
              title="Admin"
              desc="Open admin dashboard for account governance controls."
              meta="Admins only"
              onClick={() => navigate("/provider/admin")}
            />
          )}
        </div>

        <div style={statusWrap}>
          <div style={statusCard}>
            <div style={auditHeader}>
              <span style={auditPill}>Workflow Audit</span>
            </div>
            {!homeLoading && !homeError && recentAudit.length === 0 && (
              <div style={smallText}>No audit entries yet.</div>
            )}
            {!homeLoading && !homeError && recentAudit.length > 0 && (
              <div style={auditList}>
                {recentAudit.map((row) => (
                  <div key={row.id} style={auditRow}>
                    <div style={auditAction}>{row.action}</div>
                    <div style={smallText}>Submitted by: {row.actorEmail || row.actor_user_id || "unknown"}</div>
                    <div style={smallText}>Changed: {formatAuditChange(row)}</div>
                    <div style={smallText}>{row.at}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function formatAuditChange(row) {
  const details = row?.details || {};

  if (row?.action === "triage.flag.update" && details?.updates && typeof details.updates === "object") {
    const items = Object.entries(details.updates).map(([k, v]) => `${k}=${String(v)}`);
    return items.length ? items.join(", ") : "Flags updated";
  }

  if (row?.action === "triage.override") {
    const color = details?.color ? `color=${details.color}` : "color updated";
    const reason = details?.reason ? `, reason=${details.reason}` : "";
    return `${color}${reason}`;
  }

  if (row?.action === "member.approve") {
    const roles = Array.isArray(details?.roles) ? details.roles.join(", ") : "";
    return roles ? `approved with roles=${roles}` : "member approved";
  }

  if (row?.action === "member.disable") {
    return "member disabled";
  }

  if (details && Object.keys(details).length > 0) {
    return JSON.stringify(details);
  }

  return `${row?.resource_type || "resource"} ${row?.resource_id || ""}`.trim();
}

function ClinicalCard({ title, desc, meta, onClick }) {
  return (
    <button type="button" onClick={onClick} style={cardBtn}>
      <div style={cardTitle}>{title}</div>
      <div style={cardDesc}>{desc}</div>
      <div style={cardMeta}>{meta}</div>

      <div style={cardFooter}>
        <span style={cardLink}>Open →</span>
      </div>
    </button>
  );
}

function SummaryPill({ label, value }) {
  return (
    <div style={summaryPill}>
      <span style={summaryPillLabel}>{label}</span>
      <span style={summaryPillValue}>{value}</span>
    </div>
  );
}

const page = {
  minHeight: "100vh",
  background: "#f6f8fb",
};

const topBar = {
  position: "sticky",
  top: 0,
  zIndex: 10,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "14px 18px",
  background: "#ffffff",
  borderBottom: "1px solid #e7edf5",
};

const brandRow = {
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const brandDot = {
  width: 10,
  height: 10,
  borderRadius: 999,
  background: "#2563eb",
  boxShadow: "0 0 0 4px rgba(37, 99, 235, 0.12)",
};

const brandTitle = {
  fontSize: 14,
  fontWeight: 800,
  letterSpacing: 0.2,
  color: "#0f172a",
};

const brandSub = {
  marginTop: 2,
  fontSize: 12,
  color: "#64748b",
};

const topActions = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  alignItems: "flex-end",
};

const summaryBanner = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 10px",
  borderRadius: 999,
  border: "1px solid #dbe5f4",
  background: "#f7fbff",
  minHeight: 38,
};

const summaryBannerText = {
  fontSize: 12,
  color: "#64748b",
  fontWeight: 700,
};

const summaryBannerError = {
  fontSize: 12,
  color: "#b91c1c",
  fontWeight: 700,
};

const summaryPill = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "5px 10px",
  borderRadius: 999,
  border: "1px solid #d9e4f5",
  background: "#fff",
};

const summaryPillLabel = {
  fontSize: 11,
  color: "#64748b",
  fontWeight: 700,
};

const summaryPillValue = {
  fontSize: 12,
  color: "#0f172a",
  fontWeight: 900,
};

const pillRow = {
  display: "flex",
  gap: 8,
  alignItems: "center",
};

const dangerPill = {
  padding: "7px 12px",
  borderRadius: 999,
  border: "1px solid #fecaca",
  background: "#fff1f2",
  color: "#991b1b",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 800,
};

const content = {
  maxWidth: 1100,
  margin: "0 auto",
  padding: "22px 16px 32px",
};

const sectionHeader = {
  marginBottom: 16,
};

const h1 = {
  margin: 0,
  fontSize: 22,
  color: "#0f172a",
  letterSpacing: 0.2,
};

const p = {
  marginTop: 6,
  marginBottom: 0,
  fontSize: 13,
  color: "#64748b",
};

const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
  gap: 14,
  marginTop: 14,
};

const cardBtn = {
  textAlign: "left",
  width: "100%",
  padding: 16,
  borderRadius: 14,
  border: "1px solid #e7edf5",
  background: "#ffffff",
  boxShadow: "0 1px 10px rgba(15, 23, 42, 0.05)",
  cursor: "pointer",
};

const cardTitle = {
  fontSize: 16,
  fontWeight: 800,
  color: "#0f172a",
  marginBottom: 6,
};

const cardDesc = {
  fontSize: 13,
  color: "#334155",
  lineHeight: 1.35,
  marginBottom: 10,
};

const cardMeta = {
  fontSize: 12,
  color: "#64748b",
};

const cardFooter = {
  display: "flex",
  justifyContent: "flex-end",
  marginTop: 14,
};

const cardLink = {
  fontSize: 13,
  fontWeight: 800,
  color: "#2563eb",
};

const statusWrap = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 14,
  marginTop: 14,
};

const statusCard = {
  padding: 14,
  borderRadius: 14,
  border: "1px solid #e7edf5",
  background: "#ffffff",
  boxShadow: "0 1px 10px rgba(15, 23, 42, 0.04)",
};

const auditList = {
  display: "grid",
  gap: 8,
  marginTop: 8,
};

const auditRow = {
  padding: 10,
  borderRadius: 10,
  border: "1px solid #e7edf5",
  background: "#f8fbff",
};

const auditAction = {
  fontSize: 13,
  fontWeight: 800,
  color: "#0f172a",
  marginBottom: 4,
};

const auditHeader = {
  marginBottom: 8,
};

const auditPill = {
  display: "inline-flex",
  alignItems: "center",
  padding: "4px 10px",
  borderRadius: 999,
  border: "1px solid #dbe5f4",
  background: "#f7fbff",
  color: "#1d4ed8",
  fontSize: 12,
  fontWeight: 800,
};

const smallText = {
  fontSize: 12,
  color: "#64748b",
};

const calloutTitle = {
  fontSize: 13,
  fontWeight: 900,
  color: "#0f172a",
  marginBottom: 6,
};
