// Lightweight persistence layer using node:sqlite (built into Node 22+).
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || '/data/tracking-packages';
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'tracking.db');

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tracking_number TEXT NOT NULL UNIQUE,
  carrier TEXT,
  label TEXT,
  status TEXT DEFAULT 'pending',
  last_event TEXT,
  last_location TEXT,
  last_update TEXT,
  eta TEXT,
  origin TEXT,
  destination TEXT,
  notes TEXT,
  archived INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  package_id INTEGER NOT NULL,
  date TEXT,
  description TEXT,
  location TEXT,
  status TEXT,
  raw TEXT,
  FOREIGN KEY(package_id) REFERENCES packages(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  package_id INTEGER,
  type TEXT NOT NULL,
  channel TEXT NOT NULL,
  config TEXT,
  enabled INTEGER DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
CREATE TABLE IF NOT EXISTS scan_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT,
  found TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_package ON events(package_id);
CREATE INDEX IF NOT EXISTS idx_packages_carrier ON packages(carrier);
CREATE INDEX IF NOT EXISTS idx_packages_status ON packages(status);
`);

function now() { return new Date().toISOString(); }
function rowToPackage(r) {
  if (!r) return null;
  return {
    id: r.id,
    trackingNumber: r.tracking_number,
    carrier: r.carrier,
    label: r.label,
    status: r.status,
    lastEvent: r.last_event,
    lastLocation: r.last_location,
    lastUpdate: r.last_update,
    eta: r.eta,
    origin: r.origin,
    destination: r.destination,
    notes: r.notes,
    archived: !!r.archived,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}
function rowToEvent(r) {
  return { id: r.id, packageId: r.package_id, date: r.date, description: r.description, location: r.location, status: r.status, raw: r.raw };
}

const stmts = {
  insertPackage: db.prepare(`INSERT INTO packages (tracking_number, carrier, label, status, last_event, last_location, last_update, eta, origin, destination, notes, archived, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`),
  getPackage: db.prepare(`SELECT * FROM packages WHERE id=?`),
  getByNumber: db.prepare(`SELECT * FROM packages WHERE tracking_number=?`),
  listPackages: db.prepare(`SELECT * FROM packages ORDER BY archived ASC, updated_at DESC`),
  updatePackage: db.prepare(`UPDATE packages SET carrier=?, label=?, status=?, last_event=?, last_location=?, last_update=?, eta=?, origin=?, destination=?, notes=?, archived=?, updated_at=? WHERE id=?`),
  deletePackage: db.prepare(`DELETE FROM packages WHERE id=?`),
  insertEvent: db.prepare(`INSERT INTO events (package_id, date, description, location, status, raw) VALUES (?,?,?,?,?,?)`),
  listEvents: db.prepare(`SELECT * FROM events WHERE package_id=? ORDER BY id DESC`),
  clearEvents: db.prepare(`DELETE FROM events WHERE package_id=?`),
  insertAlert: db.prepare(`INSERT INTO alerts (package_id, type, channel, config, enabled, created_at) VALUES (?,?,?,?,?,?)`),
  listAlerts: db.prepare(`SELECT * FROM alerts ORDER BY id DESC`),
  deleteAlert: db.prepare(`DELETE FROM alerts WHERE id=?`),
  toggleAlert: db.prepare(`UPDATE alerts SET enabled=? WHERE id=?`),
  getSetting: db.prepare(`SELECT value FROM settings WHERE key=?`),
  setSetting: db.prepare(`INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`),
  insertScan: db.prepare(`INSERT INTO scan_history (text, found, created_at) VALUES (?,?,?)`),
};

module.exports = { db, now, rowToPackage, rowToEvent, stmts, DATA_DIR, DB_PATH };
