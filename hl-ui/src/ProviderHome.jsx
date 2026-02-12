//hl-ui/src/ProviderHome.jsx
import { useNavigate } from "react-router-dom";
import { useAuth } from "./useAuth.jsx";
export default function ProviderHome() {
    const navigate = useNavigate();
    const { me } = useAuth();

    const roles = me?.roles || [];
    const permissions = new Set(me?.permissions || []);

    const can = (perm) => permissions.has(perm);
    const hasRole = (r) => roles.includes(r);

    function goTriage() {
        navigate("/provider/triage");
    }

    function goScheduling() {
        navigate("/provider/schedule");
    }

    function goUpload() {
        navigate("/provider/upload");
    }

    function goAccount() {
        // Self account page for everyone
        navigate("/provider/account");
    }

    function goAdminAccounts() {
        // Membership approvals / account management
        navigate("/provider/admin/accounts");
    }

    // Decide which “admin” tiles should appear
    const showAdminAccounts =
        can("members.manage") || can("roles.manage") || hasRole("admin");

    return (
        <div style={page}>
            <h1>Provider Dashboard</h1>
            <p>Welcome{me?.email ? `, ${me.email}` : ""}. Choose an action below.</p>

            <div style={grid}>
                <DashboardCard
                    title="Triage Board"
                    desc="View and manage active patient triage cases"
                    onClick={goTriage}
                />

                <DashboardCard
                    title="Scheduling"
                    desc="View and manage patient appointments"
                    onClick={goScheduling}
                />

                <DashboardCard
                    title="File Upload"
                    desc="Upload de-identified patient data for training"
                    onClick={goUpload}
                />

                <DashboardCard
                    title="Account"
                    desc="View your profile, roles, and access"
                    onClick={goAccount}
                />

                {showAdminAccounts && (
                    <DashboardCard
                        title="Admin: Accounts"
                        desc="Approve/disable members and manage access"
                        onClick={goAdminAccounts}
                    />
                )}
            </div>
        </div>
    );
}

function DashboardCard({ title, desc, onClick }) {
    return (
        <div onClick={onClick} style={card} role="button" tabIndex={0}>
            <h3 style={{ margin: 0 }}>{title}</h3>
            <p style={{ marginTop: 8 }}>{desc}</p>
        </div>
    );
}

const page = {
    minHeight: "100vh",
    padding: 32,
    background: "#f5f7fb",
};

const grid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 16,
    marginTop: 24,
};

const card = {
    padding: 20,
    borderRadius: 12,
    background: "#fff",
    border: "1px solid #eee",
    cursor: "pointer",
    boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
};