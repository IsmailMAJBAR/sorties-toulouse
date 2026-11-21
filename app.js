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
const WHEN_LABEL = { today: "Aujourd'hui", tomorrow: 'Demain', weekend: 'Ce week-end', '7days': '7 prochains jours', nextweek: 'Semaine prochaine', '30days': '30 prochains jours', all: 'Tout', custom: 'Dates choisies' };
const PAGE = 80;

const ICON = {
  star: '<svg viewBox="0 0 24 24"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>',
  cal: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M12 13v5M9.5 15.5h5"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  nope: '<svg viewBox="0 0 24 24"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.7a2 2 0 0 0-2 1.7l-1.4 9A2 2 0 0 0 4.3 15zM17 2h2.7A2.3 2.3 0 0 1 22 4v7a2.3 2.3 0 0 1-2.3 2H17"/></svg>',
};

// ---------- pré-filtre "Sélection" ----------
// Chaque sortie reçoit une note. En mode Sélection on ne garde que celles qui dépassent un seuil,
// et au maximum PER_DAY par jour (les mieux notées). Tout est réglable ici et dans "Mes goûts".

const TASTE_VAL = { love: 2.5, ok: 0, nope: -4 };
const DEFAULT_TASTES = {
  Concert: 'love', Soirée: 'ok', Rencontre: 'ok', Spectacle: 'love', Humour: 'love', Expo: 'ok', Cinéma: 'ok',
  Festival: 'love', Atelier: 'ok', Conférence: 'nope', Visite: 'ok', Sport: 'ok', Marché: 'ok', Autre: 'ok',
};
const THRESHOLD = 1;    // note minimale pour être dans la Sélection
const PER_DAY = 8;      // sorties max par jour dans la Sélection
const TOP = 4;          // note à partir de laquelle on affiche le badge "Top"
// Mots qui trahissent une sortie "pas ouf" (administratif, très spécialisé, pour les tout-petits…)
const BORING = /\b(reunions? publiques?|conseil de quartier|concertation|permanences?|assemblee generale|formations?|aide (aux|a la|administrative)|demarches|numerique|informatique|ordinateur|cv|emploi|job ?dating|recrutement|aidants?|seniors?|bebes?|tout[- ]petits|heure du conte|bebe lecteur|webinaire|don du sang|collecte|whatsapp|vaccination|depistage|prevention|parentalite|soutien scolaire|aide aux devoirs|accompagnement)\b/;
// Lieux qui valent souvent le déplacement : petit bonus
const TOP_VENUES = /zenith|bikini|metronum|capitole|halle aux grains|garonne|sorano|\brex\b|cave poesie|cite de l.espace|abattoirs|bazacle|quai des savoirs|cinematheque|casino barriere|interference|odyssud|theatre de la cite|museum|augustins|brique comedy|citron bleu|carmelites|jacobins|prairie des filtres|grand rond|envol des pionniers|aeroscopia|halle de la machine|chapelle/;

// ---------- état (synchronisé avec l'adresse de la page, pour partager une recherche) ----------

const state = {
  when: 'weekend', from: '', to: '', q: '', cats: new Set(), sources: new Set(),
  city: '', moment: '', free: false, kids: false, favs: false, hideFull: false, tab: 'events', pick: 'best',
};
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

function score(e) {
  let s = TASTE_VAL[tastes[e.category] || 'ok'];
  if (e.sources.length > 1) s += 2;                 // annoncé sur plusieurs sites = événement qui compte
  if (TOP_VENUES.test(fold(e.venue))) s += 1.5;
  if (BORING.test(e._text)) s -= 5;
  if (e.kids && !state.kids) s -= 1.5;               // pensé pour les enfants
  s += e.image ? 0.3 : -0.7;                         // une fiche sans image ni texte est rarement soignée
  if ((e.desc || '').length > 60) s += 0.3;
  if (e.free) s += 0.5;
  if (e.city && e.city !== 'Toulouse') s -= 0.7;
  if (e.full) s -= 0.5;
  s += 0.6 * (learned.cat[e.category] || 0) + 1 * (learned.venue[fold(e.venue)] || 0);
  return s;
}

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
  state.tab = p.get('tab') === 'ongoing' ? 'ongoing' : 'events';
  state.pick = p.has('all') ? 'all' : 'best';
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
    if (state.city === '__toulouse' ? e.city !== 'Toulouse' : state.city && e.city !== state.city) continue;
    if (state.sources.size && !e.sources.some((s) => state.sources.has(s))) continue;
    if (words.length && !words.every((w) => e._text.includes(w))) continue;
    const sess = e.sessions.filter((s) => sday(s[0]) <= to && sday(s[1]) >= from && momentOk(s) && notOver(s));
    if (sess.length) base.push({ e, sess, score: score(e) });
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

