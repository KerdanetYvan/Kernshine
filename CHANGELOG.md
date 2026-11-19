# Changelog

Toutes les modifications notables de Kernshine sont documentées ici.

Format basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),
versionnage selon [Semantic Versioning](https://semver.org/lang/fr/).

---

## [0.2.0-alpha.1] — 2026-11-19

Cleaner PC devient Kernshine : nouveau nom, nouvelle allure, et une application qui se met à jour toute seule.

### Ajouté

- **Mises à jour de Kernshine** — l'application vous prévient quand une nouvelle version est disponible et l'installe en un clic, depuis les Paramètres. Rien n'est installé sans votre accord, et Kernshine redémarre tout seul après la mise à jour
- **Installation au choix** — installez Kernshine pour vous seul ou pour tous les utilisateurs du PC, dans le dossier de votre choix, avec ou sans raccourci sur le bureau
- **Mises à jour des logiciels**
  - Kernshine vérifie que chaque programme est vraiment à jour après l'installation, et vous le dit franchement si ce n'est pas le cas
  - Les programmes dont la version ne peut pas être lue sont présentés à part, pour ne plus vous être proposés en boucle
  - Vous pouvez ne plus voir un programme dans la liste, et le faire réapparaître depuis les Paramètres
  - Un rapport est enregistré à chaque série de mises à jour, réussies ou non, et peut être ouvert d'un clic

### Modifié

- **Cleaner PC s'appelle désormais Kernshine.** Si vous aviez installé Cleaner PC, désinstallez-le (Paramètres Windows › Applications) : Kernshine s'installe à côté et ne reprend pas vos réglages ni les programmes que vous aviez masqués
- Nouveau logo, nouvelles couleurs, nouvelles polices et nouvelles icônes
- L'application est plus légère : elle utilise moins de mémoire et de processeur
- Quand une mise à jour de logiciel échoue, le message explique simplement ce qui s'est passé, et propose de réessayer avec l'autorisation de Windows ou de fermer le programme concerné quand c'est utile
- Les installations longues ne sont plus interrompues trop tôt
- À la désinstallation, Kernshine ne se lance plus avec Windows, et vous pouvez choisir d'effacer aussi ses données

### Connu

- Les pages ne sont pas encore toutes à la nouvelle apparence : la refonte arrive dans une prochaine version
- Les programmes qui demandent l'autorisation de Windows la demandent un par un
- Le thème sombre n'est pas encore disponible
- L'interface est disponible uniquement en français

## [0.1.0-alpha.2] — 2026-07-01

Mise à jour de stabilité.

### Corrigé

- Empêche l'application de s'ouvrir plusieurs fois en même temps, ce qui pouvait bloquer certains fichiers lors d'une réinstallation ou d'une mise à jour

### Connu

- Le thème sombre n'est pas encore disponible
- L'interface est disponible uniquement en français

## [0.1.0-alpha.1] — 2026-07-01

Première version alpha publique.

### Ajouté

- **Dashboard** — vue d'ensemble du système : OS, processeur, RAM (usage en temps réel), durée de fonctionnement
- **Nettoyage** — détection et suppression des fichiers temporaires (dossiers système, caches navigateurs, corbeille)
- **Réparation**
  - Vérification et relance des programmes essentiels Windows (services critiques)
  - Vérification des fichiers système (SFC)
  - Diagnostic des composants et périphériques
  - Détection et suppression des programmes fantômes (entrées de registre orphelines)
  - Gestion des programmes au démarrage
  - État de santé du disque dur (SMART)
- **Mises à jour** — détection et installation des mises à jour logicielles (winget) et des pilotes
- **Paramètres** — lancement automatique au démarrage de Windows, section à propos avec numéro de version

### Connu

- Le thème sombre n'est pas encore disponible
- L'interface est disponible uniquement en français
