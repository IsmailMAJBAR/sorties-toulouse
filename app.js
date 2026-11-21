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

const CAT_ORDER = ['Concert', 'Soirée', 'Rencontre', 'Spectacle', 'Humour', 'Expo', 'Cinéma', 'Festival', 'Atelier', 'Conférence', 'Visite', 'Sport', 'Marché', 'Autre'];
const CAT_VAR = { Concert: 'concert', Soirée: 'soiree', Rencontre: 'rencontre', Spectacle: 'spectacle', Humour: 'humour', Expo: 'expo', Cinéma: 'cinema', Festival: 'festival', Atelier: 'atelier', Conférence: 'conference', Visite: 'visite', Sport: 'sport', Marché: 'marche', Autre: 'autre' };
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
  Festival: 'love', Atelier: 'love', Conférence: 'ok', Visite: 'ok', Sport: 'ok', Marché: 'ok', Autre: 'ok',
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
  when: 'weekend', from: '', to: '', q: '', cats: new Set(), sources: new Set(),
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
  add(e.image ? 0.3 : -0.7, e.image ? 'Fiche avec photo' : 'Pas de photo (fiche peu soignée)');
  if ((e.desc || '').length > 60) add(0.3, 'Description détaillée');
  if (e.free) add(0.5, 'Gratuit');
  if (e.city && e.city !== 'Toulouse') add(-0.7, `Hors Toulouse (${e.city})`);
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
  if (p.has('when')) state.when = p.get('when');
  state.from = p.get('from') || ''; state.to = p.get('to') || '';
  state.q = p.get('q') || '';
  state.cats = new Set((p.get('cat') || '').split(',').filter(Boolean));
  state.sources = new Set((p.get('src') || '').split(',').filter(Boolean));
  state.city = p.get('city') || '';
  state.moment = p.get('m') || '';
  state.free = p.has('free'); state.kids = p.has('kids'); state.favs = p.has('fav'); state.hideFull = p.has('nofull');
  state.tab = ['ongoing', 'plan', 'places'].includes(p.get('tab')) ? p.get('tab') : 'events';
  state.pkind = p.get('pk') || '';
  state.pick = p.has('all') ? 'all' : 'best';
  state.try = p.has('try');
}
function writeHash() {
  const p = new URLSearchParams();
  if (state.when !== 'weekend') p.set('when', state.when);
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
      if (dow === 6) return [t, addDays(t, 1)];
      if (dow === 0) return [t, t];
      const fri = addDays(t, 5 - dow);
      return [fri, addDays(fri, 2)];
    }
    case 'nextweekend': { // le week-end d'après "Ce week-end" : samedi + dimanche
      const sat = dow === 0 ? addDays(t, -1) : addDays(t, 6 - dow); // samedi de "ce week-end"
      return [addDays(sat, 7), addDays(sat, 8)];
    }
    case '7days': return [t, addDays(t, 6)];
    case 'nextweek': { const mon = addDays(t, ((8 - dow) % 7) || 7); return [mon, addDays(mon, 6)]; }
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
  const mapUrl = 'https://www.google.com/maps/search/?api=1&query=' +
    encodeURIComponent(mapText || (e.lat != null && e.lon != null ? `${e.lat},${e.lon}` : 'Toulouse'));
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
  // nombre affiché dans l'onglet = ce que montre vraiment la liste (avec la limite par jour de la Sélection)
  const perDay = {};
  for (const { sess } of punctual) for (const d of new Set(sess.map((s) => (sday(s[0]) < from ? from : sday(s[0]))))) perDay[d] = (perDay[d] || 0) + 1;
  const shownCount = Object.entries(perDay).reduce((n, [d, c]) => n + (picking && !expandedDays.has(d) ? Math.min(c, PER_DAY) : c), 0);
  $('#tabEvents').innerHTML = `Au programme <span class="n">${shownCount}</span>`;
  $('#tabOngoing').innerHTML = `En continu <span class="n">${ongoing.length}</span>`;
  $$('.tabs [role=tab]').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === state.tab)));

  const list = $('#list');
  const label = state.when === 'all' ? 'Tout le programme' : `${WHEN_LABEL[state.when]} · ${rangeLabel([a, b])}`;
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
      html += `<section class="day"><h2 class="day__head">${esc(dayName[0].toUpperCase() + dayName.slice(1))}${rel ? ` <span class="rel">${rel}</span>` : ''} <small>${items.length + rest} sortie${items.length + rest > 1 ? 's' : ''}</small></h2><div class="cards">`;
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
  } else {
    total = ongoing.length;
    $('#summary').innerHTML = `<strong>${total} expo${total > 1 ? 's' : ''} &amp; activités en continu</strong> — ${esc(label)} · ${picking ? 'les mieux notées en premier' : 'les plus proches de la fin en premier'}${pickNote}`;
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
  $('#more').hidden = shown >= total;
  $('#more').textContent = `Voir plus (${total - shown} restantes)`;
}
// ---------- Lieux & restos (OpenStreetMap + Guide Michelin) : pas datés, toujours dispo ----------

