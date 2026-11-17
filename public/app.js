const API = '';
let packages = [];
let carriers = [];
let ws = null;
let scanned = [];

// ---------- utils ----------
function toast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.add('hidden'), 3000);
}
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
async function api(path, opts) {
  const r = await fetch(API + path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts || {}));
  if (!r.ok) {
    let msg = r.statusText;
    try { const j = await r.json(); msg = j.error || msg; } catch(_) {}
    throw new Error(msg);
  }
  const ct = r.headers.get('content-type') || '';
  if (ct.includes('application/json')) return r.json();
  return r.text();
}

// ---------- navigation ----------
document.querySelectorAll('.nav-btn').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + b.dataset.view).classList.add('active');
    if (b.dataset.view === 'dashboard') renderDashboard();
    if (b.dataset.view === 'packages') renderPackages();
    if (b.dataset.view === 'stats') renderStats();
    if (b.dataset.view === 'map') populateMapSelect();
    if (b.dataset.view === 'alerts') renderAlerts();
    if (b.dataset.view === 'scan') renderScanHistory();
  });
});

// ---------- websocket ----------
function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(proto + '://' + location.host);
  ws.onopen = () => { document.getElementById('wsStatus').style.color = '#22c55e'; };
  ws.onclose = () => { document.getElementById('wsStatus').style.color = '#ef4444'; setTimeout(connectWS, 3000); };
  ws.onmessage = (ev) => {
    try {
      const m = JSON.parse(ev.data);
      if (m.type === 'package-updated') {
        const idx = packages.findIndex(p => p.id === m.package.id);
        if (idx >= 0) packages[idx] = m.package; else packages.unshift(m.package);
        renderPackages();
        renderDashboard();
        toast('Encomenda atualizada: ' + m.package.trackingNumber);
      }
    } catch(_) {}
  };
}
connectWS();

// ---------- carriers ----------
async function loadCarriers() {
  carriers = await api('/api/carriers');
  const sel = document.getElementById('addCarrier');
  const f = document.getElementById('filterCarrier');
  carriers.forEach(c => {
    const o = document.createElement('option'); o.value = c.name; o.textContent = c.name;
    sel.appendChild(o);
    const o2 = document.createElement('option'); o2.value = c.name; o2.textContent = c.name;
    f.appendChild(o2);
  });
}

// ---------- packages ----------
async function loadPackages() {
  packages = await api('/api/packages');
  renderPackages();
  renderDashboard();
  populateSelects();
}

function statusColor(s) {
  s = (s || '').toLowerCase();
  if (s.includes('deliv')) return '#22c55e';
  if (s.includes('exception') || s.includes('fail')) return '#ef4444';
  if (s.includes('out for')) return '#f59e0b';
  if (s.includes('transit')) return '#3b82f6';
  return '#94a3b8';
}
function carrierColor(name) {
  const c = carriers.find(x => x.name === name);
  return c ? c.color : '#64748b';
}

