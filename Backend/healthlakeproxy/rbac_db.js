// rbac_db.js
import Database from "better-sqlite3";

const db = new Database(process.env.RBAC_DB_PATH || "./rbac.db");
db.pragma("journal_mode = WAL");

db.exec([
  // ---------- users ----------
  "CREATE TABLE IF NOT EXISTS users (",
  "  id INTEGER PRIMARY KEY AUTOINCREMENT,",
  "  cognito_sub TEXT NOT NULL UNIQUE,",
  "  email TEXT,",
  "  created_at TEXT NOT NULL",
  ");",

  // ---------- memberships ----------
  "CREATE TABLE IF NOT EXISTS memberships (",
  "  id INTEGER PRIMARY KEY AUTOINCREMENT,",
  "  user_id INTEGER NOT NULL UNIQUE,",
  "  status TEXT NOT NULL CHECK(status IN ('pending','active','disabled','rejected')),",
  "  created_at TEXT NOT NULL,",
  "  approved_at TEXT,",
  "  approved_by_user_id INTEGER,",
  "  FOREIGN KEY(user_id) REFERENCES users(id)",
  ");",

  // ---------- roles ----------
  "CREATE TABLE IF NOT EXISTS roles (",
  "  id INTEGER PRIMARY KEY AUTOINCREMENT,",
  "  name TEXT NOT NULL UNIQUE,",
  "  description TEXT",
  ");",

  // ---------- permissions ----------
  "CREATE TABLE IF NOT EXISTS permissions (",
  "  id INTEGER PRIMARY KEY AUTOINCREMENT,",
  "  key TEXT NOT NULL UNIQUE,",
  "  description TEXT",
  ");",

  // ---------- role_permissions ----------
  "CREATE TABLE IF NOT EXISTS role_permissions (",
  "  role_id INTEGER NOT NULL,",
  "  permission_id INTEGER NOT NULL,",
  "  PRIMARY KEY(role_id, permission_id),",
  "  FOREIGN KEY(role_id) REFERENCES roles(id),",
  "  FOREIGN KEY(permission_id) REFERENCES permissions(id)",
  ");",

  // ---------- membership_roles ----------
  "CREATE TABLE IF NOT EXISTS membership_roles (",
  "  membership_id INTEGER NOT NULL,",
  "  role_id INTEGER NOT NULL,",
  "  PRIMARY KEY(membership_id, role_id),",
  "  FOREIGN KEY(membership_id) REFERENCES memberships(id),",
  "  FOREIGN KEY(role_id) REFERENCES roles(id)",
  ");",
    // ---------- audit_log ----------
  "CREATE TABLE IF NOT EXISTS audit_log (",
  "  id INTEGER PRIMARY KEY AUTOINCREMENT,",
  "  at TEXT NOT NULL,",
  "  actor_membership_id INTEGER NOT NULL,",
  "  actor_user_id INTEGER NOT NULL,",
  "  action TEXT NOT NULL,",
  "  resource_type TEXT,",
  "  resource_id TEXT,",
  "  details_json TEXT,",
  "  FOREIGN KEY(actor_membership_id) REFERENCES memberships(id),",
  "  FOREIGN KEY(actor_user_id) REFERENCES users(id)",
  ");",

  // ---------- member_invites ----------
  "CREATE TABLE IF NOT EXISTS member_invites (",
  "  id INTEGER PRIMARY KEY AUTOINCREMENT,",
  "  email TEXT NOT NULL UNIQUE,",
  "  suggested_role TEXT,",
  "  note TEXT,",
  "  status TEXT NOT NULL DEFAULT 'sent' CHECK(status IN ('sent','cancelled','accepted')),",
  "  invited_at TEXT NOT NULL,",
  "  invited_by_membership_id INTEGER NOT NULL,",
  "  invited_by_user_id INTEGER NOT NULL,",
  "  FOREIGN KEY(invited_by_membership_id) REFERENCES memberships(id),",
  "  FOREIGN KEY(invited_by_user_id) REFERENCES users(id)",
  ");",

  // helpful index
  "CREATE INDEX IF NOT EXISTS idx_audit_actor_at ON audit_log(actor_membership_id, at DESC);",
  "CREATE INDEX IF NOT EXISTS idx_member_invites_invited_at ON member_invites(invited_at DESC);",
].join("\n"));

