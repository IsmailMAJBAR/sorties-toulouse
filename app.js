'use strict';

// ---------- petits outils ----------

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : null);
const fold = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toDate = (s) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const sday = (s) => s.slice(0, 10);
const time = (s) => (s.length > 10 ? s.slice(11, 16) : null);

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* navigation privée */ } },
};

const fmtDay = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtShort = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtDM = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const fmtStamp = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

const CAT_ORDER = ['Concert', 'Soirée', 'Rencontre', 'Spectacle', 'Humour', 'Expo', 'Cinéma', 'Festival', 'Atelier', 'Conférence', 'Rando', 'Visite', 'Sport', 'Marché', 'Autre'];
const CAT_VAR = { Rando: 'rando', Concert: 'concert', Soirée: 'soiree', Rencontre: 'rencontre', Spectacle: 'spectacle', Humour: 'humour', Expo: 'expo', Cinéma: 'cinema', Festival: 'festival', Atelier: 'atelier', Conférence: 'conference', Visite: 'visite', Sport: 'sport', Marché: 'marche', Autre: 'autre' };
const WHEN_LABEL = { today: "Aujourd'hui", tomorrow: 'Demain', weekend: 'Ce week-end', nextweekend: 'Week-end prochain', '7days': '7 prochains jours', nextweek: 'Semaine prochaine', '30days': '30 prochains jours', all: 'Tout', custom: 'Dates choisies' };
const PAGE = 80;

const ICON = {
  star: '<svg viewBox="0 0 24 24"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>',
  cal: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M12 13v5M9.5 15.5h5"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  nope: '<svg viewBox="0 0 24 24"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.7a2 2 0 0 0-2 1.7l-1.4 9A2 2 0 0 0 4.3 15zM17 2h2.7A2.3 2.3 0 0 1 22 4v7a2.3 2.3 0 0 1-2.3 2H17"/></svg>',
  check: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8L16.5 9.5"/></svg>',
};

// ---------- pré-filtre "Sélection" ----------
// Chaque sortie reçoit une note. En mode Sélection on ne garde que celles qui dépassent un seuil,
// et au maximum PER_DAY par jour (les mieux notées). Tout est réglable ici et dans "Mes goûts".

const TASTE_VAL = { love: 2.5, ok: 0, nope: -4 };
// Par défaut : ce qui fait tester, apprendre, découvrir passe devant (ateliers, initiations, expériences).
const DEFAULT_TASTES = {
  Concert: 'love', Soirée: 'ok', Rencontre: 'ok', Spectacle: 'love', Humour: 'love', Expo: 'ok', Cinéma: 'ok',
  Festival: 'love', Atelier: 'love', Conférence: 'ok', Rando: 'love', Visite: 'ok', Sport: 'ok', Marché: 'ok', Autre: 'ok',
};
// La note affichée est sur 10 : 5 + la somme des bonus/malus (bornée entre 0 et 10).
const BASE = 5;
const THRESHOLD = 1;    // Sélection : note ≥ 6/10
const PER_DAY = 8;      // sorties max par jour dans la Sélection
const TOP = 4;          // badge "Top" : note ≥ 9/10
// "À essayer" : tester un truc nouveau, apprendre, s'initier, vivre une expérience
const DISCOVERY = /\b(initiations?|s'initier|decouverte|premiers? pas|premier cours|cours d'essai|seance d'essai|essai gratuit|bapteme|apprendre|apprentissage|workshop|masterclass|demonstration|degustation|oenologie|escape game|immersi(ve|f)|realite virtuelle|fabriquer|fabrique ton|fabrication|diy|poterie|ceramique|modelage|cours de cuisine|patisserie|brassage|escalade|parapente|plongee|kayak|paddle|tir a l'arc|cours de danse|salsa|bachata|swing|tango|impro|sculpture|calligraphie|couture|tricot|reliure|vitrail|forge|menuiserie|jardinage|permaculture|astronomie|planetarium|observation des etoiles|sortie nature|balade (botanique|naturaliste|photo)|jeu de piste|chasse au tresor)\b/;
// Mots qui trahissent une sortie "pas ouf" (administratif, très spécialisé, pour les tout-petits…)
const BORING = /\b(reunions? publiques?|conseil de quartier|concertation|permanences?|assemblee generale|formations?|aide (aux|a la|administrative)|demarches|numerique|informatique|ordinateur|cv|emploi|job ?dating|recrutement|aidants?|seniors?|bebes?|tout[- ]petits|heure du conte|bebe lecteur|webinaire|don du sang|collecte|whatsapp|vaccination|depistage|prevention|parentalite|soutien scolaire|aide aux devoirs|accompagnement)\b/;
// Lieux qui valent souvent le déplacement : petit bonus
const TOP_VENUES = /zenith|bikini|metronum|capitole|halle aux grains|garonne|sorano|\brex\b|cave poesie|cite de l.espace|abattoirs|bazacle|quai des savoirs|cinematheque|casino barriere|interference|odyssud|theatre de la cite|museum|augustins|brique comedy|citron bleu|carmelites|jacobins|prairie des filtres|grand rond|envol des pionniers|aeroscopia|halle de la machine|chapelle/;

// ---------- état (synchronisé avec l'adresse de la page, pour partager une recherche) ----------

const state = {
  when: 'weekend', shift: 0, from: '', to: '', q: '', cats: new Set(), sources: new Set(),
  city: '', moment: '', free: false, kids: false, favs: false, hideFull: false, try: false, tab: 'events', pick: 'best',
};
const TOGGLES = ['try', 'free', 'kids', 'favs', 'hideFull'];
let planSeed = 0, lastPlan = [];
let PLACES = [];
let tested = new Set(store.get('sorties-testes', []));
state.pkind = ''; state.showTested = false;
let favs = new Set(store.get('sorties-favs', []));
let hidden = new Set(store.get('sorties-masques', []));
let tastes = { ...DEFAULT_TASTES, ...store.get('sorties-gouts', {}) };
let learned = store.get('sorties-appris', { cat: {}, venue: {} });
let DATA = null, EVENTS = [], limit = PAGE;
const expandedDays = new Set();

// "apprentissage" très simple : un ⭐ ou un 👎 fait monter/descendre la catégorie et le lieu
function learn(e, delta) {
  const clamp = (v) => Math.max(-4, Math.min(4, v));
  learned.cat[e.category] = clamp((learned.cat[e.category] || 0) + delta);
  if (e.venue) { const v = fold(e.venue); learned.venue[v] = clamp((learned.venue[v] || 0) + delta); }
  store.set('sorties-appris', learned);
}

// Renvoie la note (en points autour de 0) ET la liste des raisons, affichée sous chaque sortie.
function score(e) {
  const why = [];
  let s = 0;
  const add = (v, label) => { if (v) { why.push([v, label]); s += v; } };
  const t = tastes[e.category] || 'ok';
  if (t !== 'ok') add(TASTE_VAL[t], t === 'love' ? `${e.category} : tu aimes (Mes goûts)` : `${e.category} : pas pour toi (Mes goûts)`);
  if (e._discT) add(2.5, `À essayer : « ${e._discT} » dans le titre`);
  else if (e._discD) add(1, `À essayer : « ${e._discD} » dans la description`);
  if (e.sources.length > 1) add(2, `Annoncé sur ${e.sources.length} sites (${e.sources.join(', ')})`);
  if (TOP_VENUES.test(fold(e.venue))) add(1.5, `Lieu qui vaut le coup : ${e.venue}`);
  const boring = e._text.match(BORING);
  if (boring) add(-5, `Sent le « pas ouf » : « ${boring[0]} »`);
  if (e.kids && !state.kids) add(-1.5, 'Pensé pour les enfants');
  const rando = e.category === 'Rando'; // une rando est forcément hors de la ville, et souvent sans photo
  if (rando && e.rando) add(0.5, 'Sortie encadrée par un club (Pyrénées Club)');
  if (!rando) add(e.image ? 0.3 : -0.7, e.image ? 'Fiche avec photo' : 'Pas de photo (fiche peu soignée)');
  if ((e.desc || '').length > 60) add(0.3, 'Description détaillée');
  if (e.free) add(0.5, 'Gratuit');
  if (!rando && e.city && e.city !== 'Toulouse') add(-0.7, `Hors Toulouse (${e.city})`);
  if (e.full) add(-0.5, 'Complet');
  add(Math.round(6 * (learned.cat[e.category] || 0)) / 10, `Tes ⭐ / 👎 sur « ${e.category} »`);
  add(learned.venue[fold(e.venue)] || 0, 'Tes ⭐ / 👎 sur ce lieu');
  return { s, why };
}
const note10 = (s) => Math.max(0, Math.min(10, BASE + s));
const fmtNote = (n) => (Math.round(n * 10) / 10).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
const fmtPts = (v) => (v > 0 ? '+' : '−') + fmtNote(Math.abs(v));

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  state.when = p.get('when') || 'weekend';
  state.shift = Math.max(0, parseInt(p.get('sh') || '0', 10) || 0);
  // anciens liens : "week-end pro" / "semaine pro" = la période d'après
  if (state.when === 'nextweekend') { state.when = 'weekend'; state.shift += 1; }
  if (state.when === 'nextweek') { state.when = '7days'; state.shift += 1; }
  state.from = p.get('from') || ''; state.to = p.get('to') || '';
  state.q = p.get('q') || '';
  state.cats = new Set((p.get('cat') || '').split(',').filter(Boolean));
  state.sources = new Set((p.get('src') || '').split(',').filter(Boolean));
  state.city = p.get('city') || '';
  state.moment = p.get('m') || '';
  state.free = p.has('free'); state.kids = p.has('kids'); state.favs = p.has('fav'); state.hideFull = p.has('nofull');
  state.tab = ['ongoing', 'plan', 'dates', 'places', 'deals'].includes(p.get('tab')) ? p.get('tab') : 'events';
  state.pkind = p.get('pk') || '';
  state.pick = p.has('all') ? 'all' : 'best';
  state.try = p.has('try');
}
function writeHash() {
  const p = new URLSearchParams();
  if (state.when !== 'weekend') p.set('when', state.when);
  if (state.shift) p.set('sh', String(state.shift));
  if (state.when === 'custom') { if (state.from) p.set('from', state.from); if (state.to) p.set('to', state.to); }
  if (state.q) p.set('q', state.q);
  if (state.cats.size) p.set('cat', [...state.cats].join(','));
  if (state.sources.size) p.set('src', [...state.sources].join(','));
  if (state.city) p.set('city', state.city);
  if (state.moment) p.set('m', state.moment);
  if (state.free) p.set('free', '');
  if (state.kids) p.set('kids', '');
  if (state.favs) p.set('fav', '');
  if (state.hideFull) p.set('nofull', '');
  if (state.tab !== 'events') p.set('tab', state.tab);
  if (state.pick === 'all') p.set('all', '');
  if (state.try) p.set('try', '');
  if (state.pkind) p.set('pk', state.pkind);
  const h = p.toString().replace(/=(&|$)/g, '$1');
  history.replaceState(null, '', h ? `#${h}` : location.pathname + location.search);
}