function renderPackages() {
  const q = (document.getElementById('searchBox').value || '').toLowerCase();
  const fc = document.getElementById('filterCarrier').value;
  const fs = document.getElementById('filterStatus').value;
  const showArch = document.getElementById('showArchived').checked;
  const grid = document.getElementById('packagesGrid');
  let list = packages.filter(p => {
    if (!showArch && p.archived) return false;
    if (fc && p.carrier !== fc) return false;
    if (fs && !(p.status || '').toLowerCase().includes(fs)) return false;
    if (q) {
      const hay = [p.trackingNumber, p.carrier, p.label, p.lastEvent, p.lastLocation].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  if (list.length === 0) { grid.innerHTML = '<div class="empty">Nenhuma encomenda.</div>'; return; }
  grid.innerHTML = list.map(p => `
    <div class="pkg-card ${p.archived?'archived':''}" data-id="${p.id}">
      <div class="pkg-header">
        <span class="pkg-number">${esc(p.trackingNumber)}</span>
        <span class="carrier-badge" style="background:${carrierColor(p.carrier)}">${esc(p.carrier||'?')}</span>
      </div>
      ${p.label ? `<div class="pkg-meta">${esc(p.label)}</div>` : ''}
      <div class="pkg-status" style="color:${statusColor(p.status)}">● ${esc(p.status||'pending')}</div>
      <div class="pkg-meta">${esc(p.lastEvent||'')}</div>
      <div class="pkg-meta">📍 ${esc(p.lastLocation||'—')} · ${esc(p.lastUpdate ? new Date(p.lastUpdate).toLocaleString() : '')}</div>
      ${p.eta ? `<div class="pkg-meta">ETA: ${esc(new Date(p.eta).toLocaleDateString())}</div>` : ''}
      <div class="pkg-actions">
        <button onclick="event.stopPropagation();refreshPkg(${p.id})">⟳</button>
        <button onclick="event.stopPropagation();openDetail(${p.id})">Detalhes</button>
        <button onclick="event.stopPropagation();toggleArchive(${p.id})">${p.archived?'Desarquivar':'Arquivar'}</button>
        <button onclick="event.stopPropagation();deletePkg(${p.id})">✕</button>
      </div>
    </div>
  `).join('');
  grid.querySelectorAll('.pkg-card').forEach(c => c.addEventListener('click', () => openDetail(parseInt(c.dataset.id))));
}

async function refreshPkg(id) {
  try { const p = await api('/api/packages/' + id + '/refresh', { method: 'POST' }); 
    const idx = packages.findIndex(x=>x.id===id); if(idx>=0) packages[idx]=p; renderPackages(); toast('Atualizado'); }
  catch(e){ toast('Erro: '+e.message,'err'); }
}
async function deletePkg(id) {
  if (!confirm('Remover esta encomenda?')) return;
  await api('/api/packages/' + id, { method: 'DELETE' });
  packages = packages.filter(p=>p.id!==id);
  renderPackages(); renderDashboard();
  toast('Removida');
}
async function toggleArchive(id) {
  const p = packages.find(x=>x.id===id);
  await api('/api/packages/' + id, { method: 'PUT', body: JSON.stringify({ archived: !p.archived }) });
  p.archived = !p.archived;
  renderPackages();
}

function openDetail(id) {
  const p = packages.find(x=>x.id===id);
  if (!p) return;
  const body = document.getElementById('modalBody');
  body.innerHTML = `
    <h2>${esc(p.trackingNumber)} <span class="carrier-badge" style="background:${carrierColor(p.carrier)}">${esc(p.carrier||'?')}</span></h2>
    ${p.label ? `<p><b>${esc(p.label)}</b></p>` : ''}
    <p style="color:${statusColor(p.status)}">Estado: ${esc(p.status||'pending')}</p>
    <p>Último evento: ${esc(p.lastEvent||'—')}</p>
    <p>Localização: ${esc(p.lastLocation||'—')}</p>
    <p>Atualizado: ${esc(p.lastUpdate ? new Date(p.lastUpdate).toLocaleString() : '—')}</p>
    ${p.eta ? `<p>ETA: ${esc(new Date(p.eta).toLocaleString())}</p>` : ''}
    ${p.origin ? `<p>Origem: ${esc(p.origin)}</p>` : ''}
    ${p.destination ? `<p>Destino: ${esc(p.destination)}</p>` : ''}
    ${p.notes ? `<p>Notas: ${esc(p.notes)}</p>` : ''}
    <p><a href="${carriers? '' : ''}${esc(carriers.find(c=>c.name===p.carrier)?.url?.replace('{n}',p.trackingNumber) || 'https://t.17track.net/en#nums='+encodeURIComponent(p.trackingNumber))}" target="_blank">Abrir na transportadora ↗</a></p>
    <h3>Histórico de eventos</h3>
    <div class="timeline">
      ${(p.events||[]).map(e => `
        <div class="tl-item">
          <div class="tl-dot"></div>
          <div class="tl-content">
            <div class="tl-date">${esc(e.date ? new Date(e.date).toLocaleString() : '')}</div>
            <div class="tl-desc">${esc(e.description||'')}</div>
            <div class="tl-loc">${esc(e.location||'')}</div>
          </div>
        </div>
      `).join('') || '<div class="empty">Sem eventos.</div>'}
    </div>
    <div style="margin-top:12px">
      <label>Notas
        <textarea id="detailNotes" rows="2">${esc(p.notes||'')}</textarea>
      </label>
      <button class="btn btn-primary" onclick="saveNotes(${p.id})">Guardar notas</button>
    </div>
  `;
  document.getElementById('modal').classList.remove('hidden');
}
async function saveNotes(id) {
  const notes = document.getElementById('detailNotes').value;
  await api('/api/packages/' + id, { method: 'PUT', body: JSON.stringify({ notes }) });
  const p = packages.find(x=>x.id===id); if(p) p.notes = notes;
  toast('Guardado');
}
document.getElementById('modalClose').addEventListener('click', () => document.getElementById('modal').classList.add('hidden'));

// ---------- dashboard ----------
function renderDashboard() {
  const total = packages.length;
  const active = packages.filter(p=>!p.archived).length;
  const delivered = packages.filter(p=>(p.status||'').toLowerCase().includes('deliv')).length;
  const inTransit = packages.filter(p=>(p.status||'').toLowerCase().includes('transit')).length;
  document.getElementById('statCards').innerHTML = `
    <div class="card"><div class="label">Total</div><div class="value">${total}</div></div>
    <div class="card"><div class="label">Ativas</div><div class="value">${active}</div></div>
    <div class="card"><div class="label">Em trânsito</div><div class="value">${inTransit}</div></div>
    <div class="card"><div class="label">Entregues</div><div class="value">${delivered}</div></div>
  `;
  const recent = [...packages].sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt)).slice(0,8);
  document.getElementById('recentList').innerHTML = recent.length ? recent.map(p => `
    <div class="list-item" onclick="openDetail(${p.id})">
      <div><div class="title">${esc(p.trackingNumber)}</div><div class="sub">${esc(p.carrier||'')} · ${esc(p.status||'')}</div></div>
      <div class="sub">${esc(p.lastLocation||'')}</div>
    </div>
  `).join('') : '<div class="empty">Sem encomendas.</div>';
  // carrier bars
  const counts = {};
  packages.forEach(p => { counts[p.carrier||'Unknown'] = (counts[p.carrier||'Unknown']||0)+1; });
  const max = Math.max(1, ...Object.values(counts));
  document.getElementById('carrierBars').innerHTML = Object.entries(counts).map(([k,v]) => `
    <div class="bar-row"><div class="bar-label">${esc(k)}</div><div class="bar-track"><div class="bar-fill" style="width:${v/max*100}%;background:${carrierColor(k)}"></div></div><div class="bar-val">${v}</div></div>
  `).join('') || '<div class="empty">Sem dados.</div>';
  // activity feed
  const events = [];
  packages.forEach(p => (p.events||[]).forEach(e => events.push({ p, e })));
  events.sort((a,b) => new Date(b.e.date||0) - new Date(a.e.date||0));
  document.getElementById('activityFeed').innerHTML = events.slice(0,15).map(x => `
    <div class="feed-item">
      <div><b>${esc(x.p.trackingNumber)}</b> — ${esc(x.e.description||'')}</div>
      <div class="time">${esc(x.e.location||'')} · ${esc(x.e.date ? new Date(x.e.date).toLocaleString() : '')}</div>
    </div>
  `).join('') || '<div class="empty">Sem atividade.</div>';
}

// ---------- add ----------
document.getElementById('addForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const num = document.getElementById('addNumber').value.trim();
  const carrier = document.getElementById('addCarrier').value;
  const label = document.getElementById('addLabel').value.trim();
  const notes = document.getElementById('addNotes').value.trim();
  try {
    const p = await api('/api/packages', { method: 'POST', body: JSON.stringify({ trackingNumber: num, carrier: carrier||null, label, notes }) });
    packages.unshift(p);
    renderPackages(); renderDashboard();
    toast('Adicionada: ' + num);
    document.getElementById('addForm').reset();
  } catch(err) { toast('Erro: ' + err.message); }
});
document.getElementById('bulkForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = document.getElementById('bulkNumbers').value;
  const nums = text.split(/[\s,;]+/).map(s=>s.trim()).filter(Boolean);
  let ok = 0;
  for (const n of nums) {
    try { const p = await api('/api/packages', { method: 'POST', body: JSON.stringify({ trackingNumber: n }) }); packages.unshift(p); ok++; }
    catch(err) { console.warn(err.message); }
  }
  renderPackages(); renderDashboard();
  toast(`Adicionadas ${ok}/${nums.length}`);
  document.getElementById('bulkForm').reset();
});