// Lightweight schema migrations for existing local DBs.
try {
  db.prepare("ALTER TABLE users ADD COLUMN display_name TEXT").run();
} catch {
  // column already exists
}
// ---------- seed permissions ----------
const seedPermission = db.prepare(`
  INSERT OR IGNORE INTO permissions(key, description) VALUES (?, ?)
`);

[
  ["roles.manage", "Create/delete roles and update role permissions (ADMIN ONLY)"],
  ["members.manage", "Approve/disable users and assign roles (ADMIN ONLY)"],
  ["triage.read", "View triage board and triage detail (STAFF+)"],
  ["triage.flag", "Update contacted/scheduled flags (STAFF+)"],
  ["triage.override", "Override triage rating/color (MEDICAL+)"],
].forEach(([k, d]) => seedPermission.run(k, d));

// ---------- seed roles ----------
const seedRole = db.prepare(`
  INSERT OR IGNORE INTO roles(name, description) VALUES (?, ?)
`);

[
  ["admin", "Full access (can manage members and roles/permissions)"],
  ["medical", "Clinical access (can override triage)"],
  ["staff", "Staff access (view + schedule/contact flags)"],
].forEach(([n, d]) => seedRole.run(n, d));

// ---------- seed role->permission mapping ----------
const getPermId = db.prepare(`SELECT id FROM permissions WHERE key = ?`);
const getRoleId = db.prepare(`SELECT id FROM roles WHERE name = ?`);
const addRolePerm = db.prepare(`
  INSERT OR IGNORE INTO role_permissions(role_id, permission_id) VALUES (?, ?)
`);

function grant(roleName, permKey) {
  const r = getRoleId.get(roleName);
  const p = getPermId.get(permKey);
  if (r && p) addRolePerm.run(r.id, p.id);
}

// admin can do everything
["roles.manage", "members.manage", "triage.read", "triage.flag", "triage.override"].forEach((p) =>
  grant("admin", p)
);

// medical can do triage work including overrides
["triage.read", "triage.flag", "triage.override"].forEach((p) =>
  grant("medical", p)
);

// staff can view + update flags (schedule/contact), but cannot override rating
["triage.read", "triage.flag"].forEach((p) =>
  grant("staff", p)
);

// ---------- helpers ----------
export function upsertUserAndMembership({ cognito_sub, email }) {
  const now = new Date().toISOString();
  const normalizedEmail = email ? String(email).trim().toLowerCase() : null;

  db.prepare(`
    INSERT OR IGNORE INTO users(cognito_sub, email, created_at)
    VALUES (?, ?, ?)
  `).run(cognito_sub, normalizedEmail || null, now);

  const user = db.prepare(`SELECT * FROM users WHERE cognito_sub = ?`).get(cognito_sub);

  // Ensure membership exists, default pending
  db.prepare(`
    INSERT OR IGNORE INTO memberships(user_id, status, created_at)
    VALUES (?, 'pending', ?)
  `).run(user.id, now);

  let membership = db.prepare(`SELECT * FROM memberships WHERE user_id=?`).get(user.id);

  // Auto-activate invited users on first login and apply suggested role.
  if (normalizedEmail && membership?.status === "pending") {
    const invite = db
      .prepare(
        "SELECT * FROM member_invites WHERE LOWER(email)=LOWER(?) AND status='sent' ORDER BY invited_at DESC LIMIT 1"
      )
      .get(normalizedEmail);

    if (invite) {
      const roleName = invite.suggested_role || "staff";
      const role = getRoleId.get(roleName) || getRoleId.get("staff");

      db.prepare(`
        UPDATE memberships
        SET status='active', approved_at=?, approved_by_user_id=?
        WHERE id=?
      `).run(now, invite.invited_by_user_id, membership.id);

      db.prepare(`DELETE FROM membership_roles WHERE membership_id=?`).run(membership.id);
      if (role?.id) {
        db.prepare(`
          INSERT OR IGNORE INTO membership_roles(membership_id, role_id)
          VALUES (?, ?)
        `).run(membership.id, role.id);
      }

      db.prepare(`
        UPDATE member_invites
        SET status='accepted'
        WHERE id=?
      `).run(invite.id);

      membership = db.prepare(`SELECT * FROM memberships WHERE user_id=?`).get(user.id);
    }
  }

  // Bootstrap: first active user becomes active + admin
  const activeCount = db.prepare(`SELECT COUNT(*) AS n FROM memberships WHERE status='active'`).get().n;
  if (activeCount === 0) {
    db.prepare(`
      UPDATE memberships
      SET status='active', approved_at=?, approved_by_user_id=?
      WHERE user_id=?
    `).run(now, user.id, user.id);

    const mem = db.prepare(`SELECT * FROM memberships WHERE user_id=?`).get(user.id);
    const adminRoleId = getRoleId.get("admin")?.id;
    if (adminRoleId) {
      db.prepare(`
        INSERT OR IGNORE INTO membership_roles(membership_id, role_id)
        VALUES (?, ?)
      `).run(mem.id, adminRoleId);
    }
  }

  membership = db.prepare(`SELECT * FROM memberships WHERE user_id=?`).get(user.id);
  return { user, membership };
}