function card(e, ss, ongoing = false, sc = 0) {
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
  return `<article class="card" data-cat="${esc(e.category)}" data-id="${esc(e.id)}">
    <div class="card__when">${when}</div>
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
    for (const { e, sess, score: sc } of punctual) {
      const per = new Map();
      for (const s of sess) { const d = sday(s[0]) < from ? from : sday(s[0]); (per.get(d) || per.set(d, []).get(d)).push(s); }
      for (const [d, ss] of per) (days.get(d) || days.set(d, []).get(d)).push({ e, ss, sc });
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
      for (const it of items) { if (shown >= limit) break; html += card(it.e, it.ss, false, it.sc); shown++; }
      html += '</div>';
      if (rest) html += `<button class="day__more" type="button" data-expand="${d}">+ ${rest} autre${rest > 1 ? 's' : ''} ce jour-là, moins bien notée${rest > 1 ? 's' : ''}</button>`;
      html += '</section>';
    }
    if (ongoing.length && total) {
      html = `<div class="hint"><span>+ ${ongoing.length} expo${ongoing.length > 1 ? 's' : ''} et activités en continu sur cette période</span><button type="button" data-goto="ongoing">Voir</button></div>` + html;
    }
  } else {
    total = ongoing.length;
    $('#summary').innerHTML = `<strong>${total} expo${total > 1 ? 's' : ''} &amp; activités en continu</strong> — ${esc(label)} · ${picking ? 'les mieux notées en premier' : 'les plus proches de la fin en premier'}${pickNote}`;
    const end = (r) => r.e.sessions[r.e.sessions.length - 1][1];
    const items = ongoing.sort((x, y) => (picking ? y.score - x.score : 0) || end(x).localeCompare(end(y)));
    html += '<div class="cards">';
    for (const it of items) { if (shown >= limit) break; html += card(it.e, it.sess, true, it.score); shown++; }
    html += '</div>';
  }

  if (!total) {
    html = `<div class="empty"><strong>Rien ne correspond.</strong>Essaie une autre période, ou retire un filtre.${ongoing.length && state.tab === 'events' ? `<br><br><button class="more" type="button" data-goto="ongoing">Voir les ${ongoing.length} activités en continu</button>` : ''}</div>`;
  }
  list.innerHTML = html;
  $('#more').hidden = shown >= total;
  $('#more').textContent = `Voir plus (${total - shown} restantes)`;
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
  for (const k of ['free', 'kids', 'favs', 'hideFull']) $('#' + k).checked = state[k];
  $('#city').value = state.city;
  $$('#sources .chip').forEach((b) => b.setAttribute('aria-pressed', String(state.sources.has(b.dataset.src))));
  const n = state.cats.size + state.sources.size + (state.city ? 1 : 0) + (state.moment ? 1 : 0) + ['free', 'kids', 'favs', 'hideFull'].filter((k) => state[k]).length;
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
    ${ENCRYPTED ? '<p><button class="link" id="logout" type="button">Se déconnecter de cet appareil</button></p>' : ''}`;
  $('#logout')?.addEventListener('click', () => { forgetKey(); location.reload(); });
}

// ---------- agenda (.ics) ----------

function downloadIcs(e) {
  const blob = new Blob([icsFor(e)], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${fold(e.title).replace(/[^a-z0-9]+/g, '-').slice(0, 50) || 'sortie'}.ics`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function icsFor(e) {
  const { from, to } = compute();
  const s = e.sessions.find((x) => sday(x[1]) >= from && sday(x[0]) <= to) || e.sessions[0];
  const dt = (v) => v.replace(/[-:]/g, '').slice(0, 13) + '00';
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//sorties-toulouse//FR', 'BEGIN:VEVENT',
    `UID:${e.id}@sorties-toulouse`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`];
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
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}

// ---------- événements de l'interface ----------

function update(fn) { fn(); limit = PAGE; expandedDays.clear(); render(); }

// Accueil : retour à la vue de départ (ce week-end, Sélection, aucun filtre), en haut de page
function goHome() {
  update(() => Object.assign(state, {
    when: 'weekend', from: '', to: '', q: '', cats: new Set(), sources: new Set(), city: '', moment: '',
    free: false, kids: false, favs: false, hideFull: false, tab: 'events', pick: 'best',
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
  for (const k of ['free', 'kids', 'favs', 'hideFull']) $('#' + k).addEventListener('change', (ev) => update(() => { state[k] = ev.target.checked; }));
  $('#city').addEventListener('change', (ev) => update(() => { state.city = ev.target.value; }));
  $('#reset').addEventListener('click', () => update(() => {
    Object.assign(state, { q: '', cats: new Set(), sources: new Set(), city: '', moment: '', free: false, kids: false, favs: false, hideFull: false });
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
    const btn = ev.target.closest('[data-act]'); if (!btn) return;
    const id = btn.closest('.card').dataset.id;
    const e = EVENTS.find((x) => x.id === id); if (!e) return;
    if (btn.dataset.act === 'nope') {
      hidden.add(id); store.set('sorties-masques', [...hidden]);
      learn(e, -1);
      const el = btn.closest('.card');
      el.style.transition = 'opacity .2s'; el.style.opacity = '0';
      setTimeout(render, 200);
      return;
    }
    if (btn.dataset.act === 'fav') {
      favs.has(id) ? favs.delete(id) : favs.add(id);
      store.set('sorties-favs', [...favs]);
      const on = favs.has(id);
      learn(e, on ? 1 : -1);
      btn.classList.toggle('on', on); btn.setAttribute('aria-pressed', String(on));
      btn.title = on ? 'Retirer des favoris' : 'Ajouter aux favoris';
      if (state.favs && !on) render();
    } else if (btn.dataset.act === 'ics') downloadIcs(e);
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
  for (const e of EVENTS) e._text = fold([e.title, e.venue, e.city, e.category, e.desc, e.address, e.free ? 'gratuit' : '', e.sources.join(' ')].join(' '));
  renderStatic();
  render();
}
start();
