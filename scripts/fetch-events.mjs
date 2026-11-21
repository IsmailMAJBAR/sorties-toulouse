// Récupère les sorties à Toulouse depuis plusieurs sources publiques et écrit data/events.json.
// Node 20+, aucune dépendance. Lancement : node scripts/fetch-events.mjs
//
// Sources :
//   - Agenda Mairie / Toulouse Métropole (OpenAgenda, export public JSON)
//   - Zénith Toulouse Métropole (programmation du site officiel)
//   - Eventbrite (soirées, stand-up, ateliers, events associatifs…)
//   - Ticketmaster (optionnel : concerts, spectacles, sport — clé API gratuite,
//     à mettre dans la variable d'environnement TICKETMASTER_KEY)
//
// Si une source tombe en panne, on garde ses événements de la veille (encore à venir)
// au lieu de les perdre : le site n'est jamais vide à cause d'un seul site cassé.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCryptoConfig, encrypt, decrypt } from './crypto.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'events.json');             // en clair : seulement sur ton PC (ignoré par Git)
const OUT_ENC = join(ROOT, 'data', 'events.enc.json');     // chiffré : la seule version publiée
const CRYPTO = join(ROOT, 'data', 'crypto.json');
const KEY = process.env.SITE_KEY || '';
const HORIZON_DAYS = 120;        // on garde les événements des 4 prochains mois
const MAX_SESSIONS = 120;        // séances max gardées par événement
const UA = 'Mozilla/5.0 (compatible; sorties-toulouse/1.0; agenda perso, 1 passage par jour)';

// ---------- dates (tout est stocké en heure de Paris, format "AAAA-MM-JJTHH:MM") ----------

const parisFmt = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
function toParis(iso) {
  if (!iso) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;                                          // date seule
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(iso)) return iso.slice(0, 16); // déjà heure locale
  const d = new Date(iso);
  if (isNaN(d)) return null;
  return parisFmt.format(d).replace(' ', 'T');
}
const today = toParis(new Date().toISOString()).slice(0, 10);
const horizon = toParis(new Date(Date.now() + HORIZON_DAYS * 864e5).toISOString()).slice(0, 10);
const day = (s) => s.slice(0, 10);
const inWindow = ([b, f]) => b && f && day(f) >= today && day(b) <= horizon;

// ---------- utilitaires ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, { json = false, tries = 3 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, {
        headers: { 'user-agent': UA, 'accept-language': 'fr-FR,fr;q=0.9', accept: json ? 'application/json' : 'text/html,*/*;q=0.8' },
        signal: AbortSignal.timeout(30000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status} sur ${String(url).replace(/apikey=[^&]+/, 'apikey=…')}`);
      return json ? await r.json() : await r.text();
    } catch (e) {
      last = e;
      if (/HTTP 4\d\d/.test(e.message) && !/HTTP 429/.test(e.message)) break; // inutile d'insister
      await sleep(1500 * (i + 1));
    }
  }
  throw last;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', hellip: '…', eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç' };
function clean(s, max = 0) {
  if (!s) return '';
  let t = String(s)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/[*_#]{1,3}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (max && t.length > max) t = t.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
  return t;
}
const fold = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const fr = (o) => (o && typeof o === 'object' ? o.fr ?? o.en ?? Object.values(o)[0] : o) || '';
// "DAVID HALLYDAY" -> "David Hallyday" (les sites de salles écrivent souvent tout en majuscules)
const SMALL = new Set(['de', 'du', 'des', 'le', 'la', 'les', 'et', 'en', 'à', 'au', 'aux', 'un', 'une', 'sur', 'par', 'pour', 'avec', 'of', 'the', 'and', 'd', 'l']);
function tidyCase(s) {
  if (!s || /\p{Ll}/u.test(s)) return s;
  let first = true;
  return s.toLowerCase().replace(/[\p{L}\p{N}]+/gu, (w, i) => {
    const keepLow = !first && SMALL.has(w) && s[i - 1] !== '-';
    first = false;
    return keepLow ? w : w[0].toUpperCase() + w.slice(1);
  });
}

// ---------- catégories ----------

export const CATEGORIES = ['Concert', 'Soirée', 'Rencontre', 'Spectacle', 'Humour', 'Expo', 'Cinéma', 'Festival', 'Atelier', 'Conférence', 'Visite', 'Sport', 'Marché', 'Autre'];

const RULES = [
  ['Humour', /\b(stand ?up|humour|humoriste|comedy|comedie club|one (wo)?man show|impro(visation)?)\b/],
  ['Rencontre', /\b(meetup|echanges? linguistiques?|language exchange|speak english|tandem|polyglot|jeux de societe|game night|board games?|networking|afterwork|apero|rencontres? entre|se faire des amis|new in town|expats?)\b/],
  ['Soirée', /\b(dj|dj set|club|clubbing|techno|house music|soiree dansante|blind test|quiz|karaoke|bal|loto|roller disco)\b/],
  ['Concert', /\b(concert|live|recital|chorale|orchestre|symphoni\w*|jazz|rap|rock|electro|chanson|fanfare|musique|tribute)\b/],
  ['Cinéma', /\b(cinema|cine|projection|film|court[- ]metrage|documentaire)\b/],
  ['Expo', /\b(expo|exposition|vernissage|retrospective|installation|galerie)\b/],
  ['Festival', /\b(festival|fete|carnaval|parade|feu d'artifice|marche de noel|illuminations?)\b/],
  ['Spectacle', /\b(theatre|spectacle|danse|ballet|cirque|opera|marionnettes?|conte|magie|cabaret|comedie musicale|piece)\b/],
  ['Atelier', /\b(atelier|stage|workshop|initiation|cours|masterclass|fabrication|diy)\b/],
  ['Conférence', /\b(conference|rencontre|debat|table ronde|lecture|dedicace|causerie)\b/],
  ['Visite', /\b(visite|balade|promenade|randonnee|parcours|patrimoine)\b/],
  ['Sport', /\b(match|course|marathon|trail|running|yoga|sport|tournoi|rugby|football|basket|handball|velo|fitness|escalade|trial)\b/],
  ['Marché', /\b(marche|brocante|vide[- ]grenier|salon|foire|braderie|bourse)\b/],
];
function guessCategory(text, fallback = 'Autre') {
  const t = fold(text);
  for (const [cat, re] of RULES) if (re.test(t)) return cat;
  return fallback;
}
const isFreeText = (t) => /\bgratuit|entree libre|acces libre|\bfree\b/.test(fold(t));
const isKidsText = (t) => /\b(enfants?|jeune public|en famille|kids|des \d+ ans|a partir de \d+ ans)\b/.test(fold(t));

// ---------- source : Mairie / Toulouse Métropole (OpenAgenda) ----------

const OA_AGENDA = 50522407; // https://openagenda.com/fr/toulouse-metropole
const OA_TYPES = { 44: 'Cinéma', 16: 'Conférence', 17: 'Marché', 19: 'Sport', 20: 'Expo', 22: 'Festival', 21: 'Marché', 23: 'Conférence', 24: 'Spectacle', 25: 'Atelier', 45: 'Visite' };
const OA_KIDS = new Set([28, 38]); // Jeune public, En famille

async function fetchOpenAgenda() {
  const out = [];
  let after = null;
  for (let page = 0; page < 20; page++) {
    const u = new URL(`https://openagenda.com/agendas/${OA_AGENDA}/events.v2.json`);
    u.searchParams.set('size', '300');
    u.searchParams.append('relative[]', 'current');
    u.searchParams.append('relative[]', 'upcoming');
    if (after) for (const a of after) u.searchParams.append('after[]', a);
    const d = await get(u, { json: true });
    const evs = d.events || [];
    for (const e of evs) {
      const ev = normalizeOA(e);
      if (ev) out.push(ev);
    }
    if (evs.length < 300 || !d.sort) break;
    after = d.sort;
    await sleep(500);
  }
  return out;
}