// ---------- périodes ----------

function range() {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const dow = t.getDay(); // 0 = dimanche
  const horizon = DATA?.horizon ? toDate(DATA.horizon) : addDays(t, 120);
  switch (state.when) {
    case 'today': return [t, t];
    case 'tomorrow': return [addDays(t, 1), addDays(t, 1)];
    case 'weekend': {
      const k = state.shift || 0; // 0 = ce week-end, 1 = le suivant, …
      const sat = dow === 0 ? addDays(t, -1) : addDays(t, 6 - dow); // samedi de "ce week-end"
      if (k > 0) return [addDays(sat, 7 * k - 1), addDays(sat, 7 * k + 1)]; // vendredi → dimanche
      if (dow === 6) return [t, addDays(t, 1)];
      if (dow === 0) return [t, t];
      return [addDays(sat, -1), addDays(sat, 1)];
    }
    case '7days': { const k = state.shift || 0; return [addDays(t, 7 * k), addDays(t, 7 * k + 6)]; }
    case '30days': return [t, addDays(t, 29)];
    case 'custom': {
      const a = state.from ? toDate(state.from) : t;
      const b = state.to ? toDate(state.to) : a;
      return a <= b ? [a, b] : [b, a];
    }
    default: return [t, horizon];
  }
}
function rangeLabel([a, b]) {
  if (ymd(a) === ymd(b)) return fmtShort.format(a);
  return `${fmtShort.format(a)} → ${fmtShort.format(b)}`;
}
// nom de la période affichée, avec les vraies dates : "Week-end prochain · ven. 4 → dim. 6 déc."
function periodName() {
  const k = state.shift || 0;
  const [a] = range();
  switch (state.when) {
    case 'today': return "Aujourd'hui";
    case 'tomorrow': return 'Demain';
    case 'weekend': return k === 0 ? 'Ce week-end' : k === 1 ? 'Week-end prochain' : `Week-end dans ${k} semaines`;
    case '7days': return k === 0 ? '7 prochains jours' : k === 1 ? 'La semaine d\'après' : `Semaine dans ${k} semaines`;
    case 'custom': { const r = relDay(ymd(a)); return r ? r[0].toUpperCase() + r.slice(1) : 'Date choisie'; }
    case '30days': return '30 prochains jours';
    default: return 'Tout le programme';
  }
}
// ‹ › : période précédente / suivante (même durée ; un week-end avance d'une semaine)
function shiftPeriod(dir) {
  if (state.when === 'weekend' || state.when === '7days') { state.shift = Math.max(0, (state.shift || 0) + dir); return; }
  const [a, b] = range();
  const len = Math.round((b - a) / 864e5) + 1;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  let na = addDays(a, dir * len);
  if (na < t) na = t;
  state.when = 'custom';
  state.from = ymd(na);
  state.to = len > 1 ? ymd(addDays(na, len - 1)) : '';
}
function relDay(d) {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const diff = Math.round((toDate(d) - t) / 864e5);
  return diff === 0 ? "aujourd'hui" : diff === 1 ? 'demain' : '';
}

// ---------- filtrage ----------

function momentOk(s) {
  if (!state.moment) return true;
  const h = time(s[0]);
  const allDay = !h || (h === '00:00' && (time(s[1]) || '23:59') >= '23:00');
  const evening = !allDay && h >= '18:00';
  return state.moment === 'evening' ? evening : !evening;
}

function compute() {
  const [a, b] = range();
  const from = ymd(a), to = ymd(b);
  const words = fold(state.q).split(/\s+/).filter(Boolean);
  // une séance d'aujourd'hui déjà terminée (ou commencée depuis plus d'1 h sans heure de fin) ne s'affiche plus
  const now = new Date(), today = ymd(now), nowHM = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const lateHM = `${pad(Math.max(0, now.getHours() - 1))}:${pad(now.getMinutes())}`;
  const notOver = (s) => {
    if (sday(s[1]) > today || !time(s[0]) || time(s[0]) === '00:00') return true;
    return s[1] > s[0] ? time(s[1]) > nowHM : time(s[0]) > lateHM;
  };
  const base = [];
  for (const e of EVENTS) {
    if (hidden.has(e.id)) continue;
    if (state.favs && !favs.has(e.id)) continue;
    if (state.free && !e.free) continue;
    if (state.kids && !e.kids) continue;
    if (state.hideFull && e.full) continue;
    if (state.try && !(e._discT || e._discD || e.category === 'Atelier')) continue;
    if (state.city === '__toulouse' ? e.city !== 'Toulouse' : state.city && e.city !== state.city) continue;
    if (state.sources.size && !e.sources.some((s) => state.sources.has(s))) continue;
    if (words.length && !words.every((w) => e._text.includes(w))) continue;
    const sess = e.sessions.filter((s) => sday(s[0]) <= to && sday(s[1]) >= from && momentOk(s) && notOver(s));
    if (!sess.length) continue;
    const sc = score(e);
    base.push({ e, sess, score: sc.s, why: sc.why });
  }
  // Sélection : on enlève ce qui est sous le seuil. Une recherche, une catégorie cochée exprès
  // ou "Mes favoris" passent outre (c'est une demande explicite).
  const picking = state.pick === 'best' && !words.length && !state.favs;
  const kept = picking
    ? base.filter((r) => r.score >= THRESHOLD || (state.cats.has(r.e.category) && r.score - TASTE_VAL[tastes[r.e.category] || 'ok'] >= THRESHOLD))
    : base;
  const catCounts = {};
  for (const r of kept) catCounts[r.e.category] = (catCounts[r.e.category] || 0) + 1;
  const rows = state.cats.size ? kept.filter((r) => state.cats.has(r.e.category)) : kept;
  return { from, to, a, b, rows, catCounts, picking, totalAll: base.length };
}

// ---------- rendu ----------

const fmtH = (h) => h.replace(':', 'h').replace(/h00$/, 'h');
function sessionTime(ss) {
  const times = [...new Set(ss.map((s) => time(s[0])).filter((h) => h && h !== '00:00'))].sort();
  if (!times.length) return ss.some((s) => time(s[0]) === '00:00') ? 'Journée' : '<small>horaire</small>?';
  if (times.length === 1) return fmtH(times[0]);
  return fmtH(times[0]) + `<small>${times.length === 2 ? 'et ' + fmtH(times[1]) : `+ ${times.length - 1} séances`}</small>`;
}

// ---------- météo (Open-Meteo : gratuit, sans clé, prévisions à 16 jours) ----------
// Toulouse pour les jours de l'agenda ; le lieu même de la rando (et son altitude) pour les randos.