// filters
['searchBox','filterCarrier','filterStatus','showArchived'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', renderPackages);
  if (el) el.addEventListener('change', renderPackages);
});

// ---------- scan ----------
async function renderScanHistory() {
  const h = await api('/api/scan/history');
  document.getElementById('scanHistory').innerHTML = h.map(x => `
    <div class="list-item">
      <div><div class="title">${esc((x.text||'').slice(0,60))}</div><div class="sub">${x.found.length} números · ${new Date(x.createdAt).toLocaleString()}</div></div>
    </div>
  `).join('') || '<div class="empty">Sem histórico.</div>';
}
document.getElementById('scanBtn').addEventListener('click', async () => {
  const text = document.getElementById('scanText').value;
  const r = await api('/api/scan', { method: 'POST', body: JSON.stringify({ text }) });
  scanned = r.found;
  const div = document.getElementById('scanResults');
  div.innerHTML = scanned.length ? scanned.map((f,i) => `
    <div class="scan-item">
      <div><b>${esc(f.number)}</b> <span class="carrier-badge" style="background:${carrierColor(f.carrier)}">${esc(f.carrier)}</span></div>
      <button class="btn" onclick="addScanned(${i})">Adicionar</button>
    </div>
  `).join('') : '<div class="empty">Nenhum número detetado.</div>';
});
window.addScanned = async function(i) {
  const f = scanned[i];
  try { const p = await api('/api/packages', { method: 'POST', body: JSON.stringify({ trackingNumber: f.number, carrier: f.carrier }) }); packages.unshift(p); renderPackages(); toast('Adicionada'); }
  catch(e){ toast('Erro: '+e.message); }
};
document.getElementById('scanAddAll').addEventListener('click', async () => {
  let ok=0;
  for (const f of scanned) { try { const p = await api('/api/packages',{method:'POST',body:JSON.stringify({trackingNumber:f.number,carrier:f.carrier})}); packages.unshift(p); ok++; } catch(e){} }
  renderPackages(); toast(`Adicionadas ${ok}`);
});