const KINDS = [
  { k: 'Resto', label: 'Restos', icon: '🍽️' }, { k: 'Bar', label: 'Bars', icon: '🍸' }, { k: 'Café', label: 'Cafés', icon: '☕' },
  { k: 'Activité', label: 'Activités', icon: '🧗' }, { k: 'Lieu', label: 'Lieux à voir', icon: '🏛️' },
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
  if (p.kind === 'Activité') add(2.5, `Activité à tester : ${p.detail}`);
  if (p.kind === 'Lieu' && p.notable) add(1, 'Lieu connu (fiche Wikipédia)');
  if (p.kind === 'Bar' && /cocktails|brasserie artisanale/.test(p.detail || '')) add(1, `Bar : ${p.detail}`);
  add(p.url ? 0.5 : -0.5, p.url ? 'A un site web' : 'Pas de site web');
  if (p.hours) add(0.3, 'Horaires renseignés');
  if (p.terrace) add(0.3, 'Terrasse');
  if (p.veg) add(0.3, 'Options végé');
  if (p.chain) add(-3, 'Chaîne');
  if (p.price === '€€€€') add(-1, 'Très cher (€€€€)');
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
  const tags = [
    sc >= TOP ? '<span class="tag tag--top">Top</span>' : '',
    `<span class="tag tag--cat">${esc(kind.label.replace(/s$/, '').replace('Lieux à voi', 'Lieu à voir'))}</span>`,
    p.michelin ? `<span class="tag tag--michelin">Michelin · ${esc(p.michelin)}</span>` : '',
    p.terrace ? '<span class="tag">Terrasse</span>' : '',
    p.veg ? '<span class="tag">Végé</span>' : '',
    isTested ? '<span class="tag tag--free">Testé ✓</span>' : '',
    p.michelinUrl && p.url ? `<a class="tag tag--src" href="${esc(p.michelinUrl)}" target="_blank" rel="noopener">fiche Michelin</a>` : '',
  ].join('');
  return `<article class="card place" data-kind="${esc(p.kind)}" data-id="${esc(p.id)}">
    <div class="card__when"><span class="card__time card__kind" aria-hidden="true">${kind.icon}</span>${note.pill}</div>
    <div class="card__body">
      <h3>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(p.name)}</a>` : esc(p.name)}</h3>
      ${info ? `<p class="card__meta">${esc(info[0].toUpperCase() + info.slice(1))}</p>` : ''}
      <p class="card__meta"><a class="maplink" href="${esc(mapUrl)}" target="_blank" rel="noopener" title="Ouvrir dans Google Maps">${ICON.pin}<span>${esc(p.address || 'Voir sur la carte')}${near ? ` · ${esc(near)}` : ''}</span></a></p>
    </div>
    <div class="card__foot">
      <div class="tags">${tags}</div>
      <div class="actions">
        <button class="icon-btn" data-act="nope" title="Pas pour moi : masquer et voir moins de ce genre" aria-label="Pas pour moi">${ICON.nope}</button>
        <button class="icon-btn${fav ? ' on' : ''}" data-act="fav" title="${fav ? 'Retirer des favoris' : 'Ajouter aux favoris'}" aria-pressed="${fav}" aria-label="Favori">${ICON.star}</button>
        <button class="icon-btn${isTested ? ' on' : ''}" data-act="tested" title="${isTested ? 'Pas encore testé finalement' : "J'ai testé"}" aria-pressed="${isTested}" aria-label="Testé">${ICON.check}</button>
        <a class="icon-btn" href="${esc(mapUrl)}" target="_blank" rel="noopener" title="Ouvrir dans Google Maps" aria-label="Ouvrir dans Google Maps">${ICON.pin}</a>
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
    if (p.kind !== kind || hidden.has(p.id) || tested.has(p.id) || exclude.has(p.id)) continue;
    const d = distM(anchor, p);
    if (d > maxM) continue;
    const sc = placeScore(p);
    out.push({ p, s: sc.s, why: sc.why, d, rank: sc.s - d / 1000 });
  }
  out.sort((a, b) => b.rank - a.rank);
  const top = out.slice(0, 3);
  return top.length ? top[planSeed % top.length] : null;
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
    html += `<section class="day plan"><h2 class="day__head">${esc(dayName[0].toUpperCase() + dayName.slice(1))}${rel ? ` <span class="rel">${rel}</span>` : ''}</h2>`;
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
        if (ss.length) cands.push({ ...r, ss });
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
  if (state.when === 'custom') { const [a, b] = range(); $('#from').value = ymd(a); $('#to').value = ymd(b); }
  if ($('#q').value !== state.q) $('#q').value = state.q;
  $$('#moment button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === state.moment)));
  $$('#pick button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pick === state.pick)));
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
    <p>Lieux &amp; restos : données <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© les contributeurs OpenStreetMap</a> (ODbL) et sélection du <a href="https://guide.michelin.com/fr/fr/occitanie/toulouse/restaurants" target="_blank" rel="noopener">Guide Michelin</a>. Pas d'avis clients : la note vient des règles expliquées sous chaque fiche.</p>
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
    when: 'weekend', from: '', to: '', q: '', cats: new Set(), sources: new Set(), city: '', moment: '',
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
    update(() => { state.when = b.dataset.when; });
    if (state.when === 'custom') $('#from').focus();
  });
  for (const id of ['from', 'to']) $('#' + id).addEventListener('change', () => update(() => { state.from = $('#from').value; state.to = $('#to').value; }));
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
  $('#pick').addEventListener('click', (ev) => { const b = ev.target.closest('button'); if (b) update(() => { state.pick = b.dataset.pick; }); });
  $('#summary').addEventListener('click', (ev) => { if (ev.target.closest('[data-pickall]')) update(() => { state.pick = 'all'; }); });
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
  $$('.tabs [role=tab]').forEach((tab) => tab.addEventListener('click', () => update(() => { state.tab = tab.dataset.tab; })));
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
  const setTop = () => document.documentElement.style.setProperty('--top-h', $('.top').offsetHeight + 'px');
  new ResizeObserver(setTop).observe($('.top'));
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
    p._text = fold([p.name, p.kind, KIND[p.kind]?.label, p.detail, p.address, p.city, p.michelin ? 'michelin ' + p.michelin : '', p.terrace ? 'terrasse' : '', p.veg ? 'vegetarien vege' : ''].join(' '));
  }
  for (const e of EVENTS) {
    e._text = fold([e.title, e.venue, e.city, e.category, e.desc, e.address, e.free ? 'gratuit' : '', e.sources.join(' ')].join(' '));
    e._discT = discWord(e.title);
    e._discD = e._discT ? '' : discWord(e.desc);
  }
  renderStatic();
  render();
}
start();
