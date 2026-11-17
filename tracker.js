// Tracking providers. Tries real APIs when keys present, falls back to scraping/public pages.
const https = require('https');
const http = require('http');

function request(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const options = {
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: opts.method || 'GET',
      headers: Object.assign({ 'User-Agent': 'Mozilla/5.0 (compatible; TrackingPackages/1.0)' }, opts.headers || {}),
      timeout: opts.timeout || 15000
    };
    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

async function try17Track(number) {
  const token = process.env.API_TOKEN_17TRACK || process.env.TRACK17_TOKEN;
  if (!token) return null;
  try {
    const res = await request('https://api.17track.net/track/v2.4/getRealTimeTrackInfo', {
      method: 'POST',
      headers: { '17token': token, 'Content-Type': 'application/json', 'client-id': 'tracking-packages' },
      body: JSON.stringify([{ number }])
    });
    if (res.status !== 200) return null;
    const data = JSON.parse(res.body);
    const item = (data && data.data && data.data.accepted && data.data.accepted[0]) || (Array.isArray(data) ? data[0] : null);
    if (!item) return null;
    return normalize17Track(number, item);
  } catch (e) { return { error: e.message }; }
}

function normalize17Track(number, item) {
  const track = item.track_info || item || {};
  const events = [];
  const providers = track.track || track;
  const list = (providers && (providers.z0 || providers.z1 || providers.z2)) || [];
  // 17track returns events under track.z1 (latest) etc; fallback to any array
  let evs = [];
  if (Array.isArray(track.z1)) evs = track.z1;
  else if (Array.isArray(track.events)) evs = track.events;
  else if (Array.isArray(item.events)) evs = item.events;
  for (const e of evs) {
    events.push({
      date: e.a || e.date || e.time || null,
      description: e.z || e.description || e.status || '',
      location: e.c || e.location || '',
      status: e.z || ''
    });
  }
  const latest = events[0] || {};
  return {
    carrier: item.carrier || item.carrier_code || null,
    status: track.status || item.status || (latest.description || 'In transit'),
    lastEvent: latest.description || '',
    lastLocation: latest.location || '',
    lastUpdate: latest.date || new Date().toISOString(),
    eta: track.estimated_delivery_date || track.eta || null,
    origin: track.origin_country || track.origin || null,
    destination: track.destination_country || track.destination || null,
    events
  };
}

async function tryTrackingMore(number, carrier) {
  const key = process.env.TRACKINGMORE_API_KEY;
  if (!key) return null;
  try {
    const res = await request('https://api.trackingmore.com/v4/trackings/get?tracking_numbers=' + encodeURIComponent(number), {
      headers: { 'Tracking-Api-Key': key }
    });
    if (res.status !== 200) return null;
    const data = JSON.parse(res.body);
    const item = data && data.data && (Array.isArray(data.data) ? data.data[0] : data.data);
    if (!item) return null;
    const evs = (item.origin_info && item.origin_info.trackinfo) || (item.destination_info && item.destination_info.trackinfo) || [];
    const events = evs.map(e => ({
      date: e.Date || e.date,
      description: e.StatusDescription || e.description,
      location: e.Details || e.location,
      status: e.StatusDescription
    }));
    const latest = events[events.length - 1] || events[0] || {};
    return {
      carrier: item.carrier_code || carrier,
      status: item.delivery_status || (latest.description || 'In transit'),
      lastEvent: latest.description || '',
      lastLocation: latest.location || '',
      lastUpdate: latest.date || new Date().toISOString(),
      eta: item.expected_delivery || null,
      origin: item.origin_country_iso2 || null,
      destination: item.destination_country_iso2 || null,
      events
    };
  } catch (e) { return { error: e.message }; }
}

async function tryFedEx(number) {
  const key = process.env.FEDEX_API_KEY;
  const secret = process.env.FEDEX_API_SECRET;
  if (!key || !secret) return null;
  try {
    // OAuth
    const tokenRes = await request((process.env.FEDEX_API_URL || 'https://apis.fedex.com') + '/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=client_credentials&client_id=${encodeURIComponent(key)}&client_secret=${encodeURIComponent(secret)}`
    });
    if (tokenRes.status !== 200) return null;
    const token = JSON.parse(tokenRes.body).access_token;
    const res = await request((process.env.FEDEX_API_URL || 'https://apis.fedex.com') + '/track/v1/trackingnumbers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, 'X-locale': 'en_US' },
      body: JSON.stringify({ includeDetailedScans: true, trackingInfo: [{ trackingNumberInfo: { trackingNumber: number } }] })
    });
    if (res.status !== 200) return null;
    const data = JSON.parse(res.body);
    const r = data && data.output && data.output.completeTrackResults && data.output.completeTrackResults[0] && data.output.completeTrackResults[0].trackResults && data.output.completeTrackResults[0].trackResults[0];
    if (!r) return null;
    const evs = (r.scanEvents || []).map(e => ({
      date: e.date || e.eventTimestamp,
      description: e.eventDescription,
      location: e.scanLocation ? [e.scanLocation.city, e.scanLocation.stateOrProvinceCode, e.scanLocation.countryCode].filter(Boolean).join(', ') : '',
      status: e.eventDescription
    })).reverse();
    const latest = r.latestStatusDetail || {};
    return {
      carrier: 'FedEx',
      status: latest.description || (r.latestStatusDetail && r.latestStatusDetail.description) || 'In transit',
      lastEvent: latest.description || (evs[0] && evs[0].description) || '',
      lastLocation: evs[0] ? evs[0].location : '',
      lastUpdate: evs[0] ? evs[0].date : new Date().toISOString(),
      eta: r.estimatedDeliveryTimeWindow ? r.estimatedDeliveryTimeWindow.window && r.estimatedDeliveryTimeWindow.window.ends : (r.estimatedDeliveryTimestamp || null),
      origin: r.shipperInformation && r.shipperInformation.address && r.shipperInformation.address.city,
      destination: r.recipientInformation && r.recipientInformation.address && r.recipientInformation.address.city,
      events: evs
    };
  } catch (e) { return { error: e.message }; }
}