const WX = new Map();
let TLS_WX = {};
function forecast(lat, lon, alt) {
  const key = `${(+lat).toFixed(2)},${(+lon).toFixed(2)},${alt || ''}`;
  if (!WX.has(key)) {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}${alt ? `&elevation=${alt}` : ''}` +
      '&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max&timezone=Europe%2FParis&forecast_days=16';
    WX.set(key, fetch(u).then((r) => (r.ok ? r.json() : null)).then((j) => {
      const out = {};
      const d = j?.daily;
      if (d) d.time.forEach((t, i) => { out[t] = { code: d.weathercode[i], max: d.temperature_2m_max[i], min: d.temperature_2m_min[i], rain: d.precipitation_probability_max[i] ?? 0, wind: d.wind_speed_10m_max[i] ?? 0 }; });
      return out;
    }).catch(() => ({})));
  }
  return WX.get(key);
}
function wmo(c) {
  if (c === 0) return ['☀️', 'ensoleillé'];
  if (c <= 2) return ['🌤️', 'éclaircies'];
  if (c === 3) return ['☁️', 'couvert'];
  if (c <= 48) return ['🌫️', 'brouillard'];
  if (c <= 57) return ['🌦️', 'bruine'];
  if (c <= 67) return ['🌧️', 'pluie'];
  if (c <= 77) return ['🌨️', 'neige'];
  if (c <= 82) return ['🌧️', 'averses'];
  if (c <= 86) return ['🌨️', 'averses de neige'];
  return ['⛈️', 'orage'];
}
const deg = (v) => `${Math.round(v)}°`;
// petit badge météo de Toulouse pour un jour (titres des jours)
function wxBadge(d) {
  const f = TLS_WX[d];
  if (!f) return '';
  const [ico, lbl] = wmo(f.code);
  return ` <span class="wxb" title="Météo à Toulouse : ${lbl}">${ico} ${deg(f.max)}<small>/${deg(f.min)}</small>${f.rain >= 40 ? ` · 💧${f.rain} %` : ''}</span>`;
}
// sorties en plein air : moins conseillées un jour de pluie (programme, idées date)
const OUTDOOR = new Set(['Rando', 'Visite', 'Sport', 'Marché', 'Festival']);
function rainAdj(e, d) {
  const f = TLS_WX[d];
  if (!f || f.rain < 60 || !OUTDOOR.has(e.category)) return null;
  return [-2, `Pluie annoncée ce jour-là (${f.rain} %) : plutôt en plein air`];
}

// ---------- randos : infos pratiques, météo sur place, équipement ----------

function gearFor(r, f, date) {
  const m = +date.slice(5, 7);
  const hm = r.type === 'hm' || (r.dplus || 0) >= 1000 || /T[4-6]/.test(r.level || '');
  const long = (r.levels || []).some((l) => l.km >= 18) || (r.dplus || 0) >= 500;
  const g = [
    ['👟', hm ? 'Chaussures montantes à semelle rigide et crantée' : 'Chaussures de randonnée (déjà portées, pas neuves)'],
    ['🎒', `Sac à dos ${hm ? '25-35' : '20-30'} L`],
    ['💧', `Eau : ${hm || (f && f.max >= 25) ? '2 L' : '1,5 L'} minimum`],
    ['🥪', 'Pique-nique + en-cas (fruits secs, barres)'],
    ['🧥', 'Coupe-vent'],
    ['🩹', 'Petite trousse de secours (pansements, ampoules)'],
    ['📱', 'Téléphone chargé, papiers, un peu d\'argent'],
  ];
  if (long || hm) g.push(['🥢', 'Bâtons de marche (conseillés)']);
  if (hm) {
    g.push(['🕶️', 'Lunettes de soleil catégorie 3-4 + crème solaire (même en hiver)']);
    g.push(['🧣', 'Couche chaude (polaire / doudoune) : il fait bien plus froid en haut']);
    g.push(['🔦', 'Frontale']);
    if (m >= 11 || m <= 5) g.push(['❄️', 'Neige possible en altitude : demande au club si crampons ou raquettes sont nécessaires']);
  }
  if (f) {
    if (f.min <= 5) g.push(['🧤', `Bonnet, gants, sous-couche chaude (${deg(f.min)} au plus froid)`]);
    if (f.rain >= 40) g.push(['☔', `Veste imperméable + protège-sac (${f.rain} % de risque de pluie)`]);
    if (f.max >= 25) g.push(['🧢', `Casquette + crème solaire (${deg(f.max)} au plus chaud)`]);
    if (f.wind >= 40) g.push(['💨', `Vent fort (${Math.round(f.wind)} km/h) : coupe-vent indispensable, prudence sur les crêtes`]);
  } else {
    g.push(['🌦️', 'Regarde la météo la veille (elle s\'affiche ici environ 2 semaines avant)']);
  }
  g.push(['🗑️', 'Un sac pour remporter ses déchets']);
  return g;
}
const gearHtml = (g) => g.map(([i, t]) => `<li><span aria-hidden="true">${i}</span> ${esc(t)}</li>`).join('');
const fmtDrive = (d) => `${Math.floor(d.min / 60) ? `${Math.floor(d.min / 60)}h${pad(d.min % 60)}` : `${d.min} min`}`;

function randoHtml(e, ss) {
  const r = e.rando;
  if (!r) return '';
  const date = sday((ss[0] || e.sessions[0])[0]);
  const facts = [];
  if (r.level) facts.push(`⛰️ Niveau ${esc(r.level)}`);
  if (r.dplus && !(r.levels || []).length) facts.push(`D+ ${r.dplus.toLocaleString('fr-FR')} m`);
  if (r.alt) facts.push(`sommet ${r.alt.toLocaleString('fr-FR')} m`);
  const lv = (r.levels || []).map((l) => `niv. ${l.n} : ${String(l.km).replace('.', ',')} km / ${l.dplus} m`).join(' · ');
  const go = [];
  if (r.meet) go.push(`🚌 Départ ${esc(r.meet)}`);
  if (r.drive) go.push(`🚗 ≈ ${fmtDrive(r.drive)} de route depuis Toulouse (${r.drive.km} km)`);
  const geo = e.lat != null ? ` data-lat="${e.lat}" data-lon="${e.lon}" data-date="${date}"${r.alt ? ` data-alt="${r.alt}"` : ''}` : '';
  return `<div class="rando"${geo}>
    ${facts.length ? `<p>${facts.join(' · ')}</p>` : ''}
    ${lv ? `<p>🥾 ${esc(lv)}</p>` : ''}
    ${go.map((x) => `<p>${x}</p>`).join('')}
    <p class="wx">${e.lat != null ? '🌡️ Météo sur place : chargement…' : '🌡️ Météo : lieu non localisé'}</p>
    <details class="gear"><summary>🎒 Équipement conseillé</summary><ul>${gearHtml(gearFor(r, null, date))}</ul></details>
    ${r.phone ? `<p>☎️ Inscription : <a href="tel:${esc(r.phone.replace(/\s/g, ''))}">${esc(r.phone)}</a>${r.places ? ` · ${esc(r.places)} places` : ''}</p>` : ''}
  </div>`;
}

// météo sur le lieu même de chaque rando affichée, puis équipement ajusté à cette météo
function hydrateRando(root) {
  for (const el of root.querySelectorAll('.rando[data-lat]')) {
    const { lat, lon, date, alt } = el.dataset;
    const card = el.closest('.card');
    const e = EVENTS.find((x) => x.id === card?.dataset.id);
    if (!e) continue;
    forecast(lat, lon, alt).then((w) => {
      const f = w[date];
      const wxEl = el.querySelector('.wx');
      if (f) {
        const [ico, lbl] = wmo(f.code);
        wxEl.innerHTML = `${ico} <strong>Météo sur place${alt ? ` (à ${(+alt).toLocaleString('fr-FR')} m)` : ''}</strong> : ${esc(lbl)}, ${deg(f.min)} → ${deg(f.max)} · 💧 ${f.rain} % · 💨 ${Math.round(f.wind)} km/h`;
      } else {
        wxEl.textContent = '🌡️ Météo sur place : affichée environ 2 semaines avant la sortie';
      }
      el.querySelector('.gear ul').innerHTML = gearHtml(gearFor(e.rando, f, date));
    });
  }
}

function noteHtml(sc, why) {
  const n = note10(sc);
  const lvl = sc >= TOP ? 'top' : sc >= THRESHOLD ? 'ok' : 'low';
  const rows = why.map(([v, label]) => `<li><span>${esc(label)}</span><b class="${v > 0 ? 'up' : 'down'}">${fmtPts(v)}</b></li>`).join('');
  const raw = BASE + sc;
  return {
    pill: `<button class="note note--${lvl}" type="button" data-act="why" aria-expanded="false" title="Pourquoi cette note ?">${fmtNote(n)}<small>/10</small></button>`,
    panel: `<div class="card__why" hidden><p>Pourquoi <strong>${fmtNote(n)}/10</strong> ?</p><ul><li><span>Point de départ</span><b>${BASE}</b></li>${rows}</ul>` +
      `<p class="card__why-total">${raw > 10 ? `Total ${fmtNote(raw)}, plafonné à 10.` : raw < 0 ? `Total ${fmtNote(raw)}, ramené à 0.` : ''} La Sélection garde les sorties à 6/10 et plus ; « Top » à partir de 9/10.</p></div>`,
  };
}

function card(e, ss, ongoing = false, sc = 0, why = []) {
  const url = safeUrl(e.url);
  const img = safeUrl(e.image);
  const place = [e.venue, e.city && e.city !== e.venue ? e.city : ''].filter(Boolean).join(' · ');
  // Google Maps sur le lieu (nom + adresse + ville ; sinon les coordonnées). Sur téléphone, ouvre l'appli Maps.
  const cityPart = e.city && !fold(`${e.venue} ${e.address}`).includes(fold(e.city)) ? e.city : '';
  const mapText = [e.venue, e.address, cityPart].filter(Boolean).join(', ');
  // rando : la position exacte (un sommet n'a pas d'adresse) ; sinon nom + adresse du lieu
  const useCoords = e.category === 'Rando' && e.lat != null;
  const mapUrl = 'https://www.google.com/maps/search/?api=1&query=' +
    encodeURIComponent(useCoords ? `${e.lat},${e.lon}` : mapText || (e.lat != null && e.lon != null ? `${e.lat},${e.lon}` : 'Toulouse'));
  const last = e.sessions[e.sessions.length - 1][1];
  let when;
  if (ongoing) when = `<span class="card__time"><small>jusqu'au</small>${esc(fmtDM.format(toDate(last)))}</span>`;
  else when = `<span class="card__time">${sessionTime(ss)}</span>`;
  const tags = [
    sc >= TOP ? '<span class="tag tag--top">Top</span>' : '',
    `<span class="tag tag--cat">${esc(e.category)}</span>`,
    e.free ? '<span class="tag tag--free">Gratuit</span>' : '',
    e.price && !e.free && /\d/.test(e.price) ? `<span class="tag">${esc(e.price.length > 34 ? e.price.slice(0, 33) + '…' : e.price)}</span>` : '',
    e.kids ? '<span class="tag">Enfants</span>' : '',
    e.full ? '<span class="tag tag--full">Complet</span>' : '',
    e.moved ? '<span class="tag tag--moved">Date modifiée</span>' : '',
    !ongoing && e.sessions.length > 1 ? `<span class="tag">${e.sessions.length} dates</span>` : '',
    `<span class="tag tag--src">${esc(e.sources.join(' + '))}</span>`,
  ].join('');
  const fav = favs.has(e.id);
  const note = noteHtml(sc, why);
  return `<article class="card" data-cat="${esc(e.category)}" data-id="${esc(e.id)}">
    <div class="card__when">${when}${note.pill}</div>
    <div class="card__body">
      <h3>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(e.title)}</a>` : esc(e.title)}</h3>
      ${place ? `<p class="card__meta"><a class="maplink" href="${esc(mapUrl)}" target="_blank" rel="noopener" title="Ouvrir dans Google Maps">${ICON.pin}<span>${esc(place)}</span></a></p>` : ''}
      ${e.desc ? `<p class="card__desc">${esc(e.desc)}</p>` : ''}
      ${randoHtml(e, ss)}
    </div>
    ${img ? `<img class="card__thumb" src="${esc(img)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
    <div class="card__foot">
      <div class="tags">${tags}</div>
      <div class="actions">
        <button class="icon-btn" data-act="nope" title="Pas pour moi : masquer et voir moins de ce genre" aria-label="Pas pour moi">${ICON.nope}</button>
        <button class="icon-btn${fav ? ' on' : ''}" data-act="fav" title="${fav ? 'Retirer des favoris' : 'Ajouter aux favoris'}" aria-pressed="${fav}" aria-label="Favori">${ICON.star}</button>
        <button class="icon-btn" data-act="ics" title="Ajouter à mon agenda" aria-label="Ajouter à mon agenda">${ICON.cal}</button>
        <a class="icon-btn" href="${esc(mapUrl)}" target="_blank" rel="noopener" title="Ouvrir dans Google Maps" aria-label="Ouvrir dans Google Maps">${ICON.pin}</a>
      </div>
    </div>
    ${note.panel}
  </article>`;
}