// ---------- map ----------
function populateMapSelect() {
  const sel = document.getElementById('mapSelect');
  sel.innerHTML = '<option value="">-- escolher --</option>' + packages.map(p => `<option value="${p.id}">${esc(p.trackingNumber)} (${esc(p.carrier||'')})</option>`).join('');
}
document.getElementById('mapSelect').addEventListener('change', (e) => {
  const id = parseInt(e.target.value);
  const p = packages.find(x=>x.id===id);
  if (!p) { document.getElementById('map').innerHTML = 'Selecione uma encomenda.'; document.getElementById('routeInfo').innerHTML=''; return; }
  const evs = (p.events||[]).slice().reverse();
  const url = 'https://www.google.com/maps?q=' + encodeURIComponent((p.lastLocation||p.destination||''));
  document.getElementById('map').innerHTML = `<iframe src="https://maps.google.com/maps?q=${encodeURIComponent(p.lastLocation||p.destination||'')}&output=embed" width="100%" height="100%" style="border:0" loading="lazy"></iframe>`;
  document.getElementById('routeInfo').innerHTML = `
    <b>${esc(p.trackingNumber)}</b> — ${esc(p.carrier||'')}<br>
    Origem: ${esc(p.origin||'—')} → Destino: ${esc(p.destination||'—')}<br>
    Última localização: ${esc(p.lastLocation||'—')}<br>
    Eventos: ${evs.length}
    <ul>${evs.map(e=>`<li>${esc(e.date?new Date(e.date).toLocaleString():'')} — ${esc(e.description||'')} (${esc(e.location||'')})</li>`).join('')}</ul>
  `;
}

// ---------- alerts ----------
async function renderAlerts() {
  const list = await api('/api/alerts');
  const sel = document.getElementById('alertPackage');
  sel.innerHTML = '<option value="">Todas as encomendas</option>' + packages.map(p=>`<option value="${p.id}">${esc(p.trackingNumber)}</option>`).join('');
  document.getElementById('alertsList').innerHTML = list.length ? list.map(a => `
    <div class="list-item">
      <div><div class="title">${esc(a.type)} — ${esc(a.channel)}</div><div class="sub">${a.packageId ? 'Pkg #'+a.packageId : 'Todas'} · ${JSON.stringify(a.config)}</div></div>
      <div><button class="btn" onclick="toggleAlert(${a.id})">${a.enabled?'Desativar':'Ativar'}</button> <button class="btn" onclick="deleteAlert(${a.id})">✕</button></div>
    </div>
  `).join('') : '<div class="empty">Sem alertas.</div>';
}
document.getElementById('alertForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pid = document.getElementById('alertPackage').value;
  const type = document.getElementById('alertType').value;
  const channel = document.getElementById('alertChannel').value;
  const target = document.getElementById('alertTarget').value.trim();
  const config = channel === 'email' ? { email: target } : channel === 'webhook' ? { url: target } : {};
  await api('/api/alerts', { method: 'POST', body: JSON.stringify({ packageId: pid ? parseInt(pid) : null, type, channel, config }) });
  renderAlerts(); toast('Alerta criado');
});
window.toggleAlert = async function(id){ await api('/api/alerts/'+id+'/toggle',{method:'PUT'}); renderAlerts(); };
window.deleteAlert = async function(id){ await api('/api/alerts/'+id,{method:'DELETE'}); renderAlerts(); };

