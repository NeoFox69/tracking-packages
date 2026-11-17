require('dotenv').config();
const express = require('express');
const compression = require('compression');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const { WebSocketServer } = require('ws');
const { db, now, rowToPackage, rowToEvent, stmts } = require('./db');
const carriers = require('./carriers');
const { track } = require('./tracker');

const app = express();
const PORT = process.env.PORT || 4200;
const LISTEN_PORT = process.env.PORT || 4200;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- helpers ----------
function broadcast(msg) {
  wss.clients.forEach(c => { try { if (c.readyState === 1) c.send(JSON.stringify(msg)); } catch (_) {} });
}

// ---------- packages ----------
app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.get('/api/carriers', (req, res) => res.json(carriers.carrierList()));

app.get('/api/packages', (req, res) => {
  const rows = stmts.listPackages.all();
  const pkgs = rows.map(rowToPackage);
  // attach events count
  for (const p of pkgs) {
    p.events = stmts.listEvents.all(p.id).map(rowToEvent);
  }
  res.json(pkgs);
});

app.get('/api/packages/:id', (req, res) => {
  const r = stmts.getPackage.get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Not found' });
  const p = rowToPackage(r);
  p.events = stmts.listEvents.all(p.id).map(rowToEvent);
  res.json(p);
});

app.post('/api/packages', async (req, res) => {
  const { trackingNumber, carrier, label, notes } = req.body || {};
  if (!trackingNumber) return res.status(400).json({ error: 'trackingNumber required' });
  const num = String(trackingNumber).trim().toUpperCase().replace(/\s+/g, '');
  const existing = stmts.getByNumber.get(num);
  if (existing) return res.status(409).json({ error: 'Already tracked', package: rowToPackage(existing) });
  const det = carrier || carriers.detectCarrier(num);
  const url = carriers.getTrackingUrl(num, det);
  const t = now();
  stmts.insertPackage.run(num, det, label || null, 'pending', null, null, t, null, null, null, notes || null, 0, t, t);
  const row = stmts.getByNumber.get(num);
  const p = rowToPackage(row);
  // async track
  trackAndUpdate(p.id, num, det).catch(() => {});
  res.status(201).json(p);
});

app.put('/api/packages/:id', (req, res) => {
  const r = stmts.getPackage.get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Not found' });
  const p = rowToPackage(r);
  const b = req.body || {};
  const updated = {
    carrier: b.carrier !== undefined ? b.carrier : p.carrier,
    label: b.label !== undefined ? b.label : p.label,
    status: b.status !== undefined ? b.status : p.status,
    lastEvent: b.lastEvent !== undefined ? b.lastEvent : p.lastEvent,
    lastLocation: b.lastLocation !== undefined ? b.lastLocation : p.lastLocation,
    lastUpdate: b.lastUpdate !== undefined ? b.lastUpdate : p.lastUpdate,
    eta: b.eta !== undefined ? b.eta : p.eta,
    origin: b.origin !== undefined ? b.origin : p.origin,
    destination: b.destination !== undefined ? b.destination : p.destination,
    notes: b.notes !== undefined ? b.notes : p.notes,
    archived: b.archived !== undefined ? (b.archived ? 1 : 0) : (p.archived ? 1 : 0)
  };
  stmts.updatePackage.run(updated.carrier, updated.label, updated.status, updated.lastEvent, updated.lastLocation, updated.lastUpdate, updated.eta, updated.origin, updated.destination, updated.notes, updated.archived, now(), req.params.id);
  const row = stmts.getPackage.get(req.params.id);
  const out = rowToPackage(row);
  out.events = stmts.listEvents.all(out.id).map(rowToEvent);
  res.json(out);
});