export function getUserById(user_id) {
  return db.prepare("SELECT id, cognito_sub, email, display_name, created_at FROM users WHERE id=?").get(user_id);
}

export function updateUserDisplayName({ user_id, display_name }) {
  const value = display_name && String(display_name).trim() ? String(display_name).trim() : null;
  db.prepare("UPDATE users SET display_name=? WHERE id=?").run(value, user_id);
  return getUserById(user_id);
}

export function disableSelfAccount({ user_id }) {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE memberships
    SET status='disabled', approved_at=COALESCE(approved_at, ?)
    WHERE user_id=?
  `).run(now, user_id);
  db.prepare("DELETE FROM membership_roles WHERE membership_id IN (SELECT id FROM memberships WHERE user_id=?)").run(user_id);
}

export function getMembershipWithPermissions(membership_id) {
  const membership = db.prepare(`SELECT * FROM memberships WHERE id=?`).get(membership_id);
  if (!membership) return null;

  const permissions = db.prepare(`
    SELECT DISTINCT p.key AS key
    FROM membership_roles mr
    JOIN role_permissions rp ON rp.role_id = mr.role_id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE mr.membership_id = ?
  `).all(membership_id).map(r => r.key);

  const roles = db.prepare(`
    SELECT r.name AS name
    FROM membership_roles mr
    JOIN roles r ON r.id = mr.role_id
    WHERE mr.membership_id = ?
  `).all(membership_id).map(r => r.name);

  return { membership, roles, permissions };
}

export function listPendingMembers() {
  return db.prepare(`
    SELECT m.id AS membership_id, u.email, u.cognito_sub, m.created_at
    FROM memberships m
    JOIN users u ON u.id = m.user_id
    WHERE m.status='pending'
    ORDER BY m.created_at ASC
  `).all();
}

export function approveMember({ membership_id, roleNames, approved_by_sub }) {
  const now = new Date().toISOString();

  const approverUser = db.prepare(`SELECT * FROM users WHERE cognito_sub=?`).get(approved_by_sub);
  if (!approverUser) throw new Error("Approver not found");

  const mem = db.prepare(`SELECT * FROM memberships WHERE id=?`).get(membership_id);
  if (!mem) throw new Error("Membership not found");

  db.prepare(`
    UPDATE memberships
    SET status='active', approved_at=?, approved_by_user_id=?
    WHERE id=?
  `).run(now, approverUser.id, membership_id);

  // Replace roles
  db.prepare(`DELETE FROM membership_roles WHERE membership_id=?`).run(membership_id);

  const ins = db.prepare(`INSERT OR IGNORE INTO membership_roles(membership_id, role_id) VALUES (?, ?)`);
  for (const roleName of roleNames) {
    const role = getRoleId.get(roleName);
    if (!role) throw new Error(`Unknown role: ${roleName}`);
    ins.run(membership_id, role.id);
  }
}

export function disableMember({ membership_id }) {
  db.prepare(`UPDATE memberships SET status='disabled' WHERE id=?`).run(membership_id);
}

// ---- role CRUD + permissions ----
export function listRoles() {
  return db.prepare(`SELECT * FROM roles ORDER BY name ASC`).all();
}

export function listPermissions() {
  return db.prepare(`SELECT * FROM permissions ORDER BY key ASC`).all();
}

export function createRole({ name, description }) {
  db.prepare(`INSERT INTO roles(name, description) VALUES (?, ?)`).run(name, description || null);
  return db.prepare(`SELECT * FROM roles WHERE name=?`).get(name);
}

export function deleteRole({ role_id }) {
  const inUse = db.prepare(`SELECT COUNT(*) AS n FROM membership_roles WHERE role_id=?`).get(role_id).n;
  if (inUse > 0) throw new Error("Role is in use; unassign it first.");

  db.prepare(`DELETE FROM role_permissions WHERE role_id=?`).run(role_id);
  db.prepare(`DELETE FROM roles WHERE id=?`).run(role_id);
}

export function setRolePermissions({ role_id, permKeys }) {
  const role = db.prepare(`SELECT * FROM roles WHERE id=?`).get(role_id);
  if (!role) throw new Error("Role not found");

  db.prepare(`DELETE FROM role_permissions WHERE role_id=?`).run(role_id);

  const ins = db.prepare(`INSERT OR IGNORE INTO role_permissions(role_id, permission_id) VALUES (?, ?)`);
  for (const key of permKeys) {
    const p = getPermId.get(key);
    if (!p) throw new Error(`Unknown permission: ${key}`);
    ins.run(role_id, p.id);
  }
}

export function createOrRefreshInvite({
  email,
  suggested_role = null,
  note = null,
  invited_by_membership_id,
  invited_by_user_id,
}) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) throw new Error("email is required");

  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO member_invites(email, suggested_role, note, status, invited_at, invited_by_membership_id, invited_by_user_id)
    VALUES (?, ?, ?, 'sent', ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET
      suggested_role=excluded.suggested_role,
      note=excluded.note,
      status='sent',
      invited_at=excluded.invited_at,
      invited_by_membership_id=excluded.invited_by_membership_id,
      invited_by_user_id=excluded.invited_by_user_id
  `).run(
    normalizedEmail,
    suggested_role,
    note,
    now,
    invited_by_membership_id,
    invited_by_user_id
  );

  return db
    .prepare(
      "SELECT id, email, suggested_role, note, status, invited_at, invited_by_membership_id, invited_by_user_id FROM member_invites WHERE email=?"
    )
    .get(normalizedEmail);
}