function normalizeOA(e) {
  if (e.status === 6) return null;                 // annulé
  const loc = e.location;
  if (!loc || e.attendanceMode === 2) return null; // en ligne uniquement
  const sessions = (e.timings || [])
    .map((t) => [toParis(t.begin), toParis(t.end)])
    .filter(inWindow)
    .sort((a, b) => a[0].localeCompare(b[0]));
  if (!sessions.length) return null;

  const title = clean(fr(e.title));
  const desc = clean(fr(e.description), 240);
  const kw = (e.keywords?.fr || []).join(' ');
  const typeId = (e['types-devenements'] || []).find((t) => OA_TYPES[t]);
  let category = OA_TYPES[typeId];
  // "Spectacle - Musique" est trop large : on affine avec les mots-clés.
  if (!category || category === 'Spectacle') category = guessCategory(`${title} ${kw} ${desc}`, category || 'Autre');

  const cond = clean(fr(e.conditions), 140);
  const thumb = e.image?.variants?.find((v) => /thumb/.test(v.type || v.filename))?.filename || e.image?.filename;

  return {
    id: `oa-${e.uid}`,
    title,
    desc,
    sessions,
    venue: clean(loc.name),
    address: clean(loc.address),
    city: clean(loc.city) || 'Toulouse',
    lat: loc.latitude ?? null,
    lon: loc.longitude ?? null,
    category,
    kids: (e.public || []).some((p) => OA_KIDS.has(p)) || isKidsText(`${kw} ${title}`),
    free: (e.entreelibre || []).includes(1) || isFreeText(cond) ? true : null,
    price: cond,
    full: e.status === 5,
    url: e.canonicalUrl || `https://openagenda.com/fr/toulouse-metropole/events/${e.slug}`,
    image: thumb ? (e.image.base || 'https://img.openagenda.com/main/') + thumb : null,
    source: 'Mairie / Métropole',
  };
}

// ---------- JSON-LD (Zénith, Eventbrite…) ----------

