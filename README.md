# AppPulse

AppPulse est une application full-stack conteneurisée composée d’une interface
web, d’une API REST Node.js/Express en TypeScript, d’une base MySQL 8,
de phpMyAdmin et de Nginx.
Le déploiement sur un VPS s’effectue par GitHub Actions via SSH.

## Architecture

- **API** : Express 5 et TypeScript, CRUD de tâches et endpoint `/health`.
- **Interface web** : application responsive intégrée à l’image
  `apppulse-frontend:1.0`, construite sur Nginx Alpine.
- **Base de données** : MySQL 8 avec volume Docker persistant.
- **Administration** : phpMyAdmin, accessible via `/phpmyadmin/`.
- **Reverse proxy** : Nginx route `/` vers le frontend, `/api/` et `/health`
  vers l’API, et `/phpmyadmin/` vers phpMyAdmin.
- **Pipeline** : l’interface affiche la dernière exécution GitHub Actions `CI`
  et le détail des étapes du job.
- **CI** : vérifications automatiques sur les push et pull requests vers `main`.
- **Déploiement VPS** : workflow manuel, à configurer lorsque le VPS sera prêt.

MySQL n’est pas publié sur une interface réseau publique. Son port local est
lié à `127.0.0.1`. Les services communiquent via des réseaux Docker dédiés.

## Prérequis

- Docker Engine et Docker Compose v2.
- Node.js 22+ et npm pour exécuter l’API hors conteneur.
- Git.

## Lancement avec Docker

1. Copier `.env.example` vers `.env` et remplacer les mots de passe :

   ```bash
   cp .env.example .env
   ```

2. Démarrer les services :

   ```bash
   docker compose up -d --build
   ```

3. Ouvrir l’interface ou vérifier l’API :

   ```bash
   curl http://localhost:8080/health
   ```

4. Consulter l’application :

   - Interface : `http://localhost:8080/`
   - API : `http://localhost:8080/api/tasks`
   - phpMyAdmin : `http://localhost:8080/phpmyadmin/`

Dans l’interface, tu peux créer, modifier, terminer et supprimer des tâches.
Si `HTTP_PORT` est différent dans `.env`, remplace `8080` par ce port.
Le panneau du pipeline lit le dépôt défini par `GITHUB_REPOSITORY` (par défaut
`ibrahimjlidi/apppulse`). Pour un dépôt privé, renseigne `GITHUB_TOKEN` dans
`.env` avec un token en lecture seule sur les Actions. Le token reste côté API
et n’est jamais envoyé au navigateur. Après une modification de `.env`, recrée
l’API avec `docker compose up -d --force-recreate api`.

Les données MySQL sont conservées dans le volume `mysql-data`. Pour arrêter les
conteneurs sans supprimer les données :

```bash
docker compose down
```

La suppression du volume efface définitivement les données :

```bash
docker compose down -v
```

## Développement local de l’API

Démarrer MySQL seul, puis lancer l’API sur la machine :

```bash
cp .env.example .env
docker compose up -d mysql
npm install
npm run dev
```

L’API écoute sur `http://localhost:3000`. Son `.env` doit utiliser
`DB_HOST=localhost` et `DB_PORT=3307`, comme dans l’exemple.

Autres commandes :

```bash
npm run typecheck
npm run build
npm start
```

## Tests automatisés

Le test d’intégration vérifie `/health`, la validation des entrées et le cycle
CRUD des tâches. Il cible par défaut `http://localhost:8081` et supprime la
tâche temporaire créée pendant le test.

Avec la stack Docker démarrée :

```bash
npm run test:integration
```

Le workflow GitHub Actions `CI` exécute le type-check, la compilation et le test
d’intégration sur les push et pull requests vers `main`. Il démarre une stack
éphémère sur le runner GitHub, puis la supprime. Ce workflow valide le projet,
mais ne déploie pas sur un VPS.

## API

| Méthode | Route | Description |
| --- | --- | --- |
| `GET` | `/health` | Vérifie l’API et la connexion MySQL |
| `GET` | `/api/pipeline` | Dernier workflow CI et statut de ses étapes |
| `GET` | `/api/tasks` | Liste les tâches |
| `GET` | `/api/tasks/:id` | Récupère une tâche |
| `POST` | `/api/tasks` | Crée une tâche |
| `PATCH` | `/api/tasks/:id` | Modifie une tâche |
| `DELETE` | `/api/tasks/:id` | Supprime une tâche |

Exemple de création :

```json
{
  "title": "Surveiller l'API",
  "description": "Ajouter un indicateur de disponibilité",
  "completed": false
}
```

## Déploiement sur un VPS

1. Installer Docker Engine et le plugin Docker Compose sur le VPS.
2. Cloner le dépôt sur le VPS. Le dossier doit contenir le projet et être
   accessible à l’utilisateur SSH.
3. Créer sur le VPS un fichier `.env` à partir de `.env.example`. Choisir des
   mots de passe longs et uniques et définir `PMA_ABSOLUTE_URI` avec l’URL
   publique correspondante.
4. Vérifier manuellement que `docker compose up -d --build` fonctionne dans ce
   dossier.
5. Dans GitHub, ajouter les secrets de dépôt suivants :
   - `VPS_HOST` : adresse IP ou nom DNS du VPS.
   - `VPS_USER` : utilisateur SSH de déploiement.
   - `VPS_APP_DIR` : chemin absolu du dépôt sur le VPS.
   - `VPS_SSH_PRIVATE_KEY` : clé privée SSH dédiée au déploiement.
   - `VPS_KNOWN_HOSTS` : clé d’hôte SSH du VPS vérifiée à l’avance.
6. Ajouter la clé publique correspondante dans `authorized_keys` de
   l’utilisateur de déploiement.

Le workflow de déploiement est manuel (`workflow_dispatch`) et n’est pas lancé
par les push sur `main`. Lorsqu’il sera volontairement exécuté, il mettra à
jour le dépôt avec `git pull --ff-only origin main` et lancera
`docker compose up -d --build`. L’accès Git du VPS au dépôt doit aussi être
configuré. Pour l’instant, le workflow CI valide le projet sans accéder à un
VPS.

## Sécurité en production

La configuration Nginx fournie écoute en HTTP sur le port 80. Avant une
exposition publique, configurer HTTPS avec un certificat TLS, soit dans Nginx,
soit via un reverse proxy TLS placé devant lui. Ne pas considérer les en-têtes
HTTP seuls comme un remplacement de TLS.

phpMyAdmin est accessible par `/phpmyadmin/` : restreindre cette route par
VPN, filtrage IP ou autre contrôle d’accès avant de l’exposer à Internet.
Ne pas réutiliser les mots de passe d’exemple et ne pas publier le fichier
`.env`.