app.delete('/api/packages/:id', (req, res) => {
  stmts.deletePackage.run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/packages/:id/refresh', async (req, res) => {
  const r = stmts.getPackage.get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Not found' });
  const p = rowToPackage(r);
  try {
    const result = await trackAndUpdate(p.id, p.trackingNumber, p.carrier);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/packages/refresh-all', async (req, res) => {
  const rows = stmts.listPackages.all();
  const results = [];
  for (const r of rows) {
    if (r.archived) continue;
    const p = rowToPackage(r);
    try { results.push(await trackAndUpdate(p.id, p.trackingNumber, p.carrier)); }
    catch (e) { results.push({ id: p.id, error: e.message }); }
  }
  res.json(results);
});

async function trackAndUpdate(id, number, carrier) {
  const result = await track(number, carrier);
  const r = stmts.getPackage.get(id);
  if (!r) return null;
  const p = rowToPackage(r);
  // clear events then insert new (keep history? append new unique)
  const existing = stmts.listEvents.all(id).map(rowToEvent);
  const newEvents = result.events || [];
  // Insert events not already present
  const seen = new Set(existing.map(e => (e.date || '') + '|' + (e.description || '')));
  for (const e of newEvents) {
    const key = (e.date || '') + '|' + (e.description || '');
    if (seen.has(key)) continue;
    seen.add(key);
    stmts.insertEvent.run(id, e.date || null, e.description || null, e.location || null, e.status || null, JSON.stringify(e));
  }
  const lastEv = newEvents.length ? newEvents[0] : null;
  // reorder: events often latest-first from API; if ascending, take last
  let latest = lastEv;
  if (newEvents.length > 1) {
    // pick the one with latest date
    latest = newEvents.reduce((a, b) => {
      const da = a && a.date ? new Date(a.date).getTime() : 0;
      const db = b && b.date ? new Date(b.date).getTime() : 0;
      return (isNaN(db) || db <= da) ? a : b;
    }, newEvents[0]);
  }
  const status = result.status || p.status;
  const lastEvent = (latest && latest.description) || result.lastEvent || p.lastEvent;
  const lastLocation = (latest && latest.location) || result.lastLocation || p.lastLocation;
  const lastUpdate = (latest && latest.date) || result.lastUpdate || now();
  const eta = result.eta || p.eta;
  const origin = result.origin || p.origin;
  const destination = result.destination || p.destination;
  stmts.updatePackage.run(
    result.carrier || carrier || p.carrier,
    p.label, status, lastEvent, lastLocation, lastUpdate, eta, origin, destination, p.notes, p.archived ? 1 : 0, now(), id
  );
  const row = stmts.getPackage.get(id);
  const out = rowToPackage(row);
  out.events = stmts.listEvents.all(id).map(rowToEvent);
  out.sourceUrl = result.sourceUrl;
  out.rawSnippet = result.rawSnippet;
  broadcast({ type: 'package-updated', package: out });
  return out;
}

// ---------- scan ----------
app.post('/api/scan', (req, res) => {
  const text = (req.body && req.body.text) || '';
  const found = carriers.scanText(text);
  stmts.insertScan.run(text.slice(0, 5000), JSON.stringify(found), now());
  res.json({ found });
});

app.get('/api/scan/history', (req, res) => {
  const rows = db.prepare('SELECT * FROM scan_history ORDER BY id DESC LIMIT 50').all();
  res.json(rows.map(r => ({ id: r.id, text: r.text, found: JSON.parse(r.found || '[]'), createdAt: r.created_at })));
});

// ---------- alerts ----------
app.get('/api/alerts', (req, res) => {
  const rows = stmts.listAlerts.all();
  res.json(rows.map(r => ({ id: r.id, packageId: r.package_id, type: r.type, channel: r.channel, config: JSON.parse(r.config || '{}'), enabled: !!r.enabled, createdAt: r.created_at })));
});
app.post('/api/alerts', (req, res) => {
  const b = req.body || {};
  const t = now();
  stmts.insertAlert.run(b.packageId || null, b.type || 'status', b.channel || 'email', JSON.stringify(b.config || {}), 1, t);
  const rows = stmts.listAlerts.all();
  res.status(201).json(rows[0] ? { id: rows[0].id } : { ok: true });
});
app.delete('/api/alerts/:id', (req, res) => { stmts.deleteAlert.run(req.params.id); res.json({ ok: true }); });
app.put('/api/alerts/:id/toggle', (req, res) => {
  const r = db.prepare('SELECT enabled FROM alerts WHERE id=?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'not found' });
  stmts.toggleAlert.run(r.enabled ? 0 : 1, req.params.id);
  res.json({ ok: true, enabled: !r.enabled });
});

// ---------- settings ----------
app.get('/api/settings', (req, res) => {
  const rows = db.prepare('SELECT * FROM settings').all();
  const obj = {};
  for (const r of rows) obj[r.key] = r.value;
  res.json(obj);
});
app.put('/api/settings', (req, res) => {
  const b = req.body || {};
  for (const k of Object.keys(b)) stmts.setSetting.run(k, String(b[k]));
  res.json({ ok: true });
});

// ---------- stats ----------
app.get('/api/stats', (req, res) => {
  const rows = stmts.listPackages.all();
  const total = rows.length;
  const archived = rows.filter(r => r.archived).length;
  const active = total - archived;
  const byCarrier = {};
  const byStatus = {};
  for (const r of rows) {
    byCarrier[r.carrier || 'Unknown'] = (byCarrier[r.carrier || 'Unknown'] || 0) + 1;
    byStatus[r.status || 'unknown'] = (byStatus[r.status || 'unknown'] || 0) + 1;
  }
  res.json({ total, active, archived, byCarrier, byStatus });
});

// ---------- export ----------
app.get('/api/export/json', (req, res) => {
  const rows = stmts.listPackages.all();
  const pkgs = rows.map(r => { const p = rowToPackage(r); p.events = stmts.listEvents.all(p.id).map(rowToEvent); return p; });
  res.setHeader('Content-Disposition', 'attachment; filename="tracking-export.json"');
  res.json(pkgs);
});
app.get('/api/export/csv', (req, res) => {
  const rows = stmts.listPackages.all();
  const lines = ['tracking_number,carrier,label,status,last_event,last_location,last_update,eta,origin,destination'];
  for (const r of rows) {
    const vals = [r.tracking_number, r.carrier, r.label, r.status, r.last_event, r.last_location, r.last_update, r.eta, r.origin, r.destination].map(v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"');
    lines.push(vals.join(','));
  }
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="tracking-export.csv"');
  res.send(lines.join('\n'));
});

// ---------- websocket ----------
const server = app.listen(LISTEN_PORT, () => {
  console.log(`Tracking Packages listening on http://localhost:${LISTEN_PORT}`);
});
const wss = new WebSocketServer({ server });
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'hello', time: new Date().toISOString() }));
});

// periodic auto-refresh every 30 min for active packages
setInterval(async () => {
  try {
    const rows = stmts.listPackages.all().filter(r => !r.archived);
    for (const r of rows) {
      const p = rowToPackage(r);
      await trackAndUpdate(p.id, p.trackingNumber, p.carrier).catch(() => {});
      await new Promise(res => setTimeout(res, 2000));
    }
  } catch (e) { console.error('auto-refresh err', e.message); }
}, 30 * 60 * 1000);