function jsonLdEvents(html) {
  const found = [];
  const walk = (x) => {
    if (Array.isArray(x)) return x.forEach(walk);
    if (!x || typeof x !== 'object') return;
    const types = [].concat(x['@type'] || []);
    if (types.some((t) => typeof t === 'string' && t.endsWith('Event'))) found.push(x);
    for (const k of ['@graph', 'itemListElement', 'item', 'event', 'events', 'subEvent']) if (x[k]) walk(x[k]);
  };
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
    try { walk(JSON.parse(m[1])); } catch { /* bloc illisible : on ignore */ }
  }
  return found;
}
function ldPlace(e) {
  const loc = [].concat(e.location || [])[0] || {};
  const a = loc.address || {};
  const addr = typeof a === 'string' ? a : [a.streetAddress].filter(Boolean).join(', ');
  return {
    venue: clean(loc.name),
    address: clean(addr),
    city: clean(typeof a === 'object' ? a.addressLocality : '') || 'Toulouse',
    lat: loc.geo?.latitude != null ? +loc.geo.latitude : null,
    lon: loc.geo?.longitude != null ? +loc.geo.longitude : null,
  };
}
const ldImage = (e) => { const i = [].concat(e.image || [])[0]; return (typeof i === 'string' ? i : i?.url) || null; };
function ldOffer(e) {
  const o = [].concat(e.offers || [])[0];
  if (!o) return { free: null, price: '' };
  const lo = o.lowPrice ?? o.price;
  if (lo === 0 || lo === '0' || lo === '0.00') return { free: true, price: 'Gratuit' };
  if (lo != null && lo !== '') return { free: false, price: `Dès ${String(lo).replace('.', ',')} €` };
  return { free: null, price: '' };
}
function ldSessions(e) {
  const b = toParis(e.startDate);
  if (!b) return [];
  let f = toParis(e.endDate) || b;
  if (f < b) f = b.length > 10 ? b : f; // "endDate" = date seule le même jour : on garde l'heure de début
  if (f.length === 10 && b.length > 10 && day(b) === f) f = b;
  return [[b, f]].filter(inWindow);
}

// ---------- source : Zénith Toulouse Métropole ----------

const ZENITH = 'https://zenith-toulousemetropole.com';
async function fetchZenith() {
  const html = await get(`${ZENITH}/program`);
  // une "carte" par spectacle : nom, lien, statut éventuel (Complet / Annulé / Reporté)
  const cards = html.split('card-show__img').slice(1).map((c) => ({
    href: c.match(/href="(\/shows\/[^"]+)"/)?.[1],
    status: fold(clean(c.slice(0, 6000))).match(/\b(complet|annule|reporte)\b/)?.[1] || null,
  })).filter((c) => c.href);
  const byHref = new Map();
  for (const c of cards) if (!byHref.has(c.href) || c.status) byHref.set(c.href, c.status);

  const out = [];
  for (const [href, status] of byHref) {
    if (status === 'annule') continue;
    await sleep(700);
    let page;
    try { page = await get(ZENITH + href); } catch { continue; }
    for (const e of jsonLdEvents(page)) {
      if (/Cancelled/i.test(String(e.eventStatus))) continue;
      const sessions = ldSessions(e);
      if (!sessions.length) continue;
      const title = tidyCase(clean(e.name));
      const desc = clean(e.description, 240);
      out.push({
        id: `zen-${href.match(/-(\d+)$/)?.[1] || out.length}-${day(sessions[0][0])}`,
        title, desc, sessions,
        venue: 'Zénith Toulouse Métropole', address: '11 avenue Raymond Badiou', city: 'Toulouse', lat: 43.5934, lon: 1.4146,
        category: guessCategory(`${title} ${desc}`, 'Concert'),
        kids: isKidsText(desc),
        free: false, price: '',
        full: status === 'complet' || /SoldOut/i.test(JSON.stringify(e.offers || '')),
        moved: status === 'reporte',
        url: ZENITH + href,
        image: ldImage(e),
        source: 'Zénith',
      });
    }
  }
  return out;
}

// ---------- source : Eventbrite ----------

const EB_PAGES = [
  'd/france--toulouse/events/',
  'd/france--toulouse/events--this-weekend/',
  'd/france--toulouse/events--next-week/',
  'd/france--toulouse/free--events/',
  'd/france--toulouse/nightlife--events/',
  'b/france--toulouse/arts/',
  'b/france--toulouse/music/',
  'b/france--toulouse/food-and-drink/',
];
async function fetchEventbrite() {
  const out = new Map();
  for (const p of EB_PAGES) {
    let html;
    try { html = await get(`https://www.eventbrite.fr/${p}`); } catch { continue; }
    for (const e of jsonLdEvents(html)) {
      const sessions = ldSessions(e);
      if (!sessions.length) continue;
      const url = (e.url || '').split('?')[0];
      const id = 'eb-' + (url.match(/(\d{9,})/)?.[1] || fold(e.name).replace(/\W+/g, '').slice(0, 40));
      if (out.has(id)) continue;
      const place = ldPlace(e);
      if (!place.venue && !place.address) continue; // événements en ligne
      const title = clean(e.name);
      const desc = clean(e.description, 240);
      const offer = ldOffer(e);
      out.set(id, {
        id, title, desc, sessions, ...place,
        category: guessCategory(`${title} ${desc}`),
        kids: isKidsText(title),
        ...offer,
        free: offer.free ?? (isFreeText(`${title} ${desc}`) ? true : null),
        url, image: ldImage(e),
        source: 'Eventbrite',
      });
    }
    await sleep(1200);
  }
  if (!out.size) throw new Error('aucun événement trouvé sur les pages Eventbrite');
  return [...out.values()];
}

