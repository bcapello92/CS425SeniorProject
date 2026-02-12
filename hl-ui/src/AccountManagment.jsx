import { useEffect, useState } from "react";

const API_BASE =
    import.meta.env.VITE_API_BASE?.replace(/\/$/, "") ||
    "http://localhost:4000";

async function api(path, opts = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
        credentials: "include",
        headers: { "content-type": "application/json" },
        ...opts,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
    }
    return data;
}

export default function AccountManagement() {
    const [pending, setPending] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    async function load() {
        try {
            setLoading(true);
            const data = await api("/api/admin/requests");
            setPending(data || []);
        } catch (e) {
            setError(e?.message || String(e));
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
    }, []);

    async function approve(id, roles) {
        try {
            await api("/api/admin/approve", {
                method: "POST",
                body: JSON.stringify({
                    membership_id: id,
                    roles,
                }),
            });
            await load();
        } catch (e) {
            alert(e.message);
        }
    }

    async function disable(id) {
        try {
            await api("/api/admin/disable", {
                method: "POST",
                body: JSON.stringify({
                    membership_id: id,
                }),
            });
            await load();
        } catch (e) {
            alert(e.message);
        }
    }

    return (
        <div style={{ padding: 16, maxWidth: 1000, margin: "0 auto" }}>
            <h2 style={{ marginTop: 0 }}>Account Management (Admin)</h2>

            {error ? (
                <div style={errorBox}>
                    {error}
                </div>
            ) : null}

            {loading ? (
                <div>Loading pending users...</div>
            ) : pending.length === 0 ? (
                <div style={{ opacity: 0.7 }}>No pending users.</div>
            ) : (
                <div style={table}>
                    <div style={headerRow}>
                        <div>Email</div>
                        <div>Requested</div>
                        <div>Actions</div>
                    </div>

                    {pending.map((row) => (
                        <div key={row.membership_id} style={rowStyle}>
                            <div>{row.email || "(no email)"}</div>
                            <div style={{ fontFamily: "monospace", fontSize: 12 }}>
                                {row.created_at}
                            </div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                <button
                                    style={btn}
                                    onClick={() => approve(row.membership_id, ["staff"])}
                                >
                                    Approve as Staff
                                </button>

                                <button
                                    style={btn}
                                    onClick={() => approve(row.membership_id, ["medical"])}
                                >
                                    Approve as Medical
                                </button>

                                <button
                                    style={btnDanger}
                                    onClick={() => approve(row.membership_id, ["admin"])}
                                >
                                    Approve as Admin
                                </button>

                                <button
                                    style={btnSecondary}
                                    onClick={() => disable(row.membership_id)}
                                >
                                    Disable
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

/* ---------- styles ---------- */

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
    gridTemplateColumns: "1.5fr 1fr 2fr",
    padding: "10px 12px",
    background: "#f6f8fb",
    fontWeight: 800,
    fontSize: 13,
};

const rowStyle = {
    display: "grid",
    gridTemplateColumns: "1.5fr 1fr 2fr",
    padding: "12px",
    borderTop: "1px solid #eee",
    alignItems: "center",
    fontSize: 14,
};

const btn = {
    padding: "6px 10px",
    borderRadius: 8,
    border: "1px solid #dbeafe",
    background: "#eff6ff",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 700,
};

const btnDanger = {
    padding: "6px 10px",
    borderRadius: 8,
    border: "1px solid #fecaca",
    background: "#fee2e2",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 700,
    color: "#991b1b",
};

const btnSecondary = {
    padding: "6px 10px",
    borderRadius: 8,
    border: "1px solid #e2e8f0",
    background: "#f8fafc",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 600,
};