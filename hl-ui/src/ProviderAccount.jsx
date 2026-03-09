import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE =
  (import.meta.env.VITE_API_BASE?.replace(/\/$/, "") || "http://localhost:4000");

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    credentials: "include",
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

export default function ProviderAccount() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [profile, setProfile] = useState(null);
  const [displayName, setDisplayName] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");

  async function loadProfile() {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const data = await api("/api/account/profile");
      setProfile(data);
      setDisplayName(data?.displayName || "");
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProfile();
  }, []);

  async function saveProfile(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const data = await api("/api/account/profile", {
        method: "PATCH",
        body: { displayName },
      });
      setProfile((prev) => ({ ...prev, ...data }));
      setMessage("Profile updated.");
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  async function deleteAccount() {
    if (deleteConfirm !== "DELETE") {
      setError('Type DELETE to confirm account deletion.');
      return;
    }

    setDeleting(true);
    setError("");
    setMessage("");
    try {
      await api("/api/account", {
        method: "DELETE",
        body: { confirm: "DELETE" },
      });
      navigate("/");
      window.location.reload();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setDeleting(false);
    }
  }

  if (loading) return <div style={{ padding: 16 }}>Loading account settings…</div>;

  return (
    <div style={{ padding: 16, maxWidth: 760, margin: "0 auto" }}>
      <h2 style={{ marginTop: 0 }}>My Account</h2>

      {error ? <div style={errorBox}>{error}</div> : null}
      {message ? <div style={okBox}>{message}</div> : null}

      <div style={card}>
        <div style={cardTitle}>Profile</div>
        <div style={metaLine}><b>Email:</b> {profile?.email || "-"}</div>
        <div style={metaLine}><b>Subject:</b> <span style={mono}>{profile?.sub || "-"}</span></div>
        <div style={metaLine}><b>Status:</b> {profile?.status || "-"}</div>

        <form onSubmit={saveProfile} style={{ marginTop: 12 }}>
          <label style={label}>Display Name</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={80}
            placeholder="Enter display name"
            style={input}
          />
          <div style={hint}>Used for provider-facing display in the app.</div>
          <button type="submit" style={btn} disabled={saving}>
            {saving ? "Saving..." : "Save Profile"}
          </button>
        </form>
      </div>

      <div style={{ ...card, borderColor: "#fecaca", marginTop: 14 }}>
        <div style={dangerTitle}>Delete Account</div>
        <div style={hintDanger}>
          Deleting your account is non-reversible and will revoke access to provider pages.
        </div>

        <label style={label}>Type DELETE to confirm</label>
        <input
          value={deleteConfirm}
          onChange={(e) => setDeleteConfirm(e.target.value)}
          placeholder="DELETE"
          style={input}
        />

        <button type="button" style={btnDanger} onClick={deleteAccount} disabled={deleting}>
          {deleting ? "Deleting..." : "Delete My Account"}
        </button>
      </div>
    </div>
  );
}

const card = {
  border: "1px solid #e7edf5",
  borderRadius: 12,
  background: "#fff",
  padding: 14,
};

const cardTitle = {
  fontWeight: 800,
  fontSize: 16,
  marginBottom: 8,
};

const metaLine = {
  fontSize: 13,
  color: "#334155",
  marginBottom: 4,
};

const mono = {
  fontFamily: "monospace",
  fontSize: 12,
};

const label = {
  display: "block",
  fontSize: 13,
  fontWeight: 700,
  marginBottom: 6,
  marginTop: 8,
};

const input = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #dbe3ef",
  fontSize: 13,
};

const hint = {
  fontSize: 12,
  color: "#64748b",
  marginTop: 6,
  marginBottom: 10,
};

const hintDanger = {
  fontSize: 12,
  color: "#991b1b",
  marginBottom: 10,
};

const btn = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #dbeafe",
  background: "#eff6ff",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
};

const btnDanger = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #fecaca",
  background: "#fee2e2",
  color: "#991b1b",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 800,
  marginTop: 10,
};

const dangerTitle = {
  fontWeight: 900,
  color: "#991b1b",
  fontSize: 15,
  marginBottom: 6,
};

const errorBox = {
  padding: 12,
  borderRadius: 8,
  border: "1px solid #fecaca",
  background: "#fff1f2",
  color: "#991b1b",
  marginBottom: 12,
};

const okBox = {
  padding: 12,
  borderRadius: 8,
  border: "1px solid #bbf7d0",
  background: "#f0fdf4",
  color: "#166534",
  marginBottom: 12,
};
