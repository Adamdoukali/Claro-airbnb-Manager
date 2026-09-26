# 🇲🇦 Claro Airbnb Manager

**Claro Airbnb Manager** est une solution complète tout-en-un conçue pour les hôtes, conciergeries et gestionnaires d'hébergements touristiques au Maroc (Riads, appartements meublés, villas).

L'application combine la **synchronisation de calendriers multi-canaux (Airbnb & Booking.com)**, l'**intégration Hospitable API**, et l'**automatisation complète des fiches de police touristique marocaine (DGSN Loi 80-14 & Gendarmerie Royale)**.

---

## 🌟 Fonctionnalités Clés

### 1. 📅 Calendrier Multi-Canaux & Synchronisation Bidirectionnelle
- **Airbnb & Booking.com** : Synchronisation en temps réel via les flux iCal standard RFC 5545.
- **Anti-Surréservation (Double-Booking Prevention)** : Tout blocage sur Airbnb ou Booking.com est instantanément répercuté.
- **Charte Visuelle Claro & Airbnb** : Identité bordeaux Claro (`#81172E`), interface responsive, indicateurs de sources (Airbnb, Booking.com, Direct, Bloqué).

### 2. ⚡ Intégration Hospitable (my.hospitable.com)
- **Synchronisation automatique** des réservations depuis votre compte Hospitable.
- **Envoi de messages direct** via l'API Hospitable directement dans la messagerie Airbnb ou Booking.com du voyageur.
- **Webhooks entrants** : Détection instantanée des nouvelles réservations pour génération automatique des codes d'accès.

### 3. 🤖 Scanner OCR IA Open-Source (Passeports & CIN Marocaine)
- **100% Local & Sécurisé** : Propulsé par Tesseract.js & MRZ ICAO 9303. Aucune donnée ne quitte votre serveur.
- **Passeports Internationaux** : Lecture automatique de la bande MRZ (Nom, Prénom, N° Passeport, Nationalité, Date de Naissance, Sexe).
- **Carte Nationale d'Identité Marocaine (CIN)** : Reconnaissance des CIN (ex: `NM851019`, Date de délivrance, validité, lieu de naissance).
- **Remplissage automatique en 2 secondes**.

### 4. 👨‍👩‍👧‍👦 Multi-Voyageurs Ultra-Simple & Signature Unique
- **Zéro formulaire lourd** : Les voyageurs saisissent uniquement leur nom complet et scannent leur pièce d'identité.
- **Ajout de voyageurs illimité** : Voyageur 1, Voyageur 2, Voyageur 3...
- **1 Seule Signature Numérique** : Le responsable de réservation signe une seule fois pour tout le groupe.
- **Génération instantanée du PDF officiel DGSN** conforme au format réglementaire marocain.

### 5. 💬 Messages Automatisés & Partage WhatsApp
- **Génération du message d'accueil et de conformité** avec le code d'accès à 6 caractères et le lien direct vers le portail voyageur.
- **Sélecteur de langue instantané** : Français 🇫🇷, Anglais 🇬🇧, ou Bilingue 🌐.
- **Envoi en 1 clic** : Par WhatsApp ou par l'API Hospitable.