function render() {
  if (!DATA) return;
  writeHash();
  syncControls();
  const { from, a, b, rows, catCounts, picking, totalAll } = compute();
  renderCats(catCounts);

  const punctual = rows.filter((r) => !r.e.continuous);
  const ongoing = rows.filter((r) => r.e.continuous);
  const list = $('#list');
  const label = `${periodName()} · ${rangeLabel([a, b])}`;
  let html = '';
  let shown = 0, total = 0;

  const pickNote = picking ? ` · <button class="link" type="button" data-pickall>voir les ${totalAll} sans pré-filtre</button>` : '';
  if (state.tab === 'events') {
    const days = new Map();
    for (const { e, sess, score: sc, why } of punctual) {
      const per = new Map();
      for (const s of sess) { const d = sday(s[0]) < from ? from : sday(s[0]); (per.get(d) || per.set(d, []).get(d)).push(s); }
      for (const [d, ss] of per) (days.get(d) || days.set(d, []).get(d)).push({ e, ss, sc, why });
    }
    // Sélection : seulement les PER_DAY mieux notées de chaque jour (le reste derrière "+ N autres")
    const plan = [...days.keys()].sort().map((d) => {
      let items = days.get(d);
      let rest = 0;
      if (picking && !expandedDays.has(d) && items.length > PER_DAY) {
        items = [...items].sort((x, y) => y.sc - x.sc);
        rest = items.length - PER_DAY;
        items = items.slice(0, PER_DAY);
      }
      items.sort((x, y) => key(x.ss).localeCompare(key(y.ss)) || x.e.title.localeCompare(y.e.title, 'fr'));
      return { d, items, rest };
    });
    total = plan.reduce((n, p) => n + p.items.length, 0);
    $('#summary').innerHTML = `<strong>${picking ? 'Sélection : ' : ''}${total} sortie${total > 1 ? 's' : ''}</strong> — ${esc(label)}${pickNote}`;
    for (const { d, items, rest } of plan) {
      if (shown >= limit) break;
      const rel = relDay(d);
      const dayName = fmtDay.format(toDate(d));
      html += `<section class="day"><h2 class="day__head">${esc(dayName[0].toUpperCase() + dayName.slice(1))}${rel ? ` <span class="rel">${rel}</span>` : ''} <small>${items.length + rest} sortie${items.length + rest > 1 ? 's' : ''}</small>${wxBadge(d)}</h2><div class="cards">`;
      for (const it of items) { if (shown >= limit) break; html += card(it.e, it.ss, false, it.sc, it.why); shown++; }
      html += '</div>';
      if (rest) html += `<button class="day__more" type="button" data-expand="${d}">+ ${rest} autre${rest > 1 ? 's' : ''} ce jour-là, moins bien notée${rest > 1 ? 's' : ''}</button>`;
      html += '</section>';
    }
    if (ongoing.length && total) {
      html = `<div class="hint"><span>+ ${ongoing.length} expo${ongoing.length > 1 ? 's' : ''} et activités en continu sur cette période</span><button type="button" data-goto="ongoing">Voir</button></div>` + html;
    }
  } else if (state.tab === 'places') {
    const r = renderPlaces(state.pick === 'best');
    shown = r.shown;
    const strict = state.pick === 'best' && !state.q && !state.favs;
    $('#summary').innerHTML = `<strong>${strict ? 'À tester : ' : ''}${r.total} lieu${r.total > 1 ? 'x' : ''}</strong> — restos, bars, cafés, activités et lieux à voir, toujours dispo · le mieux noté en premier${strict ? ` · <button class="link" type="button" data-pickall>voir les ${r.all}</button>` : ''}`;
    // les boutons de type (Restos, Bars…) restent affichés même si la liste est vide
    html = r.total ? r.html : r.html + '<div class="empty"><strong>Aucun lieu ne correspond.</strong>Essaie « Tout » ou une autre recherche.</div>';
    total = r.total || -1;
  } else if (state.tab === 'plan') {
    const plan = buildPlan(rows, a, b);
    html = plan.html;
    total = shown = plan.count;
    $('#summary').innerHTML = `<strong>Mon programme</strong> — ${esc(label)}${plan.cut ? ' (4 premiers jours)' : ''} · la mieux notée par créneau, sans doublon${pickNote}`;
  } else if (state.tab === 'deals') {
    // bons plans voyage : départs de Toulouse d'abord, puis les plus récents
    const words = fold(state.q).split(/\s+/).filter(Boolean);
    const deals = (DATA.deals || [])
      .filter((x) => !words.length || words.every((w) => fold(`${x.title} ${x.desc}`).includes(w)))
      .sort((x, y) => (y.toulouse - x.toulouse) || y.date.localeCompare(x.date));
    const nTls = deals.filter((x) => x.toulouse).length;
    $('#summary').innerHTML = `<strong>✈️ ${deals.length} bons plans voyage</strong> — des 3 dernières semaines, via Voyages Pirates · ${nTls ? `${nTls} au départ de Toulouse, en premier` : 'aucun ne précise un départ de Toulouse en ce moment'} · vérifie le prix sur le site, ils partent vite`;
    html = `<div class="cards">${deals.map((x) => {
      const u = safeUrl(x.url);
      const ago = Math.round((Date.now() - toDate(x.date)) / 864e5);
      return `<article class="card deal">
        <div class="card__when"><span class="card__time card__kind" aria-hidden="true">✈️</span></div>
        <div class="card__body">
          <h3>${u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(x.title)}</a>` : esc(x.title)}</h3>
          <p class="card__meta">${ago <= 0 ? "Publié aujourd'hui" : ago === 1 ? 'Publié hier' : `Publié il y a ${ago} jours`}</p>
          ${x.desc ? `<p class="card__desc">${esc(x.desc)}</p>` : ''}
        </div>
        ${safeUrl(x.image) ? `<img class="card__thumb" src="${esc(x.image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
        <div class="card__foot"><div class="tags">${x.toulouse ? '<span class="tag tag--top">🛫 Départ Toulouse</span>' : ''}<span class="tag tag--src">${esc(x.source)}</span></div></div>
      </article>`;
    }).join('')}</div>`;
    total = shown = deals.length || -1;
    if (!deals.length) html = '<div class="empty"><strong>Pas de bon plan pour le moment.</strong>Le flux est relu chaque matin.</div>';
  } else if (state.tab === 'dates') {
    const ideas = buildDates(punctual, a, b);
    html = ideas.html;
    total = shown = ideas.count || -1;
    $('#summary').innerHTML = `<strong>💕 Idées date</strong> — ${esc(label)} · une sortie à deux, un resto à côté, puis un verre`;
  } else {
    total = ongoing.length;
    $('#summary').innerHTML = `<button class="link" type="button" data-goto="events">← Agenda</button> · <strong>${total} expo${total > 1 ? 's' : ''} &amp; activités en continu</strong> — ${esc(label)} · ${picking ? 'les mieux notées en premier' : 'les plus proches de la fin en premier'}${pickNote}`;
    const end = (r) => r.e.sessions[r.e.sessions.length - 1][1];
    const items = ongoing.sort((x, y) => (picking ? y.score - x.score : 0) || end(x).localeCompare(end(y)));
    html += '<div class="cards">';
    for (const it of items) { if (shown >= limit) break; html += card(it.e, it.sess, true, it.score, it.why); shown++; }
    html += '</div>';
  }

  if (!total) {
    html = `<div class="empty"><strong>Rien ne correspond.</strong>Essaie une autre période, ou retire un filtre.${ongoing.length && state.tab === 'events' ? `<br><br><button class="more" type="button" data-goto="ongoing">Voir les ${ongoing.length} activités en continu</button>` : ''}</div>`;
  }
  list.innerHTML = html;
  hydrateRando(list);
  $('#more').hidden = shown >= total;
  $('#more').textContent = `Voir plus (${total - shown} restantes)`;
}
// ---------- Lieux & restos (OpenStreetMap + Guide Michelin) : pas datés, toujours dispo ----------

const KINDS = [
  { k: 'Resto', label: 'Restos', icon: '🍽️' }, { k: 'Bar', label: 'Bars', icon: '🍸' }, { k: 'Café', label: 'Cafés', icon: '☕' },
  { k: 'Activité', label: 'Activités', icon: '🧗' }, { k: 'Lieu', label: 'Lieux à voir', icon: '🏛️' },
  { k: 'Baignade', label: 'Baignade', icon: '🏊' },
];
const KIND = Object.fromEntries(KINDS.map((x) => [x.k, x]));
// cuisines "de tous les jours" : pas de bonus "à découvrir"
const COMMON_CUISINE = /^(french|pizza|burger|kebab|sandwich|italian|regional|asian|chinese|japanese|sushi|crepe|salad|chicken|pasta|steak_house|coffee_shop|local|traditional|international|fine_dining|gastronomic|gourmet|modern|creative|bistro|brasserie|grill|meat|wine_bar|ice_cream|cake|tea|brunch|tapas|seafood|fish|bagel|breakfast|friture|fries|pancake|donut|dessert|coffee|cafe|bar)$/;
const MICHELIN_PTS = { '3 étoiles': 4.5, '2 étoiles': 4, '1 étoile': 3.5, 'Bib Gourmand': 3, 'Sélection': 2.5 };