// ---------- sources "pages publiques avec JSON-LD" : Meetup, AllEvents ----------
// Meetup = sorties proposées par des groupes/des gens (jeux, langues, randos…), le plus proche de Frimake
// qui, lui, ne publie rien en dehors de son appli.

function ldSource(name, prefix, urls, fallbackCat) {
  return async () => {
    const out = new Map();
    for (const u of urls) {
      let html;
      try { html = await get(u); } catch { continue; }
      for (const e of jsonLdEvents(html)) {
        if (/Online/i.test(String(e.eventAttendanceMode)) || /Cancelled/i.test(String(e.eventStatus))) continue;
        const sessions = ldSessions(e);
        if (!sessions.length) continue;
        const place = ldPlace(e);
        if (!place.venue && !place.address) continue;
        if (place.city && !/toulouse|blagnac|colomiers|tournefeuille|balma|ramonville|l'union|cugnaux|muret|saint|labege|castanet|aucamville|fenouillet|launaguet|quint|portet|seilh|aussonne|cornebarrieu|beauzelle|mondonville|pibrac|plaisance|villeneuve|escalquens|montrabe|pin-balma|flourens|mons|gagnac|bruguieres|castelginest|l'union/i.test(fold(place.city))) continue;
        const url = (e.url || '').split('?')[0];
        const id = `${prefix}-` + (url.match(/(\d{6,})\/?$/)?.[1] || fold(e.name).replace(/\W+/g, '').slice(0, 40) + day(sessions[0][0]));
        if (out.has(id)) continue;
        const title = clean(e.name);
        const desc = clean(e.description, 240);
        const offer = ldOffer(e);
        out.set(id, {
          id, title, desc, sessions, ...place,
          category: guessCategory(`${title} ${desc}`, fallbackCat),
          kids: isKidsText(title),
          ...offer,
          free: offer.free ?? (isFreeText(`${title} ${desc}`) ? true : null),
          url, image: ldImage(e),
          source: name,
        });
      }
      await sleep(1200);
    }
    if (!out.size) throw new Error(`aucun événement trouvé sur ${name}`);
    return [...out.values()];
  };
}

const fetchMeetup = ldSource('Meetup', 'mu', [
  'https://www.meetup.com/find/fr--toulouse/',
  'https://www.meetup.com/find/fr--toulouse/social-activities/',
  'https://www.meetup.com/find/fr--toulouse/outdoor-activities/',
], 'Rencontre');

const fetchAllEvents = ldSource('AllEvents', 'ae', ['https://allevents.in/toulouse'], 'Autre');

// ---------- source optionnelle : Ticketmaster (API officielle, clé gratuite) ----------

const TM_SEGMENTS = { Music: 'Concert', Sports: 'Sport', Film: 'Cinéma' };
const TM_GENRES = { Comedy: 'Humour', Theatre: 'Spectacle', Dance: 'Spectacle', 'Children\'s Theatre': 'Spectacle', Circus: 'Spectacle', Magic: 'Spectacle', 'Fine Art': 'Expo', Classical: 'Concert', Opera: 'Spectacle', Festival: 'Festival' };

async function fetchTicketmaster() {
  const key = process.env.TICKETMASTER_KEY;
  if (!key) return null; // source désactivée
  const out = [];
  for (let page = 0; page < 5; page++) {
    const u = new URL('https://app.ticketmaster.com/discovery/v2/events.json');
    u.searchParams.set('apikey', key);
    u.searchParams.set('countryCode', 'FR');
    u.searchParams.set('city', 'Toulouse');
    u.searchParams.set('locale', '*');
    u.searchParams.set('size', '199');
    u.searchParams.set('page', String(page));
    u.searchParams.set('sort', 'date,asc');
    u.searchParams.set('startDateTime', `${today}T00:00:00Z`);
    u.searchParams.set('endDateTime', `${horizon}T23:59:59Z`);
    const d = await get(u, { json: true });
    for (const e of d._embedded?.events || []) {
      const st = e.dates?.start || {};
      if (!st.localDate || e.dates?.status?.code === 'cancelled') continue;
      const b = st.localTime && !st.timeTBA ? `${st.localDate}T${st.localTime.slice(0, 5)}` : st.localDate;
      const sessions = [[b, b]].filter(inWindow);
      if (!sessions.length) continue;
      const v = e._embedded?.venues?.[0] || {};
      const cls = e.classifications?.[0] || {};
      const title = clean(e.name);
      const pr = e.priceRanges?.[0];
      const img = (e.images || []).filter((i) => i.ratio === '16_9' || i.ratio === '3_2').sort((a, b) => a.width - b.width).find((i) => i.width >= 300) || e.images?.[0];
      out.push({
        id: `tm-${e.id}`,
        title, desc: clean(e.info || e.pleaseNote, 240), sessions,
        venue: clean(v.name), address: clean(v.address?.line1), city: clean(v.city?.name) || 'Toulouse',
        lat: v.location?.latitude ? +v.location.latitude : null, lon: v.location?.longitude ? +v.location.longitude : null,
        category: TM_GENRES[cls.genre?.name] || TM_SEGMENTS[cls.segment?.name] || guessCategory(title),
        kids: cls.family === true || isKidsText(title),
        free: pr ? pr.min === 0 : null,
        price: pr?.min ? `Dès ${String(pr.min).replace('.', ',')} €` : '',
        moved: e.dates?.status?.code === 'rescheduled',
        url: e.url, image: img?.url || null,
        source: 'Ticketmaster',
      });
    }
    if (page + 1 >= (d.page?.totalPages || 0)) break;
    await sleep(400);
  }
  return out;
}

