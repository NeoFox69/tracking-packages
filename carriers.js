// Carrier detection, tracking URLs, and metadata.
const CARRIERS = {
  UPS: {
    name: 'UPS',
    patterns: [/^1Z[A-Z0-9]{16}$/i],
    url: 'https://www.ups.com/track?tracknum={n}',
    color: '#351C15',
    logo: 'UPS',
    api: 'ups'
  },
  FedEx: {
    name: 'FedEx',
    patterns: [/^[0-9]{12}$/, /^[0-9]{15}$/, /^[0-9]{20}$/],
    url: 'https://www.fedex.com/fedextrack/?trknbr={n}',
    color: '#4D148C',
    logo: 'FedEx',
    api: 'fedex'
  },
  USPS: {
    name: 'USPS',
    patterns: [/^94[0-9]{20}$/, /^9[2-5][0-9]{20}$/, /^[0-9]{20,22}$/],
    url: 'https://tools.usps.com/go/TrackConfirmAction?qtc_tLabels1={n}',
    color: '#333366',
    logo: 'USPS',
    api: 'usps'
  },
  Amazon: {
    name: 'Amazon',
    patterns: [/^TBA[0-9]{12}US$/i],
    url: 'https://track.amazon.com/tracking/{n}',
    color: '#FF9900',
    logo: 'Amazon',
    api: 'amazon'
  },
  DHL: {
    name: 'DHL',
    patterns: [/^[0-9]{10,11}$/, /^JD[0-9]{18}$/, /^JJD[0-9]{16}$/, /^JVGL[0-9]{9}$/, /^[0-9]{12,13}$/],
    url: 'https://www.dhl.com/en/express/tracking.html?AWB={n}',
    color: '#FFCC00',
    logo: 'DHL',
    api: 'dhl'
  },
  TNT: {
    name: 'TNT',
    patterns: [/^[0-9]{9}$/, /^GM[0-9]{9}.*[A-Z]{2}$/i, /^GE[0-9]{9}.*[A-Z]{2}$/i],
    url: 'https://www.tnt.com/express/en_gb/site/tracking.html?searchType=con&cons={n}',
    color: '#FF6600',
    logo: 'TNT',
    api: 'tnt'
  },
  Correios: {
    name: 'Correios',
    patterns: [/^[A-Z]{2}[0-9]{9}[A-Z]{2}$/i, /^([A-Z]{2})?[0-9]{9}([A-Z]{2})?$/i],
    url: 'https://rastreamento.correios.com.br/app/index.php?objetos={n}',
    color: '#003399',
    logo: 'Correios',
    api: 'correios'
  },
  CTT: {
    name: 'CTT',
    patterns: [/^[A-Z]{2}[0-9]{9}PT$/i, /^RC[0-9]{9}PT$/i, /^RR[0-9]{9}PT$/i],
    url: 'https://www.ctt.pt/feapl_2/app/open/objectSearch/objectSearch.jsf?objects={n}',
    color: '#E30613',
    logo: 'CTT',
    api: 'ctt'
  },
  'La Poste': {
    name: 'La Poste',
    patterns: [/^[0-9]{11}$/, /^8U[0-9]{9}[A-Z]{2}$/i, /^6A[0-9]{9}[A-Z]{2}$/i],
    url: 'https://www.laposte.fr/outils/suivre-vos-envois?code={n}',
    color: '#0066CC',
    logo: 'La Poste',
    api: 'laposte'
  },
  RoyalMail: {
    name: 'Royal Mail',
    patterns: [/^[A-Z]{2}[0-9]{9}GB$/i],
    url: 'https://www.royalmail.com/track-your-item#/tracking-results/{n}',
    color: '#CC0000',
    logo: 'Royal Mail',
    api: 'royalmail'
  },
  Cainiao: {
    name: 'Cainiao',
    patterns: [/^LP[0-9]{9,}$/i, /^[0-9]{13,16}$/],
    url: 'https://global.cainiao.com/detail.htm?mailNoList={n}',
    color: '#FF6A00',
    logo: 'Cainiao',
    api: 'cainiao'
  },
  '17Track': {
    name: '17Track',
    patterns: [],
    url: 'https://t.17track.net/en#nums={n}',
    color: '#1E88E5',
    logo: '17Track',
    api: '17track'
  }
};

// Order matters: more specific first
const DETECTION_ORDER = ['Amazon', 'UPS', 'CTT', 'RoyalMail', 'Correios', 'FedEx', 'TNT', 'DHL', 'La Poste', 'USPS', 'Cainiao'];

function detectCarrier(num) {
  if (!num) return null;
  const n = String(num).trim().toUpperCase().replace(/\s+/g, '');
  for (const key of DETECTION_ORDER) {
    const c = CARRIERS[key];
    for (const re of c.patterns) {
      if (re.test(n)) return c.name;
    }
  }
  return null;
}

function getTrackingUrl(num, carrier) {
  const n = String(num).trim().toUpperCase().replace(/\s+/g, '');
  let name = carrier;
  if (!name) name = detectCarrier(n) || '17Track';
  const c = Object.values(CARRIERS).find(x => x.name === name) || CARRIERS['17Track'];
  return c.url.replace('{n}', encodeURIComponent(n));
}

function carrierInfo(name) {
  return Object.values(CARRIERS).find(x => x.name === name) || null;
}

function carrierList() {
  return Object.values(CARRIERS).map(c => ({ name: c.name, color: c.color, logo: c.logo, api: c.api }));
}

// Extract tracking numbers from free-form text
function scanText(text) {
  if (!text) return [];
  const found = new Set();
  const results = [];
  // Known prefixes
  const regexes = [
    /1Z[A-Z0-9]{16}/gi,
    /TBA[0-9]{12}US/gi,
    /94[0-9]{20}/g,
    /9[2-5][0-9]{20}/g,
    /JD[0-9]{18}/gi,
    /JJD[0-9]{16}/gi,
    /JVGL[0-9]{9}/gi,
    /[A-Z]{2}[0-9]{9}[A-Z]{2}/gi,
    /[A-Z]{2}[0-9]{9}PT/gi,
    /LP[0-9]{9,}/gi,
    /\b\d{12}\b/g,
    /\b\d{15}\b/g,
    /\b\d{20,22}\b/g,
    /\b\d{10,11}\b/g,
    /\b\d{9}\b/g
  ];
  for (const re of regexes) {
    let m;
    const r = new RegExp(re.source, re.flags);
    while ((m = r.exec(text)) !== null) {
      const num = m[0].replace(/\s+/g, '');
      if (found.has(num)) continue;
      // validate
      const carrier = detectCarrier(num);
      if (!carrier) continue;
      found.add(num);
      results.push({ number: num, carrier });
    }
  }
  return results;
}

module.exports = { CARRIERS, detectCarrier, getTrackingUrl, carrierInfo, carrierList, scanText };