function placeScore(p) {
  const why = [];
  let s = 0;
  const add = (v, label) => { if (v) { why.push([v, label]); s += v; } };
  if (p.michelin) add(MICHELIN_PTS[p.michelin] || 2.5, `Guide Michelin : ${p.michelin}${p.michelin === 'Bib Gourmand' ? ' (très bon rapport qualité-prix)' : ''}`);
  const rare = (p.cuisineRaw || '').split(';').map((x) => x.trim()).find((c) => c && !COMMON_CUISINE.test(c));
  if (p.kind === 'Resto' && rare) add(2, `Cuisine à découvrir : ${p.detail}`);
  if (p.kind === 'Activité') {
    if (/détente|billet/.test(p.detail || '')) add(-1.5, p.detail === 'détente' ? 'Plutôt détente que découverte' : "Billet d'entrée, pas une activité à apprendre");
    else add(2.5, `Activité à tester : ${p.detail}`);
    if (/atelier|cours|stage/.test(p.detail || '') || DISCOVERY.test(fold(p.name))) add(1.5, "Pour apprendre / s'initier");
  }
  if (p.fbRating) {
    const v = p.fbRating, n = p.fbReviews || 0;
    const lbl = `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}/5 sur ${n} avis Funbooker`;
    if (v >= 4.7 && n >= 20) add(1.5, `Très bien noté : ${lbl}`);
    else if (v >= 4.5 && n >= 5) add(1, `Bien noté : ${lbl}`);
    else if (v < 4) add(-1.5, `Moyennement noté : ${lbl}`);
  }
  if (p.kind === 'Lieu' && p.notable) add(1, 'Lieu connu (fiche Wikipédia)');
  if (p.kind === 'Bar' && /cocktails|brasserie artisanale/.test(p.detail || '')) add(1, `Bar : ${p.detail}`);
  if (p.kind === 'Baignade') {
    const summer = [6, 7, 8, 9].includes(new Date().getMonth() + 1);
    if (p.outdoor) add(summer ? 2.5 : -2, summer ? 'Baignade en plein air : c\'est la saison' : 'Baignade en plein air : seulement l\'été');
    else add(summer ? 1.5 : 1, p.detail?.startsWith('piscine') ? 'Piscine municipale (horaires sur la fiche de la piscine)' : 'Parc aquatique');
  } else add(p.url ? 0.5 : -0.5, p.url ? 'A un site web' : 'Pas de site web');
  if (p.thin) add(-2, 'Peu d\'infos : ni prix, ni avis, ni adresse (tout est sur la page de l\'atelier)');
  if (/team building|equipe|seminaire/.test(p._fname)) add(-2, 'Pensé pour les équipes (team building)');
  if (/\benfants?\b|\bkids\b/.test(p._fname) && !state.kids) add(-1.5, 'Pensé pour les enfants');
  if (p.hours) add(0.3, 'Horaires renseignés');
  if (p.terrace) add(0.3, 'Terrasse');
  if (p.veg) add(0.3, 'Options végé');
  if (p.chain) add(-3, 'Chaîne');
  if (p.kind === 'Resto' && !p.detail) add(-0.5, 'Type de cuisine inconnu');
  add(Math.round(6 * (learned.cat['lieu:' + p.kind] || 0)) / 10, `Tes ⭐ / 👎 sur les ${KIND[p.kind].label.toLowerCase()}`);
  add(learned.venue[p._fname] || 0, 'Tes ⭐ / 👎 sur ce lieu');
  return { s, why };
}
function learnPlace(p, delta) {
  const clamp = (v) => Math.max(-4, Math.min(4, v));
  learned.cat['lieu:' + p.kind] = clamp((learned.cat['lieu:' + p.kind] || 0) + delta);
  learned.venue[p._fname] = clamp((learned.venue[p._fname] || 0) + delta);
  store.set('sorties-appris', learned);
}
const distM = (a, b) => {
  const R = 6371000, rad = Math.PI / 180;
  const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lon - a.lon) * rad / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const fmtDist = (m) => (m < 950 ? `${Math.max(50, Math.round(m / 50) * 50)} m` : `${(m / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km`);

function placeCard(p, sc, why, near = '') {
  const url = safeUrl(p.url) || safeUrl(p.michelinUrl);
  const mapUrl = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([p.name, p.address, p.city || 'Toulouse'].filter(Boolean).join(', '));
  const note = noteHtml(sc, why);
  const kind = KIND[p.kind];
  const info = [p.detail, p.price].filter(Boolean).join(' · ');
  const isTested = tested.has(p.id), fav = favs.has(p.id);
  const noLoc = p.lat == null && !p.address; // ex. Wecandoo : l'adresse n'est que sur leur page
  const tags = [
    sc >= TOP ? '<span class="tag tag--top">Top</span>' : '',
    `<span class="tag tag--cat">${esc(kind.label.replace(/s$/, '').replace('Lieux à voi', 'Lieu à voir'))}</span>`,
    p.michelin ? `<span class="tag tag--michelin">Michelin · ${esc(p.michelin)}</span>` : '',
    p.terrace ? '<span class="tag">Terrasse</span>' : '',
    p.veg ? '<span class="tag">Végé</span>' : '',
    p.fbRating ? `<span class="tag tag--rating">★ ${esc(p.fbRating.toLocaleString('fr-FR', { maximumFractionDigits: 1 }))} · ${esc(p.fbReviews)} avis</span>` : '',
    ['Funbooker', 'Wecandoo'].includes(p.sources[0]) ? `<a class="tag tag--src" href="${esc(safeUrl(p.url) || '#')}" target="_blank" rel="noopener">Réserver sur ${esc(p.sources[0])}</a>` : '',
    isTested ? '<span class="tag tag--free">Testé ✓</span>' : '',
    p.michelinUrl && p.url ? `<a class="tag tag--src" href="${esc(p.michelinUrl)}" target="_blank" rel="noopener">fiche Michelin</a>` : '',
  ].join('');
  return `<article class="card place" data-kind="${esc(p.kind)}" data-id="${esc(p.id)}">
    <div class="card__when"><span class="card__time card__kind" aria-hidden="true">${kind.icon}</span>${note.pill}</div>
    <div class="card__body">
      <h3>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(p.name)}</a>` : esc(p.name)}</h3>
      ${info ? `<p class="card__meta">${esc(info[0].toUpperCase() + info.slice(1))}</p>` : ''}
      ${noLoc
        ? `<p class="card__meta"><a class="maplink" href="${esc(url || '#')}" target="_blank" rel="noopener">${ICON.pin}<span>Adresse et dates sur ${esc(p.sources[0] || 'le site')}</span></a></p>`
        : `<p class="card__meta"><a class="maplink" href="${esc(mapUrl)}" target="_blank" rel="noopener" title="Ouvrir dans Google Maps">${ICON.pin}<span>${esc(p.address || 'Voir sur la carte')}${near ? ` · ${esc(near)}` : ''}</span></a></p>`}
      ${p.desc ? `<p class="card__desc">${esc(p.desc)}</p>` : ''}
    </div>
    ${safeUrl(p.image) ? `<img class="card__thumb" src="${esc(p.image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
    <div class="card__foot">
      <div class="tags">${tags}</div>
      <div class="actions">
        <button class="icon-btn" data-act="nope" title="Pas pour moi : masquer et voir moins de ce genre" aria-label="Pas pour moi">${ICON.nope}</button>
        <button class="icon-btn${fav ? ' on' : ''}" data-act="fav" title="${fav ? 'Retirer des favoris' : 'Ajouter aux favoris'}" aria-pressed="${fav}" aria-label="Favori">${ICON.star}</button>
        <button class="icon-btn${isTested ? ' on' : ''}" data-act="tested" title="${isTested ? 'Pas encore testé finalement' : "J'ai testé"}" aria-pressed="${isTested}" aria-label="Testé">${ICON.check}</button>
        ${noLoc ? '' : `<a class="icon-btn" href="${esc(mapUrl)}" target="_blank" rel="noopener" title="Ouvrir dans Google Maps" aria-label="Ouvrir dans Google Maps">${ICON.pin}</a>`}
      </div>
    </div>
    ${note.panel}
  </article>`;
}

function placeRows() {
  const words = fold(state.q).split(/\s+/).filter(Boolean);
  const rows = [];
  for (const p of PLACES) {
    if (hidden.has(p.id)) continue;
    if (state.favs && !favs.has(p.id)) continue;
    if (!state.showTested && tested.has(p.id)) continue;
    if (words.length && !words.every((w) => p._text.includes(w))) continue;
    const sc = placeScore(p);
    rows.push({ p, s: sc.s, why: sc.why });
  }
  return { rows, words };
}

function renderPlaces(picking) {
  const { rows: all, words } = placeRows();
  const strict = picking && !words.length && !state.favs;
  const kept = strict ? all.filter((r) => r.s >= THRESHOLD) : all;
  const counts = {};
  for (const r of kept) counts[r.p.kind] = (counts[r.p.kind] || 0) + 1;
  const rows = (state.pkind ? kept.filter((r) => r.p.kind === state.pkind) : kept)
    .sort((x, y) => y.s - x.s || x.p.name.localeCompare(y.p.name, 'fr'));
  const nTested = PLACES.filter((p) => tested.has(p.id)).length;
  let html = `<div class="kinds">${[{ k: '', label: 'Tout', icon: '' }, ...KINDS].map((x) =>
    `<button class="chip" type="button" data-pkind="${esc(x.k)}" aria-pressed="${state.pkind === x.k}">${x.icon} ${esc(x.label)} <span class="n">${x.k ? counts[x.k] || 0 : kept.length}</span></button>`).join('')}</div>`;
  if (nTested) html += `<p class="tested-toggle"><button class="link" type="button" data-showtested>${state.showTested ? 'Masquer' : 'Afficher'} ${nTested > 1 ? `les ${nTested} lieux déjà testés` : 'le lieu déjà testé'}</button></p>`;
  html += '<div class="cards">';
  let shown = 0;
  for (const r of rows) { if (shown >= limit) break; html += placeCard(r.p, r.s, r.why); shown++; }
  html += '</div>';
  return { html, total: rows.length, shown, all: all.length };
}

// le meilleur lieu d'un type autour d'un point (pour "Mon programme") : la note, moins 1 point par km
function bestNear(anchor, kind, maxM, exclude) {
  const out = [];
  for (const p of PLACES) {
    if (p.kind !== kind || !p.name || p.lat == null || hidden.has(p.id) || tested.has(p.id) || exclude.has(p.id)) continue;
    const d = distM(anchor, p);
    if (d > maxM) continue;
    const sc = placeScore(p);
    if (sc.s < 0.5) continue; // pas de suggestion sous 5,5/10
    out.push({ p, s: sc.s, why: sc.why, d, rank: sc.s - d / 1000 });
  }
  out.sort((a, b) => b.rank - a.rank);
  const top = out.slice(0, 3);
  return top.length ? top[planSeed % top.length] : null;
}

// ---------- Idées date (un rendez-vous à deux) : une sortie + un resto à côté + un verre ----------

const DATE_CATS = new Set(['Concert', 'Spectacle', 'Humour', 'Expo', 'Cinéma', 'Festival', 'Soirée']);
// ce qui rend une sortie sympa à deux… et ce qui ne l'est pas du tout
const DATE_GOOD = /\b(duo|a deux|en couple|amoureux|saint[- ]valentin|degustation|cocktails?|mixologie|vins?|oenolog\w*|croisiere|bateau|peniche|guinguette|jazz|piano|acoustique|candlelight|bougies|rooftop|coucher de soleil|chocolat|parfum|poterie|ceramique|cours de cuisine|patisserie|escape game|salsa|tango|bachata|swing|planetarium|etoiles|cabaret|theatre|stand ?up|comedy|impro|opera|ballet|concert|spectacle)\b/;
const DATE_BAD = /\b(enfants?|jeune public|en famille|bebes?|tout[- ]petits|seniors?|conference|reunion|team building|equipe|formation|loto|vide[- ]grenier)\b/;

