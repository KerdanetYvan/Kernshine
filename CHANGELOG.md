# Changelog

Toutes les modifications notables de Kernshine sont documentées ici.

Format basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),
versionnage selon [Semantic Versioning](https://semver.org/lang/fr/).

---

## [0.2.0-alpha.3] — 2026-11-20

Toute l'application change d'allure, avec un entretien guidé et trois nouveaux outils : santé du matériel, gros fichiers et désinstallation.

### Ajouté

- **Entretien complet** — depuis l'Accueil, Kernshine analyse tout votre PC (fichiers inutiles, gros fichiers, applications, pilotes), vous montre ce qu'il a trouvé, puis fait chaque étape à la suite une fois que vous avez validé. Rien ne se lance avant votre accord, et vous choisissez dans les Paramètres les étapes à inclure
- **Note sur 100** — l'Accueil donne une note de l'état de votre PC après chaque analyse : place libre, fichiers inutiles, mises à jour en attente et santé du matériel. Le détail de la note s'affiche d'un clic
- **Santé du matériel** — une nouvelle page montre l'état de vos disques, de la batterie (PC portables), la température de la carte graphique et l'utilisation de la mémoire. L'usure des disques se lit à la demande, avec l'autorisation de Windows
- **Gros fichiers** — un nouvel onglet du Nettoyage trouve les fichiers personnels les plus lourds (vidéos, archives, images de disque…), en évitant les dossiers de Windows, des programmes et des jeux. Rien n'est coché d'office, et un clic sur l'emplacement ouvre le dossier dans l'Explorateur
- **Désinstallation** — un nouvel onglet des Applications liste vos programmes avec leur taille, et les désinstalle avec leur propre outil. Les composants dont Windows et vos programmes ont besoin ne sont pas proposés
- Bouton « Vérifier » dans les Paramètres pour rechercher une nouvelle version de Kernshine quand vous le voulez

### Modifié

- **Toutes les pages ont la nouvelle apparence** : Accueil, Nettoyage, Applications, Pilotes, Réparation et Paramètres
- Les analyses ne démarrent plus d'elles-mêmes : un bouton les lance, et leurs résultats restent affichés tant que Kernshine est ouvert
- **Nettoyage** — les zones sont classées par groupe, celles « Sans risque » sont cochées d'office, l'avancement s'affiche en continu et vous pouvez arrêter à tout moment. La place libre de vos disques est montrée avant et après
- **Mises à jour des applications** — les applications ouvertes sont décochées, avec un bouton pour les fermer proprement
- **Pilotes** — noms simples (« Carte graphique NVIDIA »), installation un par un, avec une seule autorisation. Un point de restauration est créé avant : s'il échoue, rien n'est installé sans que vous le confirmiez
- **Démarrage** — le choix de ce qui se lance avec Windows passe dans les Applications, avec un interrupteur par programme. Les programmes nécessaires sont protégés
- **Réparation** — une seule analyse vérifie tout, et les résultats sont classés en « À corriger » et « Tout va bien »
- **Paramètres** — nouveaux réglages : point de restauration avant les pilotes, taille minimale des gros fichiers, étapes de l'entretien et mises à jour automatiques de Kernshine (désactivées par défaut)

### Connu

- La température du processeur n'est pas affichée : Windows ne la donne pas sans outil supplémentaire
- Le thème sombre n'est pas encore disponible
- L'interface est disponible uniquement en français

## [0.2.0-alpha.2] — 2026-11-19

Mise à jour de stabilité, et première version installée automatiquement par Kernshine.

### Corrigé

- L'application ne se fige plus pendant une analyse, une réparation ou une mise à jour : vous pouvez continuer à naviguer pendant que Kernshine travaille

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
