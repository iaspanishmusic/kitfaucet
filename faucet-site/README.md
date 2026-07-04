# CryptoFaucet

Site faucet : signup/login par PIN, page de réclamation avec cooldown + hCaptcha, retraits via FaucetPay, et panneau admin complet.

## Compatibilité Node.js

Ce projet n'utilise **aucun module natif** (pas de compilation C++ requise) :
- Base de données : `node:sqlite`, intégré directement à Node.js depuis la v22.5 (aucune dépendance à installer)
- Hash du PIN : `bcryptjs` (JS pur, contrairement à `bcrypt`)
- Sessions : `session-file-store` (JS pur, contrairement à `connect-sqlite3`)

Ça fonctionne donc directement avec **Node.js 24** (ou toute version ≥ 22.13), sans Visual Studio Build Tools ni Python.

## Installation (Windows / PowerShell ou CMD)

```powershell
cd faucet-site
npm install
copy .env.example .env
```

Puis ouvrez `.env` et remplissez :
- `SESSION_SECRET` : une longue chaîne aléatoire
- `HCAPTCHA_SITEKEY` / `HCAPTCHA_SECRET` : depuis https://www.hcaptcha.com
- `FAUCETPAY_API_KEY` : depuis votre dashboard https://faucetpay.io

## Créer un compte admin

```powershell
node scripts/create-admin.js monpseudo 123456
```

## Lancer le site

```powershell
npm start
```

Puis ouvrez http://localhost:3000

## Panneau admin

Connectez-vous avec le compte admin créé plus haut, puis allez sur `/admin`.
Vous pouvez : voir les stats, gérer les utilisateurs (bannir, modifier le solde, promouvoir), voir les retraits, changer les réglages (montant, cooldown, nom du site) sans redémarrer le serveur.

## Emplacements publicitaires

Cherchez les blocs `<div class="ad-slot">` dans `views/home.ejs` et `views/claim.ejs` — remplacez-les par le code JS de votre régie publicitaire (Adsterra, A-ads, Coinzilla, PropellerAds, etc.). ⚠️ Google AdSense interdit ce type de site.

## Sécurité — points à améliorer avant mise en production

1. **PIN → mot de passe** : un PIN de 6 chiffres reste bruteforçable en masse malgré le verrouillage après 5 échecs. Envisagez un vrai mot de passe (8+ caractères) ou un PIN plus long (8-10 chiffres).
2. **HTTPS obligatoire** : sans HTTPS, le PIN circule en clair sur le réseau. Utilisez un reverse proxy (Nginx/Caddy) avec Let's Encrypt, ou déployez sur une plateforme qui gère le HTTPS automatiquement.
3. **`SESSION_SECRET`** : générez-en un vrai (ex: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
4. **Anti-bot renforcé** : le rate-limiting est basique (par IP). Pour un vrai faucet, ajoutez une détection de comptes multiples (device fingerprinting), vérification email, et surveillez les patterns de réclamation suspects (toujours pile au cooldown = bot).
5. **Sauvegardes** : `faucet.db` contient tout. Sauvegardez-le régulièrement.
6. **Currency FaucetPay** : dans `routes/withdraw.js`, le paramètre `currency` est en dur sur `USDT` — changez-le selon la crypto que vous distribuez réellement.

## Structure du projet

```
faucet-site/
├── server.js              # point d'entrée
├── db.js                  # SQLite + réglages
├── middleware/auth.js     # protection routes
├── utils/verifyCaptcha.js
├── routes/
│   ├── auth.js             # signup/login/logout
│   ├── home.js
│   ├── claim.js
│   ├── withdraw.js
│   └── admin.js
├── views/                 # templates EJS
│   ├── admin/
│   └── partials/
├── public/css/style.css
└── scripts/create-admin.js
```
