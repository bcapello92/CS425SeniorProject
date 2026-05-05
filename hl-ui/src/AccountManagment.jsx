import { useEffect, useState } from "react";
import { API_BASE } from "./config";

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
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("staff");
  const [inviteNote, setInviteNote] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);

  async function load() {
    try {
      setLoading(true);
      setError("");

      // Pending approvals and invite history are independent admin datasets, so load them together.
      const [reqs, invs] = await Promise.all([
        api("/api/admin/requests"),
        api("/api/admin/invites"),
      ]);

      setPending(reqs || []);
      setInvites(invs || []);
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

  async function sendInvite(e) {
    e.preventDefault();

    try {
      setInviteBusy(true);
      // Reuse the same invite endpoint for staff, medical, and admin onboarding.
      await api("/api/admin/invite", {
        method: "POST",
        body: JSON.stringify({
          email: inviteEmail,
          suggested_role: inviteRole,
          note: inviteNote || null,
        }),
      });

      setInviteEmail("");
      setInviteNote("");
      await load();
    } catch (e) {
      alert(e.message || String(e));
    } finally {
      setInviteBusy(false);
    }
  }

  return (
    <div style={{ padding: 16, maxWidth: 1000, margin: "0 auto" }}>
      <h2 style={{ marginTop: 0 }}>Account Management (Admin)</h2>

      <div style={inviteBox}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Invite New User</div>
        <form onSubmit={sendInvite} style={inviteForm}>
          <input
            type="email"
            placeholder="new.user@yourorg.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            required
            style={input}
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value)}
            style={select}
          >
            <option value="staff">staff</option>
            <option value="medical">medical</option>
            <option value="admin">admin</option>
          </select>
          <input
            type="text"
            placeholder="Optional note"
            value={inviteNote}
            onChange={(e) => setInviteNote(e.target.value)}
            style={input}
          />
          <button style={btn} type="submit" disabled={inviteBusy}>
            {inviteBusy ? "Inviting..." : "Send Invite"}
          </button>
        </form>
      </div>

      {error ? <div style={errorBox}>{error}</div> : null}

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
              <div style={{ fontFamily: "monospace", fontSize: 12 }}>{row.created_at}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button style={btn} onClick={() => approve(row.membership_id, ["staff"])}>
                  Approve as Staff
                </button>
                <button style={btn} onClick={() => approve(row.membership_id, ["medical"])}>
                  Approve as Medical
                </button>
                <button style={btnDanger} onClick={() => approve(row.membership_id, ["admin"])}>
                  Approve as Admin
                </button>
                <button style={btnSecondary} onClick={() => disable(row.membership_id)}>
                  Disable
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <h3 style={{ marginTop: 18 }}>Recent Invites</h3>
      {invites.length === 0 ? (
        <div style={{ opacity: 0.7 }}>No invites yet.</div>
      ) : (
        <div style={table}>
          <div style={headerRowInvites}>
            <div>Email</div>
            <div>Role</div>
            <div>Status</div>
            <div>Invited By</div>
            <div>At</div>
          </div>

          {invites.map((inv) => (
            <div key={inv.id} style={rowInvites}>
              <div>{inv.email}</div>
              <div>{inv.suggested_role || "-"}</div>
              <div>{inv.status}</div>
              <div>{inv.invited_by_email || `user#${inv.invited_by_user_id}`}</div>
              <div style={{ fontFamily: "monospace", fontSize: 12 }}>{inv.invited_at}</div>
            </div>
          ))}
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

const inviteBox = {
  border: "1px solid #e7edf5",
  borderRadius: 12,
  background: "#fff",
  padding: 12,
  marginBottom: 12,
};

const inviteForm = {
  display: "grid",
  gridTemplateColumns: "2fr 1fr 2fr auto",
  gap: 8,
  alignItems: "center",
};

const input = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #dbe3ef",
  fontSize: 13,
};

const select = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #dbe3ef",
  fontSize: 13,
  background: "#fff",
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

const headerRowInvites = {
  display: "grid",
  gridTemplateColumns: "1.8fr .9fr .8fr 1.2fr 1.2fr",
  padding: "10px 12px",
  background: "#f6f8fb",
  fontWeight: 800,
  fontSize: 13,
};

const rowInvites = {
  display: "grid",
  gridTemplateColumns: "1.8fr .9fr .8fr 1.2fr 1.2fr",
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
