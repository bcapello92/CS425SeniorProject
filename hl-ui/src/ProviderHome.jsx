import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { buildLogoutUrl } from "./auth.jsx";
import { triageClient } from "./triageClient.js";
import { useAuth } from "./useAuth";

export default function ProviderHome() {
  const navigate = useNavigate();
  const { logout, me } = useAuth();

  const [homeLoading, setHomeLoading] = useState(true);
  const [homeError, setHomeError] = useState("");
  const [triage, setTriage] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const permissions = new Set(me?.permissions || []);

    if (!permissions.has("triage.read")) {
      setTriage(null);
      setHomeError("");
      setHomeLoading(false);
      return () => {
        cancelled = true;
      };
    }

    async function loadHome() {
      try {
        setHomeLoading(true);
        setHomeError("");

        const data = await triageClient.getBoard({ sinceHours: 168 });
        if (cancelled) return;

        const counts = data?.counts || { red: 0, orange: 0, blue: 0 };
        setTriage({
          counts,
          openTotal:
            Number(counts.red || 0) +
            Number(counts.orange || 0) +
            Number(counts.blue || 0),
        });
      } catch (e) {
        if (!cancelled) {
          setHomeError(e?.message || "Failed to load provider home data");
        }
      } finally {
        if (!cancelled) setHomeLoading(false);
      }
    }

    loadHome();
    const intervalId = window.setInterval(loadHome, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [me?.permissions]);

  function handleLogout() {
    logout?.();
    window.location.href = buildLogoutUrl();
  }

  const providerRoles = me?.roles || [];
  const providerPerms = new Set(me?.permissions || []);
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
            ) : !providerPerms.has("triage.read") ? (
              <div style={summaryBannerText}>No triage access</div>
            ) : (
              <>
                <SummaryPill label="Open" value={triage?.openTotal ?? 0} />
                <SummaryPill label="Red" value={triage?.counts?.red ?? 0} tone="red" />
                <SummaryPill label="Semi-Routine" value={triage?.counts?.orange ?? 0} tone="orange" />
                <SummaryPill label="Routine" value={triage?.counts?.blue ?? 0} tone="blue" />
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
            title="Patient Lookup"
            desc="Search prior patients and open their uploaded documents."
            meta="Records review"
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
      </main>
    </div>
  );
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

function SummaryPill({ label, value, tone = "open" }) {
  const toneStyle = summaryPillTones[tone] || summaryPillTones.open;
  return (
    <div style={{ ...summaryPill, ...toneStyle.wrap }}>
      <span style={{ ...summaryPillLabel, ...toneStyle.label }}>{label}</span>
      <span style={{ ...summaryPillValue, ...toneStyle.value }}>{value}</span>
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
};

const summaryPillLabel = {
  fontSize: 11,
  color: "#64748b",
  fontWeight: 700,
};

const summaryPillValue = {
  fontSize: 12,
  fontWeight: 900,
};

const summaryPillTones = {
  open: {
    wrap: { border: "1px solid #dbe5f4", background: "#ffffff" },
    label: { color: "#64748b" },
    value: { color: "#0f172a" },
  },
  red: {
    wrap: { border: "1px solid #fecaca", background: "#fef2f2" },
    label: { color: "#991b1b" },
    value: { color: "#991b1b" },
  },
  orange: {
    wrap: { border: "1px solid #fed7aa", background: "#fff7ed" },
    label: { color: "#c2410c" },
    value: { color: "#c2410c" },
  },
  blue: {
    wrap: { border: "1px solid #bfdbfe", background: "#eff6ff" },
    label: { color: "#1d4ed8" },
    value: { color: "#1d4ed8" },
  },
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