// ---------- lieux & restos (sans date) : OpenStreetMap + Guide Michelin ----------
// OpenStreetMap : © les contributeurs OpenStreetMap, licence ODbL (mention dans le pied de page du site).

// Petites requêtes sur un rectangle de carte (bien plus léger pour Overpass que "la commune de Toulouse",
// qui lui fait recalculer la frontière à chaque fois) : Overpass répond souvent 504 (trop chargé) aux grosses.
// Le rectangle couvre Toulouse et le bord des communes voisines (Blagnac, Balma, Ramonville…).
const BBOX = { s: 43.532, w: 1.350, n: 43.669, e: 1.515, mid: 1.444 };
const OSM_GROUPS = [
  { name: 'restos (ouest)', kinds: ['Resto'], box: [BBOX.s, BBOX.w, BBOX.n, BBOX.mid], q: 'nwr["amenity"="restaurant"]["name"];' },
  { name: 'restos (est)', kinds: ['Resto'], box: [BBOX.s, BBOX.mid, BBOX.n, BBOX.e], q: 'nwr["amenity"="restaurant"]["name"];' },
  { name: 'bars et cafés', kinds: ['Bar', 'Café'], q: 'nwr["amenity"~"^(bar|pub|cafe)$"]["name"];' },
  {
    name: 'activités et lieux', kinds: ['Activité', 'Lieu'],
    q: 'nwr["leisure"~"^(escape_game|bowling_alley|trampoline_park|miniature_golf|amusement_arcade)$"]["name"];' +
      'nwr["sport"="climbing"]["name"];nwr["tourism"~"^(museum|gallery|viewpoint)$"]["name"];' +
      'nwr["tourism"="attraction"]["name"]["wikidata"];nwr["leisure"~"^(park|garden)$"]["name"]["wikidata"];',
  },
];
const osmQuery = (g) => {
  const [s, w, n, e] = g.box || [BBOX.s, BBOX.w, BBOX.n, BBOX.e];
  return `[out:json][timeout:60][bbox:${s},${w},${n},${e}];(${g.q});out center tags;`;
};
let osmComplete = false; // vrai seulement si tous les groupes ont répondu (sinon on réessaie au prochain passage)

const CUISINES = {
  french: 'française', pizza: 'pizza', asian: 'asiatique', japanese: 'japonaise', italian: 'italienne', regional: 'du Sud-Ouest',
  chinese: 'chinoise', indian: 'indienne', vietnamese: 'vietnamienne', sushi: 'sushis', tapas: 'tapas', burger: 'burgers',
  thai: 'thaïlandaise', fine_dining: 'gastronomique', gastronomic: 'gastronomique', gourmet: 'gastronomique', modern: 'moderne', lebanese: 'libanaise', african: 'africaine', seafood: 'fruits de mer',
  salad: 'salades', steak_house: 'viandes', crepe: 'crêpes', ramen: 'ramen', korean: 'coréenne', sandwich: 'sandwichs',
  pasta: 'pâtes', chicken: 'poulet', mexican: 'mexicaine', poke: 'poke', moroccan: 'marocaine', argentinian: 'argentine',
  spanish: 'espagnole', barbecue: 'barbecue', mediterranean: 'méditerranéenne', local: 'locale', bistro: 'bistrot',
  fish: 'poisson', caribbean: 'caribéenne', pancake: 'pancakes', noodle: 'nouilles', international: 'du monde',
  traditional: 'traditionnelle', ethiopian: 'éthiopienne', peruvian: 'péruvienne', greek: 'grecque', turkish: 'turque',
  georgian: 'géorgienne', brazilian: 'brésilienne', portuguese: 'portugaise', vegan: 'vegan', vegetarian: 'végétarienne',
  kebab: 'kebab', tex_mex: 'tex-mex', syrian: 'syrienne', persian: 'persane', iranian: 'iranienne', senegalese: 'sénégalaise',
  cambodian: 'cambodgienne', taiwanese: 'taïwanaise', nepalese: 'népalaise', tibetan: 'tibétaine', afghan: 'afghane',
  basque: 'basque', corsican: 'corse', savoyard: 'savoyarde', cheese: 'fromage', fondue: 'fondue', brunch: 'brunch',
  coffee_shop: 'coffee shop', cake: 'pâtisserie', ice_cream: 'glaces', tea: 'thé', bubble_tea: 'bubble tea', dessert: 'desserts',
};
const cuisineLabel = (c) => (c || '').split(';').map((x) => x.trim()).filter(Boolean).slice(0, 2)
  .map((x) => CUISINES[x] || x.replace(/_/g, ' ')).join(', ');