function dateBonus(text, kids) {
  const why = [];
  let s = 0;
  const g = text.match(DATE_GOOD);
  if (g) { s += 2; why.push([2, `Sympa à deux : « ${g[0]} »`]); }
  const bad = text.match(DATE_BAD);
  if (bad || kids) { s -= 5; why.push([-5, `Pas vraiment un date : « ${bad ? bad[0] : 'pour les enfants'} »`]); }
  return { s, why };
}

// une ligne compacte pour le resto / le bar d'une idée
function miniPlace(icon, label, x) {
  const p = x.p;
  const url = safeUrl(p.url) || safeUrl(p.michelinUrl);
  const mapUrl = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([p.name, p.address, p.city || 'Toulouse'].filter(Boolean).join(', '));
  const info = [p.detail, p.price, x.d != null ? fmtDist(x.d) : ''].filter(Boolean).join(' · ');
  return `<li class="mini" data-id="${esc(p.id)}"><span class="mini__icon" aria-hidden="true">${icon}</span>
    <span class="mini__body"><small>${esc(label)}</small>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(p.name)}</a>` : esc(p.name)}
    <span class="mini__info">${esc(info)} · ${fmtNote(note10(x.s))}/10</span></span>
    <a class="icon-btn" href="${esc(mapUrl)}" target="_blank" rel="noopener" title="Ouvrir dans Google Maps" aria-label="Ouvrir dans Google Maps">${ICON.pin}</a></li>`;
}

function foodAndDrink(anchor, usedPlaces) {
  const at = anchor || { lat: 43.6045, lon: 1.4440 };
  const out = [];
  const food = bestNear(at, 'Resto', 1200, usedPlaces);
  if (food) { usedPlaces.add(food.p.id); out.push(miniPlace('🍽️', anchor ? 'Pour manger à côté' : 'Pour manger (centre-ville)', food)); }
  const drink = bestNear(food ? food.p : at, 'Bar', 800, usedPlaces);
  if (drink) { usedPlaces.add(drink.p.id); out.push(miniPlace('🍸', 'Un verre après', drink)); }
  return out.length ? `<ul class="idea__more">${out.join('')}</ul>` : '';
}

function buildDates(punctual, a, b) {
  const usedPlaces = new Set();
  // 1. sorties datées de la période, l'après-midi ou le soir, notées "à deux"
  const cands = [];
  for (const r of punctual) {
    const txt = r.e._text;
    if (!DATE_CATS.has(r.e.category) && !DATE_GOOD.test(txt)) continue;
    const ss = r.sess.filter((s) => { const h = time(s[0]); return h && h !== '00:00' && h >= '14:00'; });
    if (!ss.length) continue;
    const bonus = dateBonus(txt, r.e.kids);
    const rain = rainAdj(r.e, sday(ss[0][0]));
    const s = r.score + bonus.s + (rain ? rain[0] : 0);
    if (s < THRESHOLD) continue;
    cands.push({ ...r, ss: [ss[0]], s, why: [...r.why, ...bonus.why, ...(rain ? [rain] : [])] });
  }
  cands.sort((x, y) => y.s - x.s);
  // jusqu'à 5 idées, 2 par jour max, en tournant avec 🎲 parmi les meilleures
  const perDay = {};
  const picked = [];
  const pool = cands.slice(planSeed % 3);
  for (const c of pool) {
    const d = sday(c.ss[0][0]);
    if ((perDay[d] || 0) >= 2) continue;
    perDay[d] = (perDay[d] || 0) + 1;
    picked.push(c);
    if (picked.length >= 5) break;
  }
  picked.sort((x, y) => x.ss[0][0].localeCompare(y.ss[0][0]));

  let html = `<div class="plan__bar"><button class="more" type="button" data-reroll>🎲 D'autres idées</button></div>`;
  html += '<section class="day"><h2 class="day__head">💕 Une sortie à deux, puis resto et verre</h2>';
  if (!picked.length) html += '<p class="slot__empty">Pas de sortie « à deux » bien notée sur cette période : essaie une autre période, ou les idées sans date plus bas.</p>';
  picked.forEach((c, i) => {
    const when = `${fmtShort.format(toDate(c.ss[0][0]))} · ${fmtH(time(c.ss[0][0]))}`;
    const anchor = c.e.lat != null && !/multi|plusieurs lieux|divers lieux/i.test(c.e.venue || '') ? { lat: c.e.lat, lon: c.e.lon } : null;
    html += `<article class="idea"><p class="idea__head"><span class="idea__n">Idée ${i + 1}</span> ${esc(when)}${wxBadge(sday(c.ss[0][0]))}</p>${card(c.e, c.ss, false, c.s, c.why)}${foodAndDrink(anchor, usedPlaces)}</article>`;
  });
  html += '</section>';

  // 2. sans date fixe : activités à réserver à deux (atelier cocktails, poterie, dégustation, escape game…)
  const acts = [];
  for (const p of PLACES) {
    if (p.kind !== 'Activité' || hidden.has(p.id) || tested.has(p.id)) continue;
    const txt = fold(`${p.name} ${p.detail || ''} ${p.desc || ''}`);
    if (!DATE_GOOD.test(txt)) continue;
    const sc = placeScore(p);
    const bonus = dateBonus(txt, false);
    acts.push({ p, s: sc.s + bonus.s, why: [...sc.why, ...bonus.why] });
  }
  acts.sort((x, y) => y.s - x.s);
  const top = acts.slice((planSeed * 3) % Math.max(1, Math.min(acts.length, 12))).slice(0, 3);
  if (top.length) {
    html += '<section class="day"><h2 class="day__head">💕 À réserver quand vous voulez</h2>';
    top.forEach((x) => {
      const anchor = x.p.lat != null ? { lat: x.p.lat, lon: x.p.lon } : null;
      html += `<article class="idea">${placeCard(x.p, x.s, x.why)}${anchor ? foodAndDrink(anchor, usedPlaces) : ''}</article>`;
    });
    html += '</section>';
  }
  return { html, count: picked.length + top.length };
}

// ---------- Mon programme : pour chaque jour, la mieux notée du matin, de l'après-midi et du soir ----------

const SLOTS = [
  { label: 'Matin', from: '00:01', to: '12:00', fill: true },
  { label: 'Après-midi', from: '12:00', to: '18:00', fill: true },
  { label: 'Soirée', from: '18:00', to: '24:00', fill: false },
];

