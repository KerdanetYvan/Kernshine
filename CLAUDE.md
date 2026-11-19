# Kernshine — Guide de développement

## Vue d'ensemble

**Kernshine** est une application desktop Windows open source de maintenance PC (nettoyage, réparation, mises à jour), construite avec Tauri 2 (Rust) + React + TypeScript. L'interface est entièrement en **français**. Elle s'est appelée CoffeeCare puis Cleaner PC : ces noms ne doivent plus apparaître (sauf dans l'historique du CHANGELOG).

Tauri a remplacé Electron pour garder la consommation de RAM et de CPU sous contrôle : webview système (WebView2) au lieu d'un Chromium embarqué, backend en Rust.

## Charte et suivi

- **Maquettes et charte** : fichier Figma [Kernshine](https://www.figma.com/design/fWjHCX33P2YQ8M7Cm9vnaQ/Kernshine). Pages : *Brand board* (logo, couleurs, typographie, icônes, ton), *Fondations*, *Composants*, *Écrans*. Ignorer la page *Archives*.
- **Board** : projet GitHub [Kernshine](https://github.com/users/KerdanetYvan/projects/2). Une issue parente par chantier, découpée en sous-issues. Chantiers en cours :
  - #28 Passer à la marque Kernshine (nom, logo, couleurs, typographie, icônes)
  - #33 Installeur : choisir pour qui et où installer Kernshine
  - #38 Refonte des pages selon les maquettes (sous-issues créées au démarrage de la refonte)
- **Ton de la marque** : fiable, clair, calme, transparent, sobre. Kernshine explique avant d'agir et ne fait rien d'irréversible sans l'accord de l'utilisateur.

Le style actuel est provisoire : il sera remplacé par la charte (#31) puis par les écrans (#38). Ne pas investir dans le CSS hors de ces issues.

## Stack technique

| Couche | Technologie |
|--------|-------------|
| Desktop | Tauri 2 (Rust, edition 2024) |
| Frontend | React 19 + TypeScript 5.9 |
| Bundler | Vite 7 |
| Routing | React Router v7 (HashRouter) |
| Style | Tailwind CSS 3.4 |
| Icônes | Lucide React (remplacé par Phosphor, #32) |
| Logs | tauri-plugin-log (dev uniquement) |

## Prérequis

- Node.js 20+
- Rust stable (rustup)
- Outils de build Visual Studio, charge de travail « Développement Desktop en C++ » (sans eux, `link.exe` est introuvable)
- WebView2 (présent sur Windows 11)

## Lancer le projet

```bash
npm run dev          # Tauri + Vite (HMR actif)
npm run build        # Installeur Windows (NSIS) dans src-tauri/target/release/bundle/nsis
npm run build:web    # Interface seule
npm run lint         # ESLint
npm run typecheck    # TypeScript
cd src-tauri && cargo test    # Tests Rust
```

Avant de pousser : `npm run lint`, `npm run typecheck`, puis dans `src-tauri` : `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings` et `cargo test` (la CI fait la même chose).

La version de l'application a **une seule source** : `package.json` (Tauri la lit via `tauri.conf.json`). `Cargo.toml` garde sa propre version, sans importance.

## Architecture

### Communication front ↔ Rust

Chaque fonctionnalité système est une commande Tauri :

```
src-tauri/src/<module>.rs   #[tauri::command] pub async fn domaine_action(...)
src-tauri/src/lib.rs        enregistrée dans tauri::generate_handler![...]
src/pages/*.tsx             invoke<Type>('domaine_action', { arg })
```

Les noms de commandes suivent `domaine_action` en snake_case (`system_get_info`, `scan_get_temp_dirs`, `repair_fix_services`, `updates_install_elevated`). Côté JS, les arguments sont en camelCase (`{ openAtLogin }` ↔ `open_at_login`).

Pour une progression en continu (installation de logiciels), la commande reçoit un `tauri::ipc::Channel<T>` et le front passe un `new Channel<T>()` avec `onmessage`.

Règles de sécurité (non négociables) :

- Les commandes sont **async** et exécutent le travail bloquant dans `spawn_blocking` : l'interface ne doit jamais geler.
- **Ne jamais faire confiance au front** : tout ce qui atteint un script administrateur est validé côté Rust (liste fermée de services, clés de registre limitées à la liste des programmes installés, dossiers connus pour le nettoyage, lettres de disque A-Z, identifiants de paquets sans tiret initial).
- Les scripts PowerShell passent par `ps.rs` : transmis en `-EncodedCommand` (jamais de fichier `.ps1` temporaire) et toute valeur insérée est échappée avec `ps::quote`. Les programmes externes (winget…) sont lancés avec une liste d'arguments, sans interpréteur.
- Pas de commande « shell générique » exposée au front. Les permissions de la fenêtre sont dans `src-tauri/capabilities/default.json`.

### Structure des fichiers

```
src-tauri/
  tauri.conf.json      # Fenêtre sans cadre, NSIS, version = ../package.json
  capabilities/        # Permissions de la fenêtre
  src/
    lib.rs             # Builder, plugins (instance unique, opener, autostart), commandes
    system.rs          # Infos système + échantillonneur CPU/RAM en arrière-plan
    scan.rs            # Analyse et nettoyage des dossiers temporaires
    repair.rs          # Services, fichiers système, périphériques, registre, démarrage, disques
    updates.rs         # Logiciels (winget), pilotes (Windows Update), rapports d'échec
    diagnose.rs        # Échecs d'installation : message simple + type (bouton à proposer)
    report.rs          # Rapport de chaque session de mise à jour (versions avant / attendue / après)
    settings.rs        # Version, lancement avec Windows, ouverture d'un rapport
    hidden.rs          # Programmes masqués dans les mises à jour (hidden-updates.json)
    ps.rs              # PowerShell : normal, administrateur, résultat, échappement
    proc.rs            # Processus sans console, délais, capture des sorties

src/
  App.tsx              # Router + lazy loading des pages
  types/commands.ts    # Types des réponses des commandes
  components/layout/
    MainLayout.tsx     # Layout partagé (barre de titre + sidebar + <Outlet>)
  pages/               # Dashboard, Cleaning, Repair, Updates, Settings, NotFound
```

### Routing

HashRouter est utilisé. Ne pas migrer vers BrowserRouter.

Routes actuelles :
- `/` → Dashboard
- `/cleaning` → Nettoyage
- `/repair` → Réparation
- `/updates` → Mises à jour
- `/settings` → Paramètres

Toutes les pages sont chargées en **lazy** via `React.lazy()` + `<Suspense>`.

### Layout

`MainLayout` crée la fenêtre sans cadre natif : barre de titre de 40px (glisser avec `data-tauri-drag-region`, boutons réduire/agrandir/fermer via `getCurrentWindow()`), sidebar à gauche, zone de contenu scrollable.

## Langage et ton de l'interface

**La cible principale est le grand public non-développeur** : personnes peu à l'aise avec l'informatique, qui veulent juste que leur PC "aille mieux". Il faut :

- **Bannir le jargon technique** dans les labels, boutons, messages et descriptions. Exemples :
  - ❌ "Lancer SFC /scannow" → ✅ "Vérifier les fichiers système"
  - ❌ "Services Windows arrêtés ou désactivés" → ✅ "Programmes essentiels de Windows"
  - ❌ "UAC" → ✅ "Windows va vous demander l'autorisation"
  - ❌ "Erreur 0x80..." → ✅ "Une erreur est survenue, réessayez"
- **Vulgariser pour rassurer** : expliquer brièvement ce que fait une action, sans entrer dans les détails techniques. L'utilisateur doit comprendre *pourquoi* il clique, pas *comment* ça fonctionne.
- **Ton calme et positif** : éviter les formulations alarmistes. Préférer "Votre système semble en bonne santé" à "Aucune violation d'intégrité détectée".
- **Les abréviations et noms internes** (SFC, DISM, winget, CBS.log, IPC…) ne doivent jamais apparaître dans l'UI visible par l'utilisateur.

Cette règle s'applique à tous les textes UI : titres, descriptions, boutons, messages d'état, bandeaux d'erreur, warnings, y compris les messages d'erreur renvoyés par le Rust et les rapports d'échec ouverts par l'utilisateur.

Les messages d'échec des mises à jour viennent de `diagnose.rs` (un message en français simple + un type d'échec `kind`). L'interface choisit ses boutons d'après le **type** (`needs_permission` → « Réessayer avec autorisation », `close_app` → « Fermer l'application »), jamais d'après le texte : on peut reformuler un message sans rien casser. Pour un nouveau cas d'échec, ajouter une règle dans `diagnose.rs` avec son test.

## Conventions de code

### TypeScript

- Mode strict activé (`noUnusedLocals`, `noUnusedParameters`).
- Déclarer les types des réponses des commandes dans `src/types/commands.ts` et les passer à `invoke<Type>(...)`.
- Préférer `interface` pour les shapes de données, `type` pour les unions et alias.

### Composants React

- Un fichier = un composant exporté par défaut.
- Les hooks custom vont dans `src/hooks/` (dossier à créer au besoin).
- Pas de state management global pour l'instant — React local state suffit. N'introduire Zustand ou Context qu'à partir du moment où deux pages distantes partagent le même état.

### Styles Tailwind

- Charte Kernshine (brand board, intégration dans #31) : lilas `#7461B0` (marque, boutons principaux), lilas doux `#E3DCF5` (fonds de mise en avant), or `#F6C45A` (accent, jamais pour du texte sur fond clair), ardoise `#24304A` (texte), sable clair `#FDFBF7` (fond de page), sable `#F6F0E4` (fonds secondaires). Quatre états : Tout va bien, À surveiller, À corriger, Bon à savoir.
- Typographie : Sora pour les titres et les grands chiffres, Manrope pour le texte, les boutons et les libellés. Texte courant à 16 px minimum. Polices embarquées, l'application doit marcher sans internet.
- Thème clair en priorité, le thème sombre viendra plus tard.
- En attendant #31, le code utilise encore l'ancienne couleur `bole` et le pattern de carte `bg-white dark:bg-neutral-800 p-6 rounded-lg shadow-md border border-neutral-200 dark:border-neutral-700`.
- Ne pas créer de classes CSS custom pour ce que Tailwind gère déjà.

### Rust

- `cargo fmt` et `cargo clippy -- -D warnings` doivent passer (imposé par la CI).
- Les commandes qui peuvent échouer renvoient un objet `{ ok, ... }` (avec `error` optionnel) plutôt qu'une `Err` quand l'interface affiche le résultat ; l'`Err` est réservée aux erreurs inattendues.
- Pas de détail technique dans les messages destinés à l'utilisateur : logger le détail avec `log::warn!` et renvoyer un message simple.
- Chaque module contient ses tests. Les analyses en lecture seule sont testées sur la vraie machine ; les corrections (qui demandent les droits administrateur) sont couvertes par des tests de validation des entrées.
- Un test dont le résultat dépend de la machine (winget absent, etc.) doit s'ignorer proprement plutôt qu'échouer. Ne pas non plus tester la **formulation** d'une réponse de winget obtenue en vrai : elle change selon la version, la langue et les sources (le serveur de la CI répond autrement que le PC de développement). Tester les messages sur des textes fixes (`diagnose.rs`).
- **Délais** : un délai dépassé arrête le processus **et ses enfants** (`proc::kill_tree`), sinon l'installateur lancé par winget continue seul et bloque le nouvel essai. Les durées des installations sont réglables (`InstallTimings`) pour pouvoir tester les cas lents avec un faux gestionnaire de paquets (script `.cmd`) sans toucher aux programmes de la machine.
- **winget : lire ne veut pas dire `upgrade`.** `winget upgrade --id X` **installe** la mise à jour, même sans `--silent`. Pour lire l'état d'un programme, utiliser `winget list --id X --exact` (et `winget upgrade` sans `--id` pour lister). Un test `verification_never_installs` protège la vérification après installation. Ne jamais lancer de commande winget de mise à jour pour « essayer » sur la machine de développement.
- Le tableau de winget n'a pas toujours la colonne « Disponible » (absente quand rien n'est à mettre à jour) : ne pas supposer 5 colonnes.

### Nommage

- Fichiers composants : PascalCase (`MainLayout.tsx`, `Dashboard.tsx`)
- Modules Rust : snake_case (`repair.rs`)
- Commandes Tauri : `domaine_action` en snake_case (`scan_get_temp_dirs`)

## État d'avancement des fonctionnalités

| Page | État | Notes |
|------|------|-------|
| Dashboard | Fonctionnel | Infos système, CPU et RAM en temps réel (échantillon toutes les 3 s) |
| Cleaning | Fonctionnel | 15 dossiers connus, détection des applications ouvertes, passage administrateur si besoin |
| Repair | Fonctionnel | Services, fichiers système, périphériques, registre, démarrage, disques |
| Updates | Fonctionnel | Logiciels via winget (progression en continu), pilotes via Windows Update |
| Settings | Partiel | Version et lancement avec Windows ; thème, langue, télémétrie à venir |

## Points d'attention

- **Icônes** : `src-tauri/icons/` contient les icônes par défaut de Tauri. À remplacer par le logo Kernshine (#30, `npx tauri icon`), avec la version simplifiée du logo pour les tailles sous 32 px.
- **Installeur** : NSIS, aujourd'hui `installMode: currentUser`. Choix « pour moi / pour tous », dossier et raccourci sur le bureau suivis dans #33.
- **Signature** : l'installeur n'est pas signé (avertissement SmartScreen).
- **Dossier de données** : `%APPDATA%\fr.kernshine.desktop` (un rapport par session de mise à jour dans `logs\`, les 30 derniers sont conservés ; programmes masqués dans `hidden-updates.json`). Changer l'identifiant dans `tauri.conf.json` déplace ce dossier. L'ancien `fr.cleanerpc.desktop` (alphas Cleaner PC) n'est pas repris : seuls des testeurs les ont installées.
- **Adaptateur supprimé** : les pages appellent `invoke()` directement (plus de `window.api`).
- **Tests Rust sur la CI** : ils lancent de vraies analyses PowerShell. Si l'un d'eux dépend de la machine, le rendre tolérant.
