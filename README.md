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

---

## 🚀 Démarrage en Développement Local

### Prérequis
- [Node.js](https://nodejs.org/) v18+ 
- Git

### Installation & Lancement
```bash
# 1. Cloner le dépôt
git clone https://github.com/Adamdoukali/Claro-airbnb-Manager.git
cd Claro-airbnb-Manager

# 2. Installer les dépendances
npm run install:all

# 3. Compiler le client frontend
npm run build

# 4. Lancer le serveur (Backend + Frontend unifié)
npm start
```

- **Application & Portail Voyageur** : `http://localhost:5000`
- **En mode développement hot-reload** :
  - Backend : `npm run dev:server` (Port 5000)
  - Frontend : `npm run client` (Port 3000)

---

## 🌐 Déploiement en Ligne (Hosting 24/7)

Pour que l'application tourne 24h/24 et que la synchronisation avec Airbnb & Booking.com fonctionne en continu :

### Option 1 : Déploiement Gratuit / Pas Cher sur Render.com (Recommandé)
1. Créez un compte sur [Render.com](https://render.com).
2. Cliquez sur **New +** > **Web Service**.
3. Connectez votre dépôt GitHub `Claro-airbnb-Manager`.
4. Configurez :
   - **Environment** : `Node`
   - **Build Command** : `npm run build`
   - **Start Command** : `npm start`
   - **Plan** : `Free` ou `Starter`
5. Votre application sera accessible sur une URL HTTPS (ex: `https://claro-airbnb-manager.onrender.com`).

### Option 2 : Railway.app
1. Créez un projet sur [Railway.app](https://railway.app).
2. Liez le repo GitHub `Claro-airbnb-Manager`.
3. Railway détecte automatiquement le `package.json` et lance `npm run build` puis `npm start`.

---

## 🔗 Guide de Configuration des Annonces Airbnb & Booking.com

### 1. Activer la Synchronisation Airbnb
1. Connectez-vous à votre compte hôte sur **Airbnb**.
2. Allez dans **Calendrier** > sélectionnez votre logement > volet latéral **Disponibilités**.
3. Descendez à la section **Synchronisation du calendrier**.
4. **Exporter le calendrier Airbnb** :
   - Cliquez sur **Exporter le calendrier**.
   - Copiez l'URL se terminant par `.ics`.
   - Dans Claro Airbnb Manager, cliquez sur **Sync iCal** > collez ce lien dans le champ **Lien d'export iCal Airbnb**.
5. **Importer le calendrier Claro dans Airbnb** :
   - Dans Claro Airbnb Manager, copiez votre **Lien d'export iCal Claro** (ex: `https://votre-domaine.com/api/calendar/ical?propertyId=prop_marrakech_01`).
   - Sur Airbnb, cliquez sur **Importer le calendrier**, collez ce lien et nommez-le « Claro Manager ».

### 2. Activer la Synchronisation Booking.com
1. Connectez-vous à l'**Extranet Booking.com**.
2. Allez dans **Tarifs et disponibilités** > **Calendrier** > cliquez sur **Synchroniser les calendriers**.
3. Cliquez sur **Ajouter une connexion au calendrier** :
   - Collez votre lien Claro iCal (`https://votre-domaine.com/api/calendar/ical?propertyId=prop_marrakech_01`).
   - Nommez-le « Claro Manager ».
4. Copiez ensuite le lien d'export fourni par Booking.com et collez-le dans Claro Airbnb Manager (champ **Lien d'export iCal Booking.com**).

---

## 🛡️ Sécurité & Données DGSN
- Les documents d'identité téléversés par les voyageurs et les signatures numériques sont stockés de façon sécurisée et locale.
- Les PDF générés répondent à l'article 36 de la Loi n° 80-14 relative aux établissements touristiques au Maroc.

---

## 📄 Licence
Propriété de **Claro** - Tous droits réservés.
