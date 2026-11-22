# Sorties Toulouse

Toutes les sorties de Toulouse et de la métropole sur une seule page : concerts, spectacles, humour,
expos, ateliers, visites, marchés… avec des filtres (période, type, gratuit, enfants, soir, ville)
et des favoris. Les données sont récupérées automatiquement chaque matin.

## Sources

| Source | Ce qu'elle apporte | Comment |
| --- | --- | --- |
| **Mairie / Toulouse Métropole** | ~1 300 événements : musées, médiathèques, centres culturels, Capitole, Zénith, communes de la métropole | export JSON public d'[OpenAgenda](https://openagenda.com/fr/toulouse-metropole) (l'agenda de metropole.toulouse.fr) |
| **Zénith Toulouse Métropole** | toute la programmation, avec « complet » / « annulé » | page [programmation](https://zenith-toulousemetropole.com/program) + fiches spectacles |
| **Eventbrite** | soirées, stand-up, ateliers, events associatifs | pages publiques de recherche Toulouse |
| **Meetup** | sorties proposées par des groupes : jeux, échanges de langues, randos, balades photo | pages publiques « Toulouse » de meetup.com |
| **AllEvents** | concerts Candlelight, comedy clubs, soirées DJ, expériences immersives | page publique allevents.in/toulouse |
| **Ticketmaster** *(optionnel)* | concerts et spectacles des grandes salles (Bikini, Casino Barrière, Halle aux Grains…) | API officielle, clé gratuite (voir plus bas) |

Un même événement présent dans deux sources est fusionné. Si une source est en panne un matin,
ses événements de la veille sont gardés (et le pied de page l'indique).

Pas branchés : **Frimake** (rien n'est public, tout est dans l'appli avec un compte), **Fever**
(pas de données publiques), **Shotgun** et **Songkick** (bloquent les scripts).

## Le mode « Sélection » (pré-filtre) et la note /10

Activé par défaut, pour ne pas se noyer. Chaque sortie a une **note sur 10** (5 + bonus/malus, fonction
`score` dans `app.js`) ; un clic sur la note affiche le détail ligne par ligne :

- **tes goûts par type** (♥ +2,5 · – 0 · ✕ −4), réglables dans le panneau « Mes goûts » (par défaut :
  ateliers, concerts, spectacles, humour, festivals en ♥) ;
- **+2,5 « À essayer »** si le titre parle d'initiation, découverte, masterclass, dégustation, escape game,
  poterie, escalade… (`DISCOVERY`), +1 si c'est seulement dans la description ; le filtre
  « À essayer » ne garde que celles-là ;
- **+2** si l'événement est annoncé sur plusieurs sites, **+1,5** pour les lieux qui valent le coup (`TOP_VENUES`) ;
- **−5** pour les mots qui sentent le « pas ouf » (`BORING` : réunion publique, permanence, atelier numérique, tout-petits…) ;
- petits bonus/malus : image et description (fiche soignée), gratuit, hors Toulouse, pour enfants ;
- **ce que tu fais** : chaque ⭐ fait monter la catégorie et le lieu, chaque 👎 les fait descendre et masque la sortie.

Ensuite on garde ce qui dépasse `THRESHOLD`, et au plus `PER_DAY` sorties par jour (les mieux notées ;
le reste est derrière « + N autres »). Une recherche, une catégorie cochée ou « Mes favoris » passent outre.
Le bouton **Tout** affiche tout, sans pré-filtre. Goûts, 👎 et favoris restent dans le navigateur (localStorage).

## Lieux & restos

Onglet des endroits **toujours dispo** à tester : restos, bars, cafés, activités (escalade, escape game, bowling,
trampoline…) et lieux à voir (musées, galeries, parcs, monuments). Source : **OpenStreetMap** (≈1 500 lieux à
Toulouse et en bordure, © les contributeurs OpenStreetMap, ODbL), interrogé en 4 petites requêtes par rectangle de
carte. Le Guide Michelin a été essayé mais il bloque les serveurs de GitHub (page anti-robots) : pas utilisé.
Pas d'avis clients : la note /10 vient de règles visibles sous chaque fiche (`placeScore` dans `app.js`) —
cuisine à découvrir (+2), activité à tester (+2,5), lieu connu (+1), site web, terrasse,
végé ; chaîne (−3) ; et tes ⭐ / 👎. Le bouton **✓ Testé** range un lieu dans « déjà testés ».
**Funbooker** ajoute ≈ 80 activités à réserver à Toulouse (ateliers, cours, initiations, escape games, vols
en ULM…) avec prix de départ, note des clients, adresse et photo, lues sur la page publique Toulouse et les
fiches (les pages suivantes `?page=` sont interdites aux robots : seule la première est lue). Bonus : « pour
apprendre / s'initier » (+1,5), très bien noté par les clients (+1 à +1,5) ; massages et billets d'entrée
passent derrière (−1,5).

Les lieux sont rechargés **une fois par semaine**, source par source (`FORCE_PLACES=1` pour tout forcer,
`FORCE_PLACES=Funbooker` pour une seule source).
Pas de note Google intégrée : le lien 📍 de chaque fiche ouvre le lieu dans Google Maps, avec ses avis.

## Randos, météo, piscines, voyages

- **Randos** : sorties du **Pyrénées Club de France** (flux RSS public + page de chaque sortie), catégorie
  « Rando » : niveaux, distances, dénivelé, altitude du sommet, heure et lieu de départ (souvent en car du
  club), téléphone d'inscription. Le lieu est localisé (Base Adresse Nationale, sinon OpenStreetMap/Nominatim)
  et le **temps de route depuis Toulouse** calculé avec OSRM — une seule fois par sortie.
- **Météo** (Open-Meteo, gratuit, sans clé, prévisions à 16 jours, demandée par le navigateur) : celle de
  Toulouse dans le titre de chaque jour ; celle **du lieu même de la rando** (à l'altitude du sommet pour la
  haute montagne) sur sa fiche. Un jour de pluie (≥ 60 %), les sorties en plein air passent derrière dans
  Mon programme et Idées date.
- **🎒 Équipement conseillé** sur chaque rando : la base (chaussures, eau, pique-nique, coupe-vent…) + selon
  le type (haute montagne : bâtons, lunettes cat. 3-4, couche chaude, frontale, neige possible l'hiver) + selon
  la météo annoncée (froid, pluie, chaleur, vent).
- **🏊 Baignade** (Lieux & restos) : les piscines de Toulouse (données ouvertes de Toulouse Métropole) et, via
  OpenStreetMap, les lieux de baignade en plein air et parcs aquatiques ; les baignades en plein air passent
  devant de juin à septembre.
- **✈️ Voyages** : les bons plans des 3 dernières semaines du flux RSS public de **Voyages Pirates**, ceux qui
  partent de Toulouse en premier.

## Navigation

- **4 rubriques** en haut : 📅 Agenda · ✨ Mon programme · 💕 Idées date · 📍 Lieux & restos
  (les expos « en continu » sont dans l'Agenda, via le bandeau).
- **Période** : Aujourd'hui · Demain · Week-end · Semaine · 📅 Choisir une date, puis **‹ ›** pour passer à la
  période d'avant / d'après, avec les vraies dates affichées (« Week-end prochain · ven. 27 → dim. 29 nov. »).
- Le pré-filtre **Sélection** est une case dans les Filtres (cochée par défaut).

## Idées date (un rendez-vous à deux)

Pour la période choisie : jusqu'à 5 sorties qui se prêtent à un date (concert, spectacle, humour, jazz,
dégustation, croisière… ; jamais les trucs pour enfants, conférences, team building), chacune avec **le meilleur
resto à moins de 1,2 km** et **un bar à moins de 800 m** du resto (au moins 5,5/10, jamais un lieu déjà testé).
En dessous, des **activités à réserver quand vous voulez** (ateliers cocktails, poterie, cours de cuisine…).
🎲 propose d'autres combinaisons.

## Mon programme

Onglet qui compose une journée pour la période choisie (aujourd'hui, ce week-end, **Week-end pro**, ou un jour
précis avec « Dates… » ; 4 jours max) : pour chaque jour, la sortie la mieux notée du **matin**, de
l'**après-midi** et du **soir**, sans doublon, avec 2 autres idées. S'il n'y a rien à heure fixe le matin ou
l'après-midi, il propose une expo / activité en continu ouverte ce jour-là. 🎲 « Proposer autre chose » tire
d'autres choix parmi les mieux notées ; 📅 « Tout ajouter à mon agenda » télécharge le programme en .ics.
Chaque journée finit par une **idée resto** (le mieux noté à moins de 1,5 km de la dernière sortie du jour, −1 point
par km) et **un verre après** (bar à moins de 900 m du resto), jamais un lieu déjà testé.

## Comment ça marche

```
scripts/fetch-events.mjs   →  data/events.json  →  index.html + app.js (filtres dans le navigateur)
        ▲
GitHub Actions, tous les jours à ~6 h (.github/workflows/update.yml)
```

- `scripts/fetch-events.mjs` : Node 20, aucune dépendance. Récupère, nettoie, classe par catégorie, fusionne les doublons.
- `index.html`, `style.css`, `app.js` : le site, 100 % statique.
- L'adresse de la page garde les filtres (ex. `#when=7days&cat=Concert&m=evening`) : on peut la partager ou la mettre en favori.

## Lancer en local

```powershell
node scripts/fetch-events.mjs
python -m http.server 8765
```

Puis ouvrir http://localhost:8765. En local, sans clé, la page lit `data/events.json` en clair (pas de mot de passe).

## Mot de passe et chiffrement

Le dépôt est public (GitHub Pages gratuit), mais **la liste des sorties n'y est jamais en clair** :

- seule `data/events.enc.json` est publiée : AES-256-GCM, clé tirée du mot de passe par PBKDF2-SHA-256
  (600 000 itérations, sel public dans `data/crypto.json`) — la même méthode que les guides ;
- la page demande le mot de passe et déchiffre **dans le navigateur** ; « Rester connecté » garde la clé
  (jamais le mot de passe) sur l'appareil, « Se déconnecter » en bas de page l'efface ;
- GitHub Actions ne connaît que la clé (secret `SITE_KEY`), pas le mot de passe ; sans ce secret il refuse
  de publier, et il vérifie avant chaque publication qu'aucun fichier en clair ne part ;
- `data/events.json` (en clair) reste sur ton PC : il est dans `.gitignore`.

Le code (ce README, `app.js`…) reste lisible par tous ; seules les données sont protégées.

**Choisir ou changer le mot de passe** — dans un terminal, dans ce dossier :

```powershell
node scripts/mot-de-passe.mjs
```

Tu le tapes deux fois (caché, 12 caractères minimum : une phrase de 4 mots, c'est parfait). Le script envoie
la clé dans le secret GitHub et relance la mise à jour. Le fichier chiffré étant public, un mot de passe court
pourrait être deviné à force d'essais : prends-le long.

## Mettre en ligne sur GitHub Pages

1. Pousser ce dossier sur un dépôt GitHub (branche `main`).
2. **Settings → Pages → Source : GitHub Actions**.
3. `node scripts/mot-de-passe.mjs` (voir ci-dessus) : ça lance aussi la première publication.

Ensuite le site se met à jour tout seul chaque matin.

## Ajouter Ticketmaster (facultatif)

1. Créer un compte gratuit sur https://developer.ticketmaster.com et copier la *Consumer Key*.
2. Dans le dépôt : **Settings → Secrets and variables → Actions → New repository secret**,
   nom `TICKETMASTER_KEY`, valeur = la clé.

Au prochain passage, la source apparaît dans le site.

## Ajouter une source

Écrire une fonction `fetchXxx()` dans `scripts/fetch-events.mjs` qui renvoie des événements au format
ci-dessous, puis l'ajouter au tableau `SOURCES`. Beaucoup de sites de salles publient leurs dates en
JSON-LD (`<script type="application/ld+json">`) : la fonction `jsonLdEvents(html)` les lit directement
(voir `fetchZenith` pour un exemple).

```js
{
  id: 'xx-123', title: 'Nom', desc: 'Résumé court',
  sessions: [['2026-11-28T20:30', '2026-11-28T22:30']],   // heure de Paris ; date seule possible
  venue: 'Salle', address: 'Rue…', city: 'Toulouse', lat: 43.6, lon: 1.44,
  category: 'Concert', kids: false, free: false, price: 'Dès 15 €',
  url: 'https://…', image: 'https://…', source: 'Nom de la source'
}
```

Catégories : Concert, Soirée, Spectacle, Humour, Expo, Cinéma, Festival, Atelier, Conférence, Visite, Sport, Marché, Autre.