### 6. 🎛️ Paramètres & Automatisations (bouton « réglages » dans l'en-tête)
Chaque automatisation est un interrupteur indépendant, **désactivé par défaut** :
- **Message automatique de check-in** : lien + code envoyés dans la messagerie Airbnb/Booking via Hospitable, sans clic. Uniquement pour les **logements cochés**, une seule fois par réservation, arrivées à venir seulement. Moment configurable (dès la réservation, ou X jours avant l'arrivée). Les réservations importées avant l'activation sont ignorées sauf si « Inclure les réservations déjà importées » est coché.
- **Rappel** : court message si la fiche n'est toujours pas complétée X jours avant l'arrivée (une seule fois).
- **Synchronisation Hospitable automatique** : import des nouvelles réservations toutes les minutes.
- **Aperçu** (« qui recevrait un message ? ») : simulation sans envoi ; **Lancer un passage maintenant** exécute réellement.
- Planificateur : Vercel Cron (`vercel.json`, toutes les minutes, `GET /api/automation/run` protégé par `CRON_SECRET`) ou minuterie interne (`AUTOMATION_INTERVAL_MINUTES`) sur un serveur classique.

### 7. 🧪 Fonctionnalités bêta (drapeaux)
Dans **Paramètres > Fonctionnalités (bêta)**, chaque fonctionnalité a son propre interrupteur, **désactivé par défaut**. Une fonctionnalité désactivée est masquée dans l'interface **et** ses routes API répondent 404.

| Drapeau | Ce qu'il active |
|---|---|
| `todayView` | Onglet **Aujourd'hui** : arrivées, départs, rotations le même jour, voyageurs sur place, 7 prochains jours (tous logements). |
| `attention` | Bloc **À traiter** : arrivées sous 48 h sans enregistrement, pièces d'identité saisies à la main, codes expirés, réservations sans messagerie, incidents ouverts. Renvoi du lien en 1 clic. |
| `tasks` | Onglet **Ménage & Tâches** : tâche créée automatiquement par départ (urgente si rotation), assignation, page checklist sans connexion (`/?taskToken=…`). |
| `issues` | **Incidents** par réservation (fiche de la réservation dans le calendrier). |
| `whatsapp` | Bouton WhatsApp pré-rempli dans les alertes pour les réservations sans messagerie Hospitable. |
| `batchExport` | Dans les fiches : **Exporter (zip)** tous les bulletins complétés d'une période (`GET /api/police/export?from=&to=&propertyId=`). |
| `multiUser` | **Comptes** admin / assistant / ménage (`/api/users`). Assistant : sans paramètres ni Hospitable ; ménage : tâches assignées uniquement. |
| `metrics` | Onglet **Statistiques** : occupation, nuits et revenus par logement et par mois. |

Les tâches et incidents sont stockés dans la table `sync_logs` (lignes marquées `_kind`) : aucune migration Supabase n'est nécessaire.

---

## 🔐 Accès Sécurisé (Espace Hôte)

L'espace hôte (calendrier, fiches de police, intégrations) est protégé par un **compte administrateur** : email + mot de passe, session sécurisée par cookie `httpOnly` (7 jours).

- Le premier compte est créé automatiquement au démarrage à partir de `ADMIN_EMAIL` / `ADMIN_PASSWORD` (voir `.env`).
- Le mot de passe peut ensuite être changé via `POST /api/auth/change-password`.
- Le **portail voyageur** (`/?guestCode=123456`) reste public : le voyageur n'a besoin que de son code à 6 chiffres.
- Les tentatives de connexion sont limitées (10 / 15 min par IP), tout comme le portail voyageur et l'OCR.

---

## 🚀 Démarrage en Développement Local

### Prérequis
- [Node.js](https://nodejs.org/) v20+
- Git

### Installation & Lancement
```bash
# 1. Cloner le dépôt
git clone https://github.com/Adamdoukali/Claro-airbnb-Manager.git
cd Claro-airbnb-Manager

# 2. Installer les dépendances
npm run install:all

# 3. Configurer l'environnement
cp server/.env.example server/.env
#   -> renseigner ADMIN_EMAIL, ADMIN_PASSWORD (10 caractères min.) et JWT_SECRET (openssl rand -hex 32)

# 4. Compiler le client frontend
npm run build

# 5. Lancer le serveur (Backend + Frontend unifié)
npm start
```

- **Application & Portail Voyageur** : `http://localhost:5000`
- **Mode développement (hot-reload)** :
  - Backend : `npm run dev` (port 5000)
  - Frontend : `npm run client` (port 3030, proxy `/api` vers le backend)

Sans configuration Supabase, l'application fonctionne en **mode local** : données dans `server/data.json`, fichiers dans `server/uploads` et `server/generated_pdfs` (jamais versionnés dans Git).

---

## 🗄️ Base de Données & Stockage (Supabase)

En production, les données (logements, réservations, fiches de police, utilisateurs) et les fichiers (scans de pièces d'identité, signatures, PDF) sont stockés dans **Supabase** (Postgres + Storage). Le disque d'un hébergeur cloud étant éphémère, c'est indispensable pour ne rien perdre au redéploiement.

1. Créez un projet sur [supabase.com](https://supabase.com) (région **EU** conseillée).
2. Ouvrez **SQL Editor** et exécutez le contenu de [`supabase/schema.sql`](supabase/schema.sql) (tables, index, RLS, bucket privé).
3. Dans **Project Settings > API**, récupérez :
   - `Project URL` → `SUPABASE_URL`
   - `service_role` secret key → `SUPABASE_SERVICE_ROLE_KEY` (⚠️ clé serveur uniquement, jamais dans le navigateur)
4. Renseignez ces deux variables dans `server/.env` (ou dans les variables d'environnement de votre hébergeur). Au démarrage, le serveur affiche `Supabase connecté`.

Le bucket privé `claro-files` est créé automatiquement s'il n'existe pas. Aucun fichier n'est accessible publiquement : les PDF sont servis par le serveur, avec la session hôte ou le code du voyageur.

---

## ⚙️ Variables d'Environnement

| Variable | Obligatoire | Description |
|---|---|---|
| `PORT` | non | Port HTTP (défaut `5000`) |
| `NODE_ENV` | prod | `production` active les cookies `Secure` et exige `JWT_SECRET` |
| `APP_URL` | prod | URL publique (ex. `https://airbnb.clarodigi.com`) utilisée dans les liens envoyés aux voyageurs |
| `JWT_SECRET` | prod | Secret de signature des sessions (`openssl rand -hex 32`) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | 1er démarrage | Compte administrateur créé s'il n'existe aucun utilisateur |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | prod | Base de données + stockage. Vides = mode local |
| `SUPABASE_BUCKET` | non | Nom du bucket Storage (défaut `claro-files`) |
| `HOSPITABLE_API_KEY` | non | Token Hospitable (peut aussi être saisi dans l'interface) |
| `HOSPITABLE_WEBHOOK_SECRET` | conseillé | Vérifie la signature HMAC-SHA256 des webhooks Hospitable |
| `CRON_SECRET` | Vercel | Jeton envoyé par Vercel Cron à `GET /api/automation/run` (`openssl rand -hex 24`) |
| `AUTOMATION_INTERVAL_MINUTES` | non | Serveur classique : fréquence du passage automatique en minutes (défaut 1 en production, 0 = désactivé) |
| `CHROME_PATH` | non | Chemin vers Chrome/Edge/Chromium pour un rendu PDF fidèle (sinon repli `pdf-lib`) |
| `CORS_ORIGINS` | non | Origines supplémentaires autorisées (séparées par des virgules) |

---

## 🌐 Déploiement en Ligne (Hosting 24/7)

### Option 1 : Render.com (Recommandé, fichier `render.yaml` fourni)
1. Créez un compte sur [Render.com](https://render.com) et cliquez sur **New +** > **Blueprint** (ou **Web Service**).
2. Connectez le dépôt GitHub `Claro-airbnb-Manager` : le fichier [`render.yaml`](render.yaml) configure le service (`npm run build` / `npm start`, health check `/api/health`).
3. Renseignez les variables secrètes dans le dashboard : `APP_URL`, `ADMIN_PASSWORD`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `HOSPITABLE_WEBHOOK_SECRET` (`JWT_SECRET` est généré automatiquement).
4. Déployez : l'application est disponible sur `https://<service>.onrender.com` (puis sur votre domaine via **Custom Domains**).

> Les plans gratuits Render mettent le service en veille après inactivité : les webhooks Hospitable seront traités avec un délai au réveil. Le plan **Starter** évite cela.

### Option 1 bis : Vercel (fichier `vercel.json` fourni)
L'API tourne en fonction serverless (`api/index.js`) et le client React est servi par le CDN Vercel. **Supabase est obligatoire** sur Vercel (pas de disque persistant) : sans `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`, l'API répond `503` avec un message explicite.

```bash
npx vercel login                      # une seule fois
npx vercel link --yes                 # lie le dossier au projet Vercel
# Variables (Production) : APP_URL, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD,
#   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, HOSPITABLE_WEBHOOK_SECRET, NODEJS_HELPERS=0
npx vercel env add SUPABASE_URL production
npx vercel deploy --prod
```

Particularités Vercel : les photos de pièces d'identité sont compressées côté navigateur (limite de 4,5 Mo par requête) ; l'OCR et le rendu PDF (Chromium serverless + polices Noto embarquées) s'exécutent dans la fonction, avec un délai maximal de 60 s.

> Diagnostic en production : une fois connecté, ouvrez `/api/settings/diagnostics` pour vérifier le stockage (Supabase), le moteur PDF (Chromium serverless) et les données OCR.

### Option 2 : Railway.app
1. Créez un projet sur [Railway.app](https://railway.app) et liez le dépôt GitHub.
2. Railway détecte le `package.json` (`npm run build` puis `npm start`).
3. Ajoutez les mêmes variables d'environnement dans **Variables**.

### Rendu PDF en production
Le « Bulletin Individuel » est rendu en HTML par un navigateur headless (Edge/Chrome) lorsqu'il est disponible (texte arabe, mise en page fidèle). Sur un hébergeur sans navigateur, un rendu de secours `pdf-lib` (français/anglais, signature et pièce d'identité en annexe) est généré automatiquement. Pour le rendu complet en production : installez Chromium dans l'image (Docker) ou définissez `CHROME_PATH`.

---

## ⚡ Hospitable : Connexion & Webhook

1. Dans Hospitable : **Settings > Apps & API > API Keys** → créez un *Personal Access Token*.
2. Dans Claro Airbnb Manager : menu **Hospitable** → collez le token → **Enregistrer** (le token est vérifié puis stocké côté serveur, il n'est jamais renvoyé au navigateur).
3. Cliquez sur **Importer logements** : vos annonces Airbnb/Booking.com sont créées et liées (identifiant Hospitable).
4. Cliquez sur **Synchroniser Airbnb & Booking** : les réservations des 30 derniers jours et des 12 prochains mois sont importées, chacune reçoit une fiche de police et un code d'accès.
5. Webhook temps réel : **Settings > Apps & API > Webhooks** → URL `https://<votre-domaine>/api/integrations/hospitable/webhook`, événements `reservation.created` et `reservation.changed`. Copiez le *signing secret* dans `HOSPITABLE_WEBHOOK_SECRET`.
6. Pour un fonctionnement 100 % automatique (sans clic) : ouvrez **Paramètres & Automatisations**, cochez les logements concernés, activez « Synchronisation automatique » puis « Message automatique de check-in ». Utilisez d'abord **Aperçu** pour voir qui recevrait un message.

---

## 🔗 Guide de Configuration des Annonces Airbnb & Booking.com (sans Hospitable)

### 1. Activer la Synchronisation Airbnb
1. Connectez-vous à votre compte hôte sur **Airbnb**.
2. Allez dans **Calendrier** > sélectionnez votre logement > volet latéral **Disponibilités**.
3. Descendez à la section **Synchronisation du calendrier**.
4. **Exporter le calendrier Airbnb** : cliquez sur **Exporter le calendrier**, copiez l'URL se terminant par `.ics` et collez-la dans Claro Airbnb Manager (**Sync iCal** > **Lien d'export iCal Airbnb**).
5. **Importer le calendrier Claro dans Airbnb** : dans Claro Airbnb Manager, copiez votre **Lien d'export iCal Claro** (`https://votre-domaine.com/api/calendar/export/<id>.ics?token=…`, le jeton privé empêche toute lecture non autorisée). Sur Airbnb, cliquez sur **Importer le calendrier**, collez ce lien et nommez-le « Claro Manager ».

### 2. Activer la Synchronisation Booking.com
1. Connectez-vous à l'**Extranet Booking.com**.
2. Allez dans **Tarifs et disponibilités** > **Calendrier** > **Synchroniser les calendriers**.
3. **Ajouter une connexion au calendrier** : collez votre lien Claro iCal et nommez-le « Claro Manager ».
4. Copiez ensuite le lien d'export fourni par Booking.com et collez-le dans Claro Airbnb Manager (champ **Lien d'export iCal Booking.com**).

Le flux exporté ne contient que des périodes « Reserved » / « Not available » : aucun nom de voyageur n'est transmis aux plateformes.

---

## 🛡️ Sécurité & Données DGSN
- Espace hôte protégé par authentification ; API refusée sans session (`401`).
- Documents d'identité, signatures et PDF stockés dans un bucket **privé** (ou sur disque en mode local), jamais exposés en statique.
- Le token Hospitable n'est jamais renvoyé au navigateur ; les webhooks sont vérifiés par signature HMAC.
- Téléversements limités aux images (JPEG/PNG/WebP, 15 Mo), OCR 100 % local (Tesseract.js), aucune donnée envoyée à un service tiers.
- Les PDF générés répondent à l'article 36 de la Loi n° 80-14 relative aux établissements touristiques au Maroc.

---

## 📄 Licence
Propriété de **Claro** - Tous droits réservés.