export function listMemberInvites({ limit = 100 }) {
  return db
    .prepare(
      `SELECT i.id, i.email, i.suggested_role, i.note, i.status, i.invited_at,
              i.invited_by_membership_id, i.invited_by_user_id, u.email AS invited_by_email
       FROM member_invites i
       LEFT JOIN users u ON u.id = i.invited_by_user_id
       ORDER BY i.invited_at DESC
       LIMIT ?`
    )
    .all(limit);
}
//audit functions
export function logAudit({
  actor_membership_id,
  actor_user_id,
  action,
  resource_type = null,
  resource_id = null,
  details = null,
}) {
  const at = new Date().toISOString();
  const details_json = details ? JSON.stringify(details) : null;

  db.prepare(
    "INSERT INTO audit_log(at, actor_membership_id, actor_user_id, action, resource_type, resource_id, details_json) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(at, actor_membership_id, actor_user_id, action, resource_type, resource_id, details_json);
}

export function listMyAudit({ actor_membership_id, limit = 50 }) {
  return db
    .prepare(
      "SELECT id, at, action, resource_type, resource_id, details_json FROM audit_log WHERE actor_membership_id=? ORDER BY at DESC LIMIT ?"
    )
    .all(actor_membership_id, limit);
}

export function listAuditAll({ limit = 200 }) {
  return db
    .prepare(
      `SELECT a.id, a.at, u.email, u.cognito_sub, a.actor_user_id, a.actor_membership_id, a.action, a.resource_type, a.resource_id, a.details_json
       FROM audit_log a
       JOIN memberships m ON m.id = a.actor_membership_id
       JOIN users u ON u.id = a.actor_user_id
       ORDER BY a.at DESC
       LIMIT ?`
    )
    .all(limit);
}
