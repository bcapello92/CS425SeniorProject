import { useNavigate } from "react-router-dom";
import { useAuth } from "./useAuth";
import {buildLogoutUrl} from "./auth"

export default function ProviderHome(){
const navigate = useNavigate();
const {logout }=useAuth();

function handleLogout(){
    logout?.();
    window.location.href = buildLogoutUrl();

}

 return (
    <div style={page}>
      {/* Top header */}
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
          <button style={ghostBtn} onClick={() => navigate("/")}>
            Patient Chat (Demo)
          </button>
          <button style={dangerBtn} onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      {/* Content */}
      <main style={content}>
        <div style={sectionHeader}>
          <h1 style={h1}>Provider Dashboard</h1>
          <p style={p}>
            Choose a module below. All provider pages are protected by login.
          </p>
        </div>

        <div style={grid}>
          <ClinicalCard
            title="Triage Board"
            desc="Review new intakes, set flags, and override triage levels."
            meta="Live cases grouped by severity"
            onClick={() => navigate("/provider/triage")}
            pill="Clinical"
          />

          <ClinicalCard
            title="Scheduling"
            desc="View and manage appointments generated from triage cases."
            meta="Demo/stub page is OK for now"
            onClick={() => navigate("/provider/schedule")}
            pill="Workflow"
          />

          <ClinicalCard
            title="File Upload"
            desc="Upload de-identified training data for future model improvements."
            meta="CSV/JSON uploads (planned)"
            onClick={() => navigate("/provider/upload")}
            pill="Data"
          />

          <ClinicalCard
            title="Account Management"
            desc="Manage provider profile and security settings."
            meta="User + role management (planned)"
            onClick={() => navigate("/provider/account")}
            pill="Security"
          />
        </div>

        {/* Demo callout */}
        <div style={callout}>
          <div style={calloutTitle}>Demo shortcut</div>
          <div style={calloutBody}>
            If you’re presenting, use <b>Patient Chat (Demo)</b> to submit an
            intake, then come back to <b>Triage Board</b> to view it.
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <button style={primaryBtn} onClick={() => navigate("/")}>
              Go to Patient Chat
            </button>
            <button style={primaryBtn} onClick={() => navigate("/provider/triage")}>
              Go to Triage Board
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

function ClinicalCard({ title, desc, meta, pill, onClick }) {
  return (
    <button type="button" onClick={onClick} style={cardBtn}>
      <div style={cardTop}>
        <div style={pillStyle}>{pill}</div>
      </div>

      <div style={cardTitle}>{title}</div>
      <div style={cardDesc}>{desc}</div>
      <div style={cardMeta}>{meta}</div>

      <div style={cardFooter}>
        <span style={cardLink}>Open →</span>
      </div>
    </button>
  );
}

/* ---------- styles (clinical look) ---------- */

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
  gap: 10,
  alignItems: "center",
};

const ghostBtn = {
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid #d8e2f0",
  background: "#ffffff",
  color: "#0f172a",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
};

const dangerBtn = {
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid #fecaca",
  background: "#fff1f2",
  color: "#991b1b",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
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

const cardTop = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 10,
};

const pillStyle = {
  display: "inline-flex",
  alignItems: "center",
  padding: "4px 8px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 800,
  color: "#1d4ed8",
  background: "rgba(37, 99, 235, 0.10)",
  border: "1px solid rgba(37, 99, 235, 0.20)",
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

const callout = {
  marginTop: 18,
  padding: 14,
  borderRadius: 14,
  border: "1px solid #e7edf5",
  background: "#ffffff",
  boxShadow: "0 1px 10px rgba(15, 23, 42, 0.04)",
};

const calloutTitle = {
  fontSize: 13,
  fontWeight: 900,
  color: "#0f172a",
  marginBottom: 6,
};

const calloutBody = {
  fontSize: 13,
  color: "#334155",
  lineHeight: 1.35,
};

const primaryBtn = {
  padding: "9px 12px",
  borderRadius: 10,
  border: "1px solid #c7dbff",
  background: "#e7f3ff",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 800,
  color: "#0f172a",
};