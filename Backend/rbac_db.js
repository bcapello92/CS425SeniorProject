// rbac_db.js
import Database from "better-sqlite3";

const db = new Database(process.env.RBAC_DB_PATH || "./rbac.db");
db.pragma("journal_mode = WAL");

// ---------- schema ----------
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cognito_sub TEXT NOT NULL UNIQUE,
  email TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memberships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK(status IN ('pending','active','disabled','rejected')),
  created_at TEXT NOT NULL,
  approved_at TEXT,
  approved_by_user_id INTEGER,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT
);

CREATE TABLE IF NOT EXISTS permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  description TEXT
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INTEGER NOT NULL,
  permission_id INTEGER NOT NULL,
  PRIMARY KEY(role_id, permission_id),
  FOREIGN KEY(role_id) REFERENCES roles(id),
  FOREIGN KEY(permission_id) REFERENCES permissions(id)
);

CREATE TABLE IF NOT EXISTS membership_roles (
  membership_id INTEGER NOT NULL,
  role_id INTEGER NOT NULL,
  PRIMARY KEY(membership_id, role_id),
  FOREIGN KEY(membership_id) REFERENCES memberships(id),
  FOREIGN KEY(role_id) REFERENCES roles(id)
);
`);

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

  db.prepare(`
    INSERT OR IGNORE INTO users(cognito_sub, email, created_at)
    VALUES (?, ?, ?)
  `).run(cognito_sub, email || null, now);

  const user = db.prepare(`SELECT * FROM users WHERE cognito_sub = ?`).get(cognito_sub);

  // Ensure membership exists, default pending
  db.prepare(`
    INSERT OR IGNORE INTO memberships(user_id, status, created_at)
    VALUES (?, 'pending', ?)
  `).run(user.id, now);

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

  const membership = db.prepare(`SELECT * FROM memberships WHERE user_id=?`).get(user.id);
  return { user, membership };
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