function buildPlan(rows, a, b) {
  const days = [];
  for (let d = new Date(a); d <= b && days.length < 4; d = addDays(d, 1)) days.push(ymd(d));
  const cut = ymd(b) > days[days.length - 1];
  const used = new Set();
  const usedPlaces = new Set();
  const picks = [];
  let html = `<div class="plan__bar"><button class="more" type="button" data-reroll>🎲 Proposer autre chose</button><button class="more" type="button" data-plan-ics>📅 Tout ajouter à mon agenda</button></div>`;
  for (const d of days) {
    const dayName = fmtDay.format(toDate(d));
    const rel = relDay(d);
    html += `<section class="day plan"><h2 class="day__head">${esc(dayName[0].toUpperCase() + dayName.slice(1))}${rel ? ` <span class="rel">${rel}</span>` : ''}${wxBadge(d)}</h2>`;
    let anchor = null; // dernière sortie du jour avec une position : on cherche à manger / boire autour
    for (const slot of SLOTS) {
      let cands = [];
      for (const r of rows) {
        if (used.has(r.e.id) || r.e.continuous) continue;
        // à heure fixe dans le créneau, ou "toute la journée" (bon pour le matin / l'après-midi)
        const ss = r.sess.filter((s) => {
          const h = time(s[0]);
          return sday(s[0]) === d && ((h && h !== '00:00' && h >= slot.from && h < slot.to) || (slot.fill && (!h || h === '00:00')));
        });
        if (!ss.length) continue;
        const rain = rainAdj(r.e, d);
        cands.push(rain ? { ...r, ss, score: r.score + rain[0], why: [...r.why, rain] } : { ...r, ss });
      }
      // rien à heure fixe le matin / l'après-midi : une expo ou activité en continu ouverte ce jour-là
      if (!cands.length && slot.fill) {
        for (const r of rows) {
          if (used.has(r.e.id) || !r.e.continuous) continue;
          if (r.sess.some((s) => sday(s[0]) <= d && sday(s[1]) >= d)) cands.push({ ...r, ss: [[d, d]], ongoing: true });
        }
      }
      cands = cands.sort((x, y) => y.score - x.score).slice(0, 4);
      html += `<div class="slot"><h3 class="slot__label">${slot.label}</h3>`;
      if (!cands.length) { html += '<p class="slot__empty">Rien de bien noté sur ce créneau : temps libre.</p></div>'; continue; }
      const pick = cands[planSeed % cands.length];
      used.add(pick.e.id);
      picks.push({ e: pick.e, s: pick.ss[0] });
      if (pick.e.lat != null && pick.e.lon != null && !/multi|plusieurs lieux|divers lieux/i.test(pick.e.venue || '')) {
        anchor = { lat: pick.e.lat, lon: pick.e.lon, venue: pick.e.venue || pick.e.title };
      }
      html += card(pick.e, pick.ss, !!pick.ongoing, pick.score, pick.why);
      const others = cands.filter((c) => c !== pick).slice(0, 2);
      if (others.length) {
        html += `<p class="slot__alt">Autres idées : ${others.map((o) => {
          const u = safeUrl(o.e.url);
          const t0 = time(o.ss[0][0]);
          const h = o.ongoing ? 'en continu' : t0 && t0 !== '00:00' ? fmtH(t0) : 'toute la journée';
          return `${u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(o.e.title)}</a>` : esc(o.e.title)} <span>(${esc(h)} · ${fmtNote(note10(o.score))}/10)</span>`;
        }).join(' · ')}</p>`;
      }
      html += '</div>';
    }
    // idée resto + un verre, autour de la dernière sortie du jour (sinon en centre-ville, place du Capitole)
    if (PLACES.length) {
      const at = anchor || { lat: 43.6045, lon: 1.4440, venue: 'Capitole' };
      const where = anchor ? `près de ${anchor.venue}` : 'en centre-ville';
      const food = bestNear(at, 'Resto', 1500, usedPlaces);
      if (food) {
        usedPlaces.add(food.p.id);
        html += `<div class="slot slot--food"><h3 class="slot__label">🍽️ Pour manger · ${esc(where)}</h3>${placeCard(food.p, food.s, food.why, `à ${fmtDist(food.d)}`)}</div>`;
      }
      const drink = bestNear(food ? food.p : at, 'Bar', 900, usedPlaces);
      if (drink) {
        usedPlaces.add(drink.p.id);
        html += `<div class="slot slot--food"><h3 class="slot__label">🍸 Un verre après</h3>${placeCard(drink.p, drink.s, drink.why, `à ${fmtDist(drink.d)}`)}</div>`;
      }
    }
    html += '</section>';
  }
  lastPlan = picks;
  return { html, count: picks.length, cut };
}

// tri dans une journée : d'abord les horaires précis, puis "Journée", puis horaire inconnu
const key = (ss) => { const h = time(ss[0][0]); return h && h !== '00:00' ? h : h === '00:00' ? '98' : '99'; };

function renderCats(counts) {
  $('#cats').innerHTML = CAT_ORDER.filter((c) => counts[c] || state.cats.has(c)).map((c) =>
    `<button class="chip" style="--c: var(--c-${CAT_VAR[c]})" data-cat="${esc(c)}" aria-pressed="${state.cats.has(c)}"><span class="dot"></span>${esc(c)} <span class="n">${counts[c] || 0}</span></button>`).join('')
    || '<span class="tag">Aucune catégorie sur cette période</span>';
}

function syncControls() {
  $$('#when button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.when === state.when)));
  $('#custom').hidden = state.when !== 'custom';
  if (state.when === 'custom') { const [a] = range(); $('#from').value = ymd(a); $('#to').value = state.to || ''; }
  // menu principal + période (pas de période pour les lieux, toujours dispo)
  $$('.mainnav [role=tab]').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === state.tab || (t.dataset.tab === 'events' && state.tab === 'ongoing'))));
  $('#period').hidden = state.tab === 'places' || state.tab === 'deals';
  // sur téléphone, le menu défile de côté : on garde la rubrique active visible
  const nav = $('.mainnav'), cur = nav.querySelector('[aria-selected="true"]');
  if (cur && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = Math.max(0, cur.offsetLeft - nav.offsetLeft - 16);
  const [ra, rb] = range();
  $('#rangeLabel').innerHTML = `<strong>${esc(periodName())}</strong> · ${esc(rangeLabel([ra, rb]))}`;
  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
  $('#prev').disabled = ra <= t0;
  $('#pickBox').checked = state.pick === 'best';
  if ($('#q').value !== state.q) $('#q').value = state.q;
  $$('#moment button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === state.moment)));
  renderTastes();
  for (const k of TOGGLES) $('#' + k).checked = state[k];
  $('#city').value = state.city;
  $$('#sources .chip').forEach((b) => b.setAttribute('aria-pressed', String(state.sources.has(b.dataset.src))));
  const n = state.cats.size + state.sources.size + (state.city ? 1 : 0) + (state.moment ? 1 : 0) + TOGGLES.filter((k) => state[k]).length;
  $('#activeCount').hidden = !n; $('#activeCount').textContent = n;
}

function renderTastes() {
  const sym = { love: '♥', ok: '–', nope: '✕' };
  const lab = { love: "J'adore", ok: 'Neutre', nope: 'Pas pour moi' };
  $('#tastes').innerHTML = CAT_ORDER.map((c) => `<div class="taste"><span><span class="dot" style="--c: var(--c-${CAT_VAR[c]})"></span>${esc(c)}</span>
    <div class="tri" data-cat="${esc(c)}">${['love', 'ok', 'nope'].map((v) =>
      `<button type="button" data-v="${v}" title="${lab[v]}" aria-label="${esc(c)} : ${lab[v]}" aria-pressed="${tastes[c] === v}">${sym[v]}</button>`).join('')}</div></div>`).join('');
  $('#unhide').hidden = !hidden.size;
  $('#unhide').textContent = hidden.size > 1 ? `Réafficher les ${hidden.size} sorties masquées` : 'Réafficher la sortie masquée';
}

function renderStatic() {
  const cities = {};
  for (const e of EVENTS) if (e.city) cities[e.city] = (cities[e.city] || 0) + 1;
  $('#city').innerHTML = '<option value="">Toute la métropole</option><option value="__toulouse">Toulouse uniquement</option>' +
    Object.entries(cities).sort((x, y) => y[1] - x[1]).map(([c, n]) => `<option value="${esc(c)}">${esc(c)} (${n})</option>`).join('');

  const srcCount = {};
  for (const e of EVENTS) for (const s of e.sources) srcCount[s] = (srcCount[s] || 0) + 1;
  $('#sources').innerHTML = (DATA.sources || []).map((s) => s.name).filter((s) => srcCount[s]).map((s) =>
    `<button class="chip" data-src="${esc(s)}" aria-pressed="false">${esc(s)} <span class="n">${srcCount[s]}</span></button>`).join('');

  const gen = new Date(DATA.generatedAt);
  const hours = (Date.now() - gen) / 36e5;
  $('#updated').textContent = `${EVENTS.length.toLocaleString('fr-FR')} sorties · mis à jour ${hours < 1 ? "il y a moins d'une heure" : hours < 24 ? `il y a ${Math.round(hours)} h` : 'le ' + fmtStamp.format(gen)}`;
  if (hours > 48) {
    $('main').insertAdjacentHTML('afterbegin', `<div class="banner">Les données datent du ${esc(fmtStamp.format(gen))} : la mise à jour automatique ne tourne peut-être plus (onglet <em>Actions</em> du dépôt GitHub).</div>`);
  }
  $('#foot').innerHTML = `<strong>Sources</strong> — récupérées automatiquement chaque matin. Vérifie toujours les infos sur le site de l'organisateur avant de te déplacer.
    <ul>${(DATA.sources || []).map((s) => `<li class="${s.ok ? '' : 'ko'}">${s.ok ? '✓' : '⚠'} <a href="${esc(safeUrl(s.site) || '#')}" target="_blank" rel="noopener">${esc(s.name)}</a> (${s.count})${s.ok ? '' : ' — en panne, données de la veille'}</li>`).join('')}</ul>
    <p>Lieux &amp; restos : données <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© les contributeurs OpenStreetMap</a> (ODbL). Pas d'avis clients : la note vient des règles expliquées sous chaque fiche ; le 📍 ouvre le lieu dans Google Maps avec ses avis.</p>
    ${ENCRYPTED ? '<p><button class="link" id="logout" type="button">Se déconnecter de cet appareil</button></p>' : ''}`;
  $('#logout')?.addEventListener('click', () => { forgetKey(); location.reload(); });
}

// ---------- agenda (.ics) ----------

function downloadIcs(text, name) {
  const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${fold(name).replace(/[^a-z0-9]+/g, '-').slice(0, 50) || 'sortie'}.ics`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
const wrapIcs = (vevents) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//sorties-toulouse//FR', ...vevents.flat(), 'END:VCALENDAR'].join('\r\n');

function icsFor(e) {
  const { from, to } = compute();
  const s = e.sessions.find((x) => sday(x[1]) >= from && sday(x[0]) <= to) || e.sessions[0];
  return wrapIcs([vevent(e, s)]);
}

function vevent(e, s) {
  const dt = (v) => v.replace(/[-:]/g, '').slice(0, 13) + '00';
  const lines = ['BEGIN:VEVENT',
    `UID:${e.id}-${sday(s[0])}@sorties-toulouse`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`];
  const h = time(s[0]);
  if (!h || (h === '00:00' && (time(s[1]) || '23:59') >= '23:00')) {
    lines.push(`DTSTART;VALUE=DATE:${sday(s[0]).replace(/-/g, '')}`, `DTEND;VALUE=DATE:${ymd(addDays(toDate(s[1]), 1)).replace(/-/g, '')}`);
  } else {
    const end = time(s[1]) && s[1] > s[0] ? s[1] : `${sday(s[0])}T${pad(Math.min(23, +h.slice(0, 2) + 2))}:${h.slice(3)}`;
    lines.push(`DTSTART;TZID=Europe/Paris:${dt(s[0])}`, `DTEND;TZID=Europe/Paris:${dt(end)}`);
  }
  const txt = (v) => String(v || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => '\\' + c);
  const city = e.city && !fold(e.address).includes(fold(e.city)) ? e.city : '';
  lines.push(`SUMMARY:${txt(e.title)}`, `LOCATION:${txt([e.venue, e.address, city].filter(Boolean).join(', '))}`,
    `DESCRIPTION:${txt((e.desc ? e.desc + '\n\n' : '') + (e.url || ''))}`);
  if (safeUrl(e.url)) lines.push(`URL:${e.url}`);
  lines.push('END:VEVENT');
  return lines;
}

// ---------- événements de l'interface ----------

function update(fn) { fn(); limit = PAGE; expandedDays.clear(); render(); }

// Accueil : retour à la vue de départ (ce week-end, Sélection, aucun filtre), en haut de page
function goHome() {
  update(() => Object.assign(state, {
    when: 'weekend', shift: 0, from: '', to: '', q: '', cats: new Set(), sources: new Set(), city: '', moment: '',
    free: false, kids: false, favs: false, hideFull: false, try: false, tab: 'events', pick: 'best',
  }));
  $('#filters').classList.remove('open');
  $('#filtersBtn').setAttribute('aria-expanded', 'false');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem('sorties-theme', t); } catch { /* navigation privée */ }
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', t === 'dark' ? '#161211' : '#faf6f2');
}

function bind() {
  $('#homeBtn').addEventListener('click', (ev) => { ev.preventDefault(); goHome(); });
  $('#themeBtn').addEventListener('click', () => setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'));
  $('#when').addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    update(() => {
      state.when = b.dataset.when; state.shift = 0;
      if (state.when === 'custom' && !state.from) { state.from = ymd(new Date()); state.to = ''; }
    });
    if (state.when === 'custom') { try { $('#from').showPicker(); } catch { $('#from').focus(); } }
  });
  for (const id of ['from', 'to']) $('#' + id).addEventListener('change', () => update(() => { state.from = $('#from').value; state.to = $('#to').value; }));
  $('#prev').addEventListener('click', () => update(() => shiftPeriod(-1)));
  $('#next').addEventListener('click', () => update(() => shiftPeriod(1)));
  $('#pickBox').addEventListener('change', (ev) => update(() => { state.pick = ev.target.checked ? 'best' : 'all'; }));
  let t;
  $('#q').addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => update(() => { state.q = $('#q').value.trim(); }), 160); });
  $('#cats').addEventListener('click', (ev) => {
    const b = ev.target.closest('.chip'); if (!b) return;
    update(() => { const c = b.dataset.cat; state.cats.has(c) ? state.cats.delete(c) : state.cats.add(c); });
  });
  $('#sources').addEventListener('click', (ev) => {
    const b = ev.target.closest('.chip'); if (!b) return;
    update(() => { const s = b.dataset.src; state.sources.has(s) ? state.sources.delete(s) : state.sources.add(s); });
  });
  $('#moment').addEventListener('click', (ev) => { const b = ev.target.closest('button'); if (b) update(() => { state.moment = b.dataset.m; }); });
  $('#summary').addEventListener('click', (ev) => {
    if (ev.target.closest('[data-pickall]')) update(() => { state.pick = 'all'; });
    const go = ev.target.closest('[data-goto]');
    if (go) update(() => { state.tab = go.dataset.goto; });
  });
  $('#tastes').addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-v]'); if (!b) return;
    tastes[b.closest('.tri').dataset.cat] = b.dataset.v;
    store.set('sorties-gouts', tastes);
    render();
  });
  $('#resetTastes').addEventListener('click', () => {
    tastes = { ...DEFAULT_TASTES }; learned = { cat: {}, venue: {} };
    store.set('sorties-gouts', tastes); store.set('sorties-appris', learned);
    render();
  });
  $('#unhide').addEventListener('click', () => { hidden.clear(); store.set('sorties-masques', []); render(); });
  for (const k of TOGGLES) $('#' + k).addEventListener('change', (ev) => update(() => { state[k] = ev.target.checked; }));
  $('#city').addEventListener('change', (ev) => update(() => { state.city = ev.target.value; }));
  $('#reset').addEventListener('click', () => update(() => {
    Object.assign(state, { q: '', cats: new Set(), sources: new Set(), city: '', moment: '', free: false, kids: false, favs: false, hideFull: false, try: false });
  }));
  $$('.mainnav [role=tab]').forEach((tab) => tab.addEventListener('click', () => update(() => { state.tab = tab.dataset.tab; })));
  $('#filtersBtn').addEventListener('click', () => {
    const open = $('#filters').classList.toggle('open');
    $('#filtersBtn').setAttribute('aria-expanded', String(open));
  });
  $('#apply').addEventListener('click', () => {
    $('#filters').classList.remove('open');
    $('#filtersBtn').setAttribute('aria-expanded', 'false');
    $('main').scrollIntoView({ behavior: 'smooth' });
  });
  $('#more').addEventListener('click', () => { limit += PAGE; render(); });

  $('#list').addEventListener('click', (ev) => {
    const go = ev.target.closest('[data-goto]');
    if (go) { update(() => { state.tab = go.dataset.goto; }); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    const more = ev.target.closest('[data-expand]');
    if (more) { expandedDays.add(more.dataset.expand); render(); return; }
    if (ev.target.closest('[data-reroll]')) { planSeed++; render(); return; }
    const pk = ev.target.closest('[data-pkind]');
    if (pk) { update(() => { state.pkind = pk.dataset.pkind; }); return; }
    if (ev.target.closest('[data-showtested]')) { state.showTested = !state.showTested; render(); return; }
    if (ev.target.closest('[data-pickall]')) { update(() => { state.pick = 'all'; }); return; }
    if (ev.target.closest('[data-plan-ics]')) {
      if (lastPlan.length) downloadIcs(wrapIcs(lastPlan.map((p) => vevent(p.e, p.s))), 'mon-programme-sorties');
      return;
    }
    const btn = ev.target.closest('[data-act]'); if (!btn) return;
    const id = btn.closest('.card').dataset.id;
    const e = EVENTS.find((x) => x.id === id) || PLACES.find((x) => x.id === id); if (!e) return;
    const teach = e.sessions ? learn : learnPlace;
    if (btn.dataset.act === 'tested') {
      tested.has(id) ? tested.delete(id) : tested.add(id);
      store.set('sorties-testes', [...tested]);
      render();
      return;
    }
    if (btn.dataset.act === 'why') {
      const panel = btn.closest('.card').querySelector('.card__why');
      panel.hidden = !panel.hidden;
      btn.setAttribute('aria-expanded', String(!panel.hidden));
      return;
    }
    if (btn.dataset.act === 'nope') {
      hidden.add(id); store.set('sorties-masques', [...hidden]);
      teach(e, -1);
      const el = btn.closest('.card');
      el.style.transition = 'opacity .2s'; el.style.opacity = '0';
      setTimeout(render, 200);
      return;
    }
    if (btn.dataset.act === 'fav') {
      favs.has(id) ? favs.delete(id) : favs.add(id);
      store.set('sorties-favs', [...favs]);
      const on = favs.has(id);
      teach(e, on ? 1 : -1);
      btn.classList.toggle('on', on); btn.setAttribute('aria-pressed', String(on));
      btn.title = on ? 'Retirer des favoris' : 'Ajouter aux favoris';
      if (state.favs && !on) render();
    } else if (btn.dataset.act === 'ics') downloadIcs(icsFor(e), e.title);
  });

  window.addEventListener('hashchange', () => { readHash(); limit = PAGE; render(); });
  // hauteur de la barre du haut quand elle reste collée (ordinateur) ; 0 sur téléphone où elle défile
  const setTop = () => document.documentElement.style.setProperty('--top-h',
    (getComputedStyle($('.top')).position === 'sticky' ? $('.top').offsetHeight : 0) + 'px');
  new ResizeObserver(setTop).observe($('.top'));
  window.addEventListener('resize', setTop);
  setTop();
}

// ---------- données chiffrées (AES-256-GCM, clé PBKDF2-SHA-256 tirée du mot de passe) ----------

let ENCRYPTED = false;
const b64d = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64e = (u8) => btoa(String.fromCharCode(...u8));

async function deriveKey(password, box) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: b64d(box.salt), iterations: box.iterations }, base, 256));
}
async function openBox(box, raw) {
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
  const gz = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(box.iv) }, key, b64d(box.data));
  const text = await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  return JSON.parse(text);
}
function savedKey(box) {
  // la clé (jamais le mot de passe) : sur l'appareil si "Rester connecté", sinon le temps de l'onglet
  for (const get of [() => localStorage.getItem('sorties-cle'), () => sessionStorage.getItem('sorties-cle')]) {
    try { const k = JSON.parse(get() || 'null'); if (k && k.salt === box.salt) return b64d(k.key); } catch { /* stockage bloqué */ }
  }
  return null;
}
function forgetKey() {
  try { localStorage.removeItem('sorties-cle'); } catch { /* */ }
  try { sessionStorage.removeItem('sorties-cle'); } catch { /* */ }
}

async function unlock(box) {
  const known = savedKey(box);
  if (known) { try { return await openBox(box, known); } catch { forgetKey(); } }
  document.body.classList.add('locked');
  $('#lock').hidden = false;
  $('#pw').focus();
  return new Promise((resolve) => {
    $('#lockForm').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const btn = $('#unlockBtn');
      btn.disabled = true; btn.textContent = 'Ouverture…'; $('#lockErr').textContent = '';
      try {
        const raw = await deriveKey($('#pw').value, box);
        const data = await openBox(box, raw);
        const saved = JSON.stringify({ salt: box.salt, key: b64e(raw) });
        try { ($('#remember').checked ? localStorage : sessionStorage).setItem('sorties-cle', saved); } catch { /* navigation privée */ }
        $('#pw').value = '';
        $('#lock').hidden = true;
        document.body.classList.remove('locked');
        resolve(data);
      } catch {
        $('#lockErr').textContent = 'Mot de passe incorrect.';
        btn.disabled = false; btn.textContent = 'Ouvrir';
        $('#pw').select();
      }
    });
  });
}

async function loadData() {
  const r = await fetch('data/events.enc.json', { cache: 'no-cache' });
  if (r.ok) { ENCRYPTED = true; return unlock(await r.json()); }
  // en local, sans chiffrement (data/events.json ne part jamais sur GitHub)
  const plain = await fetch('data/events.json', { cache: 'no-cache' });
  if (!plain.ok) throw new Error("Le programme n'a pas encore été généré (onglet Actions du dépôt).");
  return plain.json();
}

// ---------- démarrage ----------

async function start() {
  readHash();
  bind();
  syncControls();
  try {
    DATA = await loadData();
  } catch (err) {
    $('#updated').textContent = 'Impossible de charger les sorties.';
    $('#list').innerHTML = `<div class="empty"><strong>Les données ne sont pas disponibles.</strong>${esc(err.message)}</div>`;
    return;
  }
  const t = ymd(new Date());
  EVENTS = DATA.events
    .map((e) => ({ ...e, sessions: e.sessions.filter((s) => sday(s[1]) >= t), sources: e.sources || [] }))
    .filter((e) => e.sessions.length);
  // mot "à essayer" trouvé dans le titre (gros bonus) ou la description (petit bonus), avec ses accents d'origine
  const discWord = (txt) => { const m = fold(txt).match(DISCOVERY); return m ? (txt || '').substr(m.index, m[0].length).toLowerCase() : ''; };
  PLACES = (DATA.places || []).map((p) => ({ ...p, sources: p.sources || [] }));
  for (const p of PLACES) {
    p._fname = fold(p.name);
    p._text = fold([p.name, p.kind, KIND[p.kind]?.label, p.detail, p.desc, p.address, p.city, p.michelin ? 'michelin ' + p.michelin : '', p.terrace ? 'terrasse' : '', p.veg ? 'vegetarien vege' : '', p.sources.join(' ')].join(' '));
  }
  for (const e of EVENTS) {
    e._text = fold([e.title, e.venue, e.city, e.category, e.desc, e.address, e.free ? 'gratuit' : '', e.sources.join(' ')].join(' '));
    e._discT = discWord(e.title);
    e._discD = e._discT ? '' : discWord(e.desc);
  }
  renderStatic();
  render();
  // météo de Toulouse (16 jours) : affichée dans les titres des jours et prise en compte s'il pleut
  forecast(43.6045, 1.4440).then((w) => { TLS_WX = w || {}; render(); });
}
start();