async function tryUPS(number) {
  // UPS requires OAuth + tracking API; attempt if keys present
  const key = process.env.UPS_CLIENT_ID;
  const secret = process.env.UPS_CLIENT_SECRET;
  if (!key || !secret) return null;
  try {
    const tokenRes = await request('https://onlinetools.ups.com/security/v1/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': 'Basic ' + Buffer.from(key + ':' + secret).toString('base64') },
      body: 'grant_type=client_credentials'
    });
    if (tokenRes.status !== 200) return null;
    const token = JSON.parse(tokenRes.body).access_token;
    const res = await request('https://onlinetools.ups.com/api/track/v1/details/' + encodeURIComponent(number) + '?locale=en_US', {
      headers: { 'Authorization': 'Bearer ' + token, 'transId': 'tp', 'transactionSrc': 'tracking-packages' }
    });
    if (res.status !== 200) return null;
    const data = JSON.parse(res.body);
    const pkg = data && data.trackResponse && data.trackResponse.shipment && data.trackResponse.shipment[0] && data.trackResponse.shipment[0].package;
    const p = Array.isArray(pkg) ? pkg[0] : pkg;
    if (!p) return null;
    const activities = (p.activity || []).map(a => ({
      date: a.date + ' ' + (a.time || ''),
      description: a.status && a.status.description,
      location: a.location ? [a.location.address && a.location.address.city, a.location.address && a.location.address.stateProvince, a.location.address && a.location.address.country].filter(Boolean).join(', ') : '',
      status: a.status && a.status.description
    }));
    const latest = activities[0] || {};
    const del = p.deliveryDate && p.deliveryDate[0];
    return {
      carrier: 'UPS',
      status: latest.description || 'In transit',
      lastEvent: latest.description || '',
      lastLocation: latest.location || '',
      lastUpdate: latest.date || new Date().toISOString(),
      eta: del ? del.date : (p.estimatedDelivery || null),
      origin: null,
      destination: null,
      events: activities
    };
  } catch (e) { return { error: e.message }; }
}