// ---------- stats ----------
async function renderStats() {
  const s = await api('/api/stats');
  document.getElementById('statsCards').innerHTML = `
    <div class="card"><div class="label">Total</div><div class="value">${s.total}</div></div>
    <div class="card"><div class="label">Ativas</div><div class="value">${s.active}</div></div>
    <div class="card"><div class="label">Arquivadas</div><div class="value">${s.archived}</div></div>
  `;
  function bars(container, obj) {
    const max = Math.max(1, ...Object.values(obj));
    document.getElementById(container).innerHTML = Object.entries(obj).map(([k,v]) => `
      <div class="bar-row"><div class="bar-label">${esc(k)}</div><div class="bar-track"><div class="bar-fill" style="width:${v/max*100}%"></div></div><div class="bar-val">${v}</div></div>
    `).join('') || '<div class="empty">Sem dados.</div>';
  }
  bars('statsCarrier', s.byCarrier);
  bars('statsStatus', s.byStatus);
  // delivery times
  const delivered = packages.filter(p=>(p.status||'').toLowerCase().includes('deliv'));
  const times = delivered.map(p => {
    if (!p.createdAt || !p.lastUpdate) return null;
    const d = (new Date(p.lastUpdate) - new Date(p.createdAt)) / (1000*60*60*24);
    return d > 0 ? Math.round(d) : null;
  }).filter(x=>x!=null);
  const buckets = {};
  times.forEach(t => { const b = Math.floor(t/2)*2; buckets[b+'-'+(b+1)+'d'] = (buckets[b+'-'+(b+1)+'d']||0)+1; });
  bars('statsDelivery', buckets);
}

// ---------- settings ----------
document.getElementById('settingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const cfg = {
    refreshMinutes: document.getElementById('setRefresh').value,
    theme: document.getElementById('setTheme').value
  };
  await api('/api/settings', { method: 'PUT', body: JSON.stringify(cfg) });
  if (cfg.theme === 'light') document.body.classList.add('light'); else document.body.classList.remove('light');
  toast('Guardado');
});
async function loadSettings() {
  const s = await api('/api/settings');
  if (s.refreshMinutes) document.getElementById('setRefresh').value = s.refreshMinutes;
  if (s.theme) { document.getElementById('setTheme').value = s.theme; if (s.theme==='light') document.body.classList.add('light'); }
}

// ---------- export ----------
document.getElementById('exportCsv').addEventListener('click', () => window.open('/api/export/csv','_blank'));
document.getElementById('exportJson').addEventListener('click', () => window.open('/api/export/json','_blank'));

// ---------- refresh all ----------
document.getElementById('refreshAll').addEventListener('click', async () => {
  toast('A atualizar...');
  await api('/api/packages/refresh-all', { method: 'POST' });
  await loadPackages();
  toast('Atualizado');
});

// ---------- populate selects ----------
function populateSelects() {
  // nothing extra
}

// ---------- init ----------
(async function init() {
  await loadCarriers();
  await loadPackages();
  await loadSettings();
  setInterval(() => { /* auto-refresh client side */ }, 60000);
})();
