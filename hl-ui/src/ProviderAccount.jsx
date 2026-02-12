import { useEffect, useMemo, useState } from "react";

const API_BASE =
  (import.meta.env.VITE_API_BASE?.replace(/\/$/, "") || "http://localhost:4000");

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    credentials: "include", //http cookies
    body: body ? JSON.stringify(body) : undefined,
  });

  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("application/json")
    ? await res.json().catch(() => ({}))
    : { error: await res.text() };

  if (!res.ok || data?.error) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data;
}

export default function ProivderAccount() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [pending, setPending] = useState([]);
  const [roles, setRoles] = useState([]);

  // membership_id -> selected role name
  const [roleChoice, setRoleChoice] = useState({});

  const roleNames = useMemo(
    () => roles.map((r) => r.name).filter(Boolean),
    [roles]
  );

  async function refresh() {
    setLoading(true);
    setErr("");
    try {
      // These endpoints are ADMIN-only (members.manage / roles.manage).
      // If you’re logged in as staff/medical, you’ll see a 403 here.
      const [reqs, roleList] = await Promise.all([
        api("/api/admin/requests"),
        api("/api/admin/roles"),
      ]);

      setPending(reqs || []);
      setRoles(roleList || []);

      // Default selection per pending user
      const nextChoices = {};
      for (const row of reqs || []) nextChoices[row.membership_id] = "staff";
      setRoleChoice(nextChoices);
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function approve(membership_id) {
    setErr("");
    try {
      const role = roleChoice[membership_id] || "staff";
      await api("/api/admin/approve", {
        method: "POST",
        body: { membership_id, roles: [role] },
      });
      await refresh();
    } catch (e) {
      setErr(e?.message || String(e));
    }
  }

  async function disable(membership_id) {
    setErr("");
    try {
      await api("/api/admin/disable", {
        method: "POST",
        body: { membership_id },
      });
      await refresh();
    } catch (e) {
      setErr(e?.message || String(e));
    }
  }

  if (loading) return <div style={{ padding: 16 }}>Loading account management…</div>;

  // If not admin, you'll likely see 403 Missing permission: members.manage or roles.manage
  return (
    <div style={{ padding: 16, maxWidth: 980, margin: "0 auto" }}>
      <h2 style={{ marginTop: 0 }}>Account Management</h2>

      {err ? (
        <div
          style={{
            padding: 12,
            border: "1px solid #f5c2c7",
            background: "#f8d7da",
            borderRadius: 8,
            marginBottom: 16,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Access / Error</div>
          <div>{err}</div>
          <div style={{ marginTop: 8, fontSize: 13, opacity: 0.85 }}>
            If you see a 403, you’re logged in as a non-admin user. Only admins can approve users and manage roles.
          </div>
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <button onClick={refresh}>Refresh</button>
        <div style={{ fontSize: 13, opacity: 0.8 }}>
          Pending requests: <b>{pending.length}</b>
        </div>
      </div>

      <h3 style={{ marginBottom: 8 }}>Pending approvals</h3>

      {pending.length === 0 ? (
        <div style={{ opacity: 0.8 }}>No pending users right now.</div>
      ) : (
        <div style={{ border: "1px solid #ddd", borderRadius: 10, overflow: "hidden" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "140px 1fr 220px 220px",
              padding: "10px 12px",
              background: "#f6f6f6",
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            <div>Membership</div>
            <div>User</div>
            <div>Role</div>
            <div>Actions</div>
          </div>

          {pending.map((p) => (
            <div
              key={p.membership_id}
              style={{
                display: "grid",
                gridTemplateColumns: "140px 1fr 220px 220px",
                padding: "10px 12px",
                borderTop: "1px solid #eee",
                alignItems: "center",
                gap: 8,
              }}
            >
              <div style={{ fontFamily: "monospace", fontSize: 13 }}>
                {p.membership_id}
              </div>

              <div>
                <div style={{ fontWeight: 600 }}>
                  {p.email || "(no email claim in token)"}
                </div>
                <div style={{ fontSize: 12, opacity: 0.75, fontFamily: "monospace" }}>
                  sub: {p.cognito_sub}
                </div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>
                  requested: {p.created_at}
                </div>
              </div>

              <div>
                <select
                  value={roleChoice[p.membership_id] || "staff"}
                  onChange={(e) =>
                    setRoleChoice((m) => ({
                      ...m,
                      [p.membership_id]: e.target.value,
                    }))
                  }
                  style={{ width: "100%", padding: 8 }}
                >
                  {(roleNames.length ? roleNames : ["staff", "medical", "admin"]).map(
                    (r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    )
                  )}
                </select>
                <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                  staff: view+flags • medical: +override • admin: everything
                </div>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => approve(p.membership_id)}>Approve</button>
                <button onClick={() => disable(p.membership_id)}>Disable</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <h3 style={{ marginTop: 24, marginBottom: 8 }}>Roles (reference)</h3>
      <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 10 }}>
        These are the roles currently defined in SQLite. (Only admins can change role permissions.)
      </div>
      <div style={{ border: "1px solid #ddd", borderRadius: 10, overflow: "hidden" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "180px 1fr",
            padding: "10px 12px",
            background: "#f6f6f6",
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          <div>Name</div>
          <div>Description</div>
        </div>
        {roles.map((r) => (
          <div
            key={r.id}
            style={{
              display: "grid",
              gridTemplateColumns: "180px 1fr",
              padding: "10px 12px",
              borderTop: "1px solid #eee",
            }}
          >
            <div style={{ fontFamily: "monospace" }}>{r.name}</div>
            <div style={{ opacity: 0.9 }}>{r.description || ""}</div>
          </div>
        ))}
      </div>
    </div>
  );
}