async function tryDHL(number) {
  const key = process.env.DHL_API_KEY;
  if (!key) return null;
  try {
    const res = await request('https://api-eu.dhl.com/track/shipments?trackingNumber=' + encodeURIComponent(number), {
      headers: { 'DHL-API-Key': key }
    });
    if (res.status !== 200) return null;
    const data = JSON.parse(res.body);
    const s = data && data.shipments && data.shipments[0];
    if (!s) return null;
    const evs = (s.events || []).map(e => ({
      date: e.timestamp,
      description: e.description,
      location: e.location ? [e.location.address && e.location.address.addressLocality, e.location.address && e.location.address.countryCode].filter(Boolean).join(', ') : '',
      status: e.description
    }));
    const latest = evs[0] || {};
    return {
      carrier: 'DHL',
      status: s.status && s.status.description || (latest.description || 'In transit'),
      lastEvent: latest.description || '',
      lastLocation: latest.location || '',
      lastUpdate: latest.date || new Date().toISOString(),
      eta: s.estimatedTimeOfDelivery || null,
      origin: s.origin && s.origin.address && s.origin.address.addressLocality,
      destination: s.destination && s.destination.address && s.destination.address.addressLocality,
      events: evs
    };
  } catch (e) { return { error: e.message }; }
}

// Public fallback: scrape carrier public tracking pages lightly to extract status text.
async function scrapePublic(number, carrier) {
  const urls = {
    UPS: `https://www.ups.com/track?tracknum=${encodeURIComponent(number)}`,
    FedEx: `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(number)}`,
    USPS: `https://tools.usps.com/go/TrackConfirmAction?qtc_tLabels1=${encodeURIComponent(number)}`,
    DHL: `https://www.dhl.com/en/express/tracking.html?AWB=${encodeURIComponent(number)}`,
    'La Poste': `https://www.laposte.fr/outils/suivre-vos-envois?code=${encodeURIComponent(number)}`,
    RoyalMail: `https://www.royalmail.com/track-your-item#/tracking-results/${encodeURIComponent(number)}`,
    CTT: `https://www.ctt.pt/feapl_2/app/open/objectSearch/objectSearch.jsf?objects=${encodeURIComponent(number)}`,
    Correios: `https://rastreamento.correios.com.br/app/index.php?objetos=${encodeURIComponent(number)}`,
    Amazon: `https://track.amazon.com/tracking/${encodeURIComponent(number)}`,
    Cainiao: `https://global.cainiao.com/detail.htm?mailNoList=${encodeURIComponent(number)}`
  };
  const url = urls[carrier];
  if (!url) return null;
  try {
    const res = await request(url, { timeout: 20000 });
    if (res.status >= 400) return null;
    // Extract a short status-ish snippet
    const text = res.body.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const snippet = text.slice(0, 1500);
    return {
      carrier,
      status: 'See carrier page',
      lastEvent: snippet.slice(0, 280),
      lastLocation: '',
      lastUpdate: new Date().toISOString(),
      eta: null,
      origin: null,
      destination: null,
      events: [],
      sourceUrl: url,
      rawSnippet: snippet
    };
  } catch (e) { return { error: e.message }; }
}

async function track(number, carrier) {
  const c = carrier || null;
  // Try specialized APIs
  let result = null;
  if (c === 'FedEx' || (!c)) result = await tryFedEx(number);
  if (!result || result.error) {
    if (c === 'UPS' || (!c && /1Z/i.test(number))) result = await tryUPS(number);
  }
  if (!result || result.error) {
    if (c === 'DHL' || (!c)) result = await tryDHL(number);
  }
  // Generic aggregators
  if (!result || result.error) result = await tryTrackingMore(number, c);
  if (!result || result.error) result = await try17Track(number);
  // Fallback scrape
  if (!result || result.error) result = await scrapePublic(number, c || '17Track');
  if (result && result.error) {
    // last resort: 17track public link, no data
    result = {
      carrier: c || 'Unknown',
      status: 'Unknown - check carrier page',
      lastEvent: result.error,
      lastLocation: '',
      lastUpdate: new Date().toISOString(),
      eta: null, origin: null, destination: null, events: [],
      sourceUrl: `https://t.17track.net/en#nums=${encodeURIComponent(number)}`
    };
  }
  return result;
}

module.exports = { track, request };