function osmKind(t) {
  if (t.amenity === 'restaurant') return ['Resto', cuisineLabel(t.cuisine)];
  if (t.amenity === 'bar' || t.amenity === 'pub') return ['Bar', t.amenity === 'pub' ? 'pub' : t.cocktails === 'yes' ? 'cocktails' : t.microbrewery === 'yes' ? 'brasserie artisanale' : ''];
  if (t.amenity === 'cafe') return ['Café', cuisineLabel(t.cuisine)];
  const act = { escape_game: 'escape game', bowling_alley: 'bowling', trampoline_park: 'trampoline', miniature_golf: 'mini-golf', amusement_arcade: 'salle de jeux' };
  if (act[t.leisure]) return ['Activité', act[t.leisure]];
  if (t.sport === 'climbing') return ['Activité', 'escalade'];
  const lieu = { museum: 'musée', gallery: 'galerie', viewpoint: 'point de vue', attraction: 'à voir' };
  if (lieu[t.tourism]) return ['Lieu', lieu[t.tourism]];
  if (t.leisure === 'park' || t.leisure === 'garden') return ['Lieu', t.leisure === 'park' ? 'parc' : 'jardin'];
  return null;
}

// Overpass est souvent chargé (erreur 504) : 3 serveurs publics, 2 tours, avec une pause entre les tours
async function overpass(query) {
  // serveur principal puis miroirs publics ; 2e tour (après une pause) sur les deux plus fiables
  const endpoints = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
  let last;
  for (const [i, endpoint] of [...endpoints, ...endpoints.slice(0, 2)].entries()) {
    if (i === endpoints.length) await sleep(20000);
    try {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'user-agent': UA, 'content-type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
        signal: AbortSignal.timeout(60000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      if ((j.elements || []).length) return j.elements;
      throw new Error('réponse vide');
    } catch (e) { last = e; }
  }
  throw last;
}

async function fetchOSM(previous) {
  const out = [];
  const failed = [];
  const failedKinds = new Set();
  for (const g of OSM_GROUPS) {
    try {
      for (const el of await overpass(osmQuery(g))) { const p = osmPlace(el); if (p) out.push(p); }
    } catch (e) {
      g.kinds.forEach((k) => failedKinds.add(k));
      failed.push(`${g.name} : ${e.message}`);
    }
    await sleep(3000);
  }
  // types en échec : on garde ceux de la veille (pour ces types-là, en entier : pas de doublons ouest/est)
  for (const k of failedKinds) {
    const prev = (previous?.places || []).filter((p) => (p.sources || [])[0] === 'OpenStreetMap' && p.kind === k);
    if (!prev.length) continue; // rien de la veille : on garde au moins la moitié récupérée
    for (let i = out.length - 1; i >= 0; i--) if (out[i].kind === k) out.splice(i, 1);
    prev.forEach((p) => out.push({ ...p, source: 'OpenStreetMap' }));
    failed.push(`${prev.length} « ${k} » repris de la veille`);
  }
  osmComplete = failed.length === 0;
  if (failed.length) console.warn(`  OpenStreetMap incomplet — ${failed.join(' ; ')}`);
  if (!out.length) throw new Error(`Overpass indisponible — ${failed.join(' ; ')}`);
  return out;
}

function osmPlace(el) {
  {
    const t = el.tags || {};
    const k = osmKind(t);
    if (!k || t.opening_hours === 'closed' || t.disused) return null;
    const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
    if (lat == null) return null;
    return {
      id: `osm-${el.type[0]}${el.id}`,
      name: clean(t.name),
      kind: k[0], detail: k[1],
      address: [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' '),
      city: t['addr:city'] || 'Toulouse',
      lat: +lat.toFixed(6), lon: +lon.toFixed(6),
      url: t.website || t['contact:website'] || t.url || '',
      hours: (t.opening_hours || '').slice(0, 90),
      terrace: t.outdoor_seating === 'yes',
      veg: /yes|only/.test(`${t['diet:vegetarian'] || ''} ${t['diet:vegan'] || ''}`),
      chain: !!(t.brand || t['brand:wikidata']),
      notable: !!(t.wikidata || t.wikipedia),
      cuisineRaw: t.cuisine || '',
      source: 'OpenStreetMap',
    };
  }
}

// (Le Guide Michelin a été essayé : il renvoie une page anti-robots aux serveurs de GitHub. On ne la contourne
// pas, donc il n'est pas dans les sources. Le lien 📍 de chaque fiche ouvre Google Maps et ses avis.)
const PLACE_SOURCES = [
  { name: 'OpenStreetMap', site: 'https://www.openstreetmap.org/#map=13/43.6045/1.4440', run: fetchOSM },
];

const metres = (a, b) => {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
// Un resto Michelin qui est aussi sur OpenStreetMap : une seule fiche, enrichie.
function mergePlaces(list) {
  const osm = list.filter((p) => p.source === 'OpenStreetMap');
  const out = [...osm];
  for (const m of list.filter((p) => p.source === 'Guide Michelin')) {
    const k = fold(m.name).replace(/[^a-z0-9]/g, '');
    const twin = osm.find((o) => o.kind === 'Resto' && metres(o, m) < 150 && (() => {
      const ko = fold(o.name).replace(/[^a-z0-9]/g, '');
      return ko.length >= 4 && (k.includes(ko) || ko.includes(k));
    })());
    if (twin) Object.assign(twin, { michelin: m.michelin, price: m.price, michelinUrl: m.url, detail: twin.detail || m.detail, sources: ['OpenStreetMap', 'Guide Michelin'] });
    else out.push(m);
  }
  // même nom, même type, à moins de 250 m : doublon de la carte (ex. deux points pour une même salle)
  const kept = [];
  for (const p of out) {
    const k = fold(p.name).replace(/[^a-z0-9]/g, '');
    if (kept.some((q) => q.kind === p.kind && fold(q.name).replace(/[^a-z0-9]/g, '') === k && metres(q, p) < 250)) continue;
    kept.push(p);
  }
  return kept.map((p) => {
    const q = { ...p, sources: p.sources || [p.source] };
    delete q.source;
    for (const key of Object.keys(q)) if (q[key] === '' || q[key] === false || q[key] == null) delete q[key];
    return q;
  });
}

// ---------- assemblage ----------

const SOURCES = [
  { name: 'Mairie / Métropole', site: 'https://metropole.toulouse.fr/agenda', run: fetchOpenAgenda },
  { name: 'Zénith', site: 'https://zenith-toulousemetropole.com/program', run: fetchZenith },
  { name: 'Eventbrite', site: 'https://www.eventbrite.fr/d/france--toulouse/events/', run: fetchEventbrite },
  { name: 'Meetup', site: 'https://www.meetup.com/find/fr--toulouse/', run: fetchMeetup },
  { name: 'AllEvents', site: 'https://allevents.in/toulouse', run: fetchAllEvents },
  { name: 'Ticketmaster', site: 'https://www.ticketmaster.fr/fr/ville/toulouse', run: fetchTicketmaster },
];

// Un même spectacle peut être au Zénith ET sur Ticketmaster : on fusionne (seulement entre sources différentes).
const titleKey = (e) => fold(e.title).replace(/[^a-z0-9]/g, '');
function dedup(events) {
  const byDay = new Map();
  const kept = [];
  for (const e of events) {
    const d = day(e.sessions[0][0]);
    const k = titleKey(e);
    const sameDay = byDay.get(d) || [];
    const twin = sameDay.find((p) => p.sources.includes(e.source)
      // même source : doublon seulement si même titre, même heure, même ville (événement partagé par 2 agendas)
      ? k.length >= 5 && (p._k === k || p._k.startsWith(k) || k.startsWith(p._k)) && p.sessions[0][0] === e.sessions[0][0] && fold(p.city) === fold(e.city)
      // sources différentes : même jour et un titre qui commence comme l'autre ("Disiz" / "Disiz - Tournée 2026")
      : k.length >= 5 && (p._k.startsWith(k) || k.startsWith(p._k)));
    if (!twin) {
      const n = { ...e, sources: [e.source], _k: k };
      sameDay.push(n); byDay.set(d, sameDay); kept.push(n);
      continue;
    }
    if (!twin.sources.includes(e.source)) twin.sources.push(e.source);
    for (const f of ['desc', 'image', 'address', 'price', 'lat', 'lon']) if (!twin[f] && e[f]) twin[f] = e[f];
    if (twin.free == null && e.free != null) twin.free = e.free;
    twin.full ||= e.full; twin.moved ||= e.moved;
    if (twin.sessions[0][0].length === 10 && e.sessions[0][0].length > 10) twin.sessions = e.sessions; // garder l'heure précise
    if (twin.url !== e.url) (twin.links ||= []).push({ source: e.source, url: e.url });
  }
  return kept;
}

function finalize(e) {
  const sessions = e.sessions.slice(0, MAX_SESSIONS);
  const first = sessions[0][0], last = sessions[sessions.length - 1][1];
  const spanDays = (Date.parse(day(last)) - Date.parse(day(first))) / 864e5;
  // "En continu" : expos, activités ouvertes plusieurs semaines -> rangées à part pour ne pas noyer la liste.
  // (un atelier à 2 dates espacées de 15 jours reste dans le programme normal)
  const days = (b, f) => (Date.parse(day(f)) - Date.parse(day(b))) / 864e5;
  const longSession = sessions.some(([b, f]) => days(b, f) > 6);
  const continuous = sessions.length > 10 || longSession || (spanDays > 6 && sessions.length >= spanDays * 0.4);
  const out = { ...e, sessions, continuous, title: tidyCase(e.title) };
  if (out.city && out.city === out.city.toLowerCase()) out.city = out.city.replace(/(^|[-\s])(\p{L})/gu, (_, p, c) => p + c.toUpperCase());
  delete out.source; delete out._k;
  for (const k of Object.keys(out)) if (out[k] === '' || out[k] === null || out[k] === false) delete out[k];
  return out;
}

async function main() {
  // Sur GitHub, on ne publie jamais en clair : sans clé, on s'arrête tout de suite.
  if (process.env.CI && !KEY) {
    console.error('✗ Secret SITE_KEY absent : lance « node scripts/mot-de-passe.mjs » sur ton PC pour le créer. Rien n\'a été publié.');
    process.exit(1);
  }
  const cryptoConf = KEY ? await readCryptoConfig(CRYPTO) : null;

  let previous = { events: [] };
  try { previous = JSON.parse(await readFile(OUT, 'utf8')); } catch {
    // sur GitHub il n'y a que la version chiffrée de la veille
    try { if (KEY) previous = JSON.parse(await decrypt(JSON.parse(await readFile(OUT_ENC, 'utf8')), KEY)); } catch { /* premier lancement ou autre clé */ }
  }

  const all = [];
  const report = [];
  for (const s of SOURCES) {
    const t0 = Date.now();
    try {
      const evs = await s.run();
      if (evs === null) { console.log(`· ${s.name} : désactivé (pas de clé)`); continue; }
      if (!evs.length) throw new Error('0 événement récupéré');
      evs.forEach((e) => all.push(e));
      report.push({ name: s.name, site: s.site, ok: true, count: evs.length });
      console.log(`✓ ${s.name} : ${evs.length} événements (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    } catch (err) {
      // on reprend les événements d'hier pour cette source, s'ils sont encore à venir
      const kept = (previous.events || [])
        .filter((e) => (e.sources || [])[0] === s.name)
        .map((e) => ({ ...e, source: s.name, sessions: e.sessions.filter(([, f]) => day(f) >= today) }))
        .filter((e) => e.sessions.length);
      kept.forEach((e) => all.push(e));
      report.push({ name: s.name, site: s.site, ok: false, count: kept.length, error: String(err.message || err).slice(0, 200) });
      console.warn(`✗ ${s.name} : ${err.message} — ${kept.length} événements repris de la veille`);
    }
  }

  const events = dedup(all)
    .map(finalize)
    .sort((a, b) => a.sessions[0][0].localeCompare(b.sessions[0][0]) || a.title.localeCompare(b.title, 'fr'));

  // lieux & restos (sans date) : ils changent peu -> rechargés une fois par semaine seulement
  // (moins de charge pour OpenStreetMap, moins de risques d'échec), même principe de secours sinon
  const placesAge = previous.placesAt ? (Date.now() - Date.parse(previous.placesAt)) / 864e5 : Infinity;
  const reusePlaces = placesAge < 7 && (previous.places || []).length > 100 && !process.env.FORCE_PLACES;
  let placesAt = previous.placesAt || null;
  const placeList = [];
  if (reusePlaces) {
    for (const p of previous.places) placeList.push({ ...p, source: (p.sources || [])[0] });
    for (const s of PLACE_SOURCES) {
      const old = (previous.sources || []).find((x) => x.name === s.name);
      report.push({ ...(old || { name: s.name, site: s.site, ok: true, count: 0 }), places: true });
    }
    console.log(`· Lieux : ceux du ${previous.placesAt.slice(0, 10)} (rechargés chaque semaine)`);
  }
  for (const s of reusePlaces ? [] : PLACE_SOURCES) {
    try {
      const ps = await s.run(previous);
      if (!ps.length) throw new Error('0 lieu récupéré');
      ps.forEach((p) => placeList.push(p));
      report.push({ name: s.name, site: s.site, ok: true, count: ps.length, places: true });
      console.log(`✓ ${s.name} : ${ps.length} lieux`);
      if (s.name === 'OpenStreetMap' && osmComplete) placesAt = new Date().toISOString();
    } catch (err) {
      const kept = (previous.places || []).filter((p) => (p.sources || [])[0] === s.name).map((p) => ({ ...p, source: s.name }));
      kept.forEach((p) => placeList.push(p));
      report.push({ name: s.name, site: s.site, ok: false, count: kept.length, places: true, error: String(err.message || err).slice(0, 200) });
      console.warn(`✗ ${s.name} : ${err.message} — ${kept.length} lieux repris de la veille`);
    }
  }
  const places = mergePlaces(placeList).sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  const head = { generatedAt: new Date().toISOString(), today, horizon, placesAt, sources: report, categories: CATEGORIES };
  // un élément par ligne : l'historique Git reste lisible et léger d'un jour à l'autre
  const toJson = (h) => JSON.stringify(h).slice(0, -1) +
    ',"events":[\n' + events.map((e) => JSON.stringify(e)).join(',\n') + '\n]' +
    ',"places":[\n' + places.map((p) => JSON.stringify(p)).join(',\n') + '\n]}\n';
  const json = toJson(head);
  await mkdir(dirname(OUT), { recursive: true });
  if (!process.env.CI) {
    await writeFile(OUT, json);
    console.log(`→ ${events.length} événements écrits dans data/events.json (${(json.length / 1024).toFixed(0)} Ko, en clair, reste sur ce PC)`);
  }
  if (KEY) {
    const box = await encrypt(json, KEY, cryptoConf);
    await writeFile(OUT_ENC, box + '\n');
    console.log(`→ version chiffrée : data/events.enc.json (${(box.length / 1024).toFixed(0)} Ko)`);
  }
  if (report.every((r) => !r.ok)) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
