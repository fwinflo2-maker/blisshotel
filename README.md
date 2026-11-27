<div align="center">

# BLISS HÔTEL

### L’exploitation hôtelière, réunie dans un seul espace.

Une application web pour coordonner les réservations, les séjours, la réception, la caisse, les chambres et le suivi de l’établissement — avec des accès distincts selon les responsabilités.

**Next.js · React · TypeScript · MariaDB · Prisma**

[Présentation](#les-espaces) · [Démarrage](#démarrer-en-local) · [Sécurité](#sécurité-et-données) · [Documentation détaillée](web/README.md)

</div>

---

## En bref

BLISS HÔTEL est une application de gestion destinée à l’établissement BLISS HOTEL. Elle regroupe les opérations quotidiennes dans des espaces dédiés aux équipes, à la direction, au propriétaire et à l’administration de la plateforme.

- **Un seul hôtel**, une base opérationnelle partagée et des données métier réelles.
- **Des espaces adaptés aux rôles**, avec des contrôles d’accès appliqués côté serveur.
- **Une activité traçable** : les opérations sensibles sont journalisées.
- **Pas de chiffres inventés** : les indicateurs dépendent des données réellement enregistrées.

## Les espaces

| Espace | Chemin | À quoi il sert |
| --- | --- | --- |
| Réception | `/reception` | Réservations, séjours, clients, factures, paiements, caisse et rapports de service. |
| Direction | `/direction` | Vue opérationnelle et financière de l’établissement. |
| Comptabilité | `/comptabilite` | Consultation des factures, encaissements, soldes ouverts et clôtures disponibles. |
| Housekeeping | `/housekeeping` | Tâches, chambres et inspections de l’équipe d’entretien. |
| Propriétaire | `/proprietaire` | Vue synthétique de l’activité et outils de gestion hôtelière autorisés. |
| Super Administrateur | `/super-admin` | Gestion des comptes, des rôles, des sessions, de la configuration, de l’inventaire et de l’audit plateforme. |
| Administrateur Hôtel | `/admin-hotel` | Consultation des rapports de fin de service autorisés. |

Les fonctionnalités visibles dépendent du compte connecté et de ses permissions. Les routes ne constituent pas un mécanisme de sécurité à elles seules : les vérifications d’autorisation sont également effectuées côté serveur.

## Démarrer en local

### Prérequis

- Node.js LTS et npm
- MariaDB — XAMPP peut être utilisé en développement local
- Un compte MariaDB dédié à l’application (**ne pas utiliser `root` pour l’application**)

### 1. Préparer la base et l’environnement

Depuis la racine du dépôt :

```powershell
cd web
Copy-Item .env.example .env.local
```

Créez la base `bliss_hotel` en `utf8mb4`, puis renseignez `.env.local` avec les identifiants MariaDB locaux et un secret de session aléatoire d’au moins 32 caractères :

```dotenv
DATABASE_URL="mysql://bliss_app:mot_de_passe@127.0.0.1:3306/bliss_hotel"
SESSION_SECRET="remplacer-par-un-secret-aleatoire-d-au-moins-32-caracteres"
```

Ne commitez jamais `.env.local` et ne partagez pas les secrets. `PROPERTY_ID` est présent dans le modèle `.env.example` ; il est optionnel pour la configuration de base mono-hôtel.

### 2. Installer et initialiser

```powershell
npm install
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

Le seed initialise le catalogue des rôles, des permissions et la configuration de l’hôtel. Il ne crée ni compte utilisateur ni données métier de démonstration. **Faites une sauvegarde avant toute migration d’une base qui contient déjà des données.** Les migrations mono-hôtel s’interrompent si elles détectent des établissements ou organisations supplémentaires.

### 3. Créer le premier Super Administrateur

```powershell
npm run admin:create
```

Suivez les instructions du terminal. Le mot de passe est saisi sans être affiché. Cette commande crée le compte de bootstrap uniquement si aucun Super Administrateur n’existe.

### 4. Lancer l’application

```powershell
npm run dev
```

Ouvrez [http://127.0.0.1:3000](http://127.0.0.1:3000).

> Pour les migrations, le bootstrap et les tests métier, consultez le [guide complet de l’application](web/README.md).

## Sécurité et données

- Sessions conservées côté serveur et cookie HTTP-only ; mots de passe hachés avec bcrypt.
- Tentatives de connexion limitées et événements de sécurité journalisés.
- Les accès Super Administrateur sont séparés des autorisations de gestion hôtelière. Un rôle hôtelier ne peut pas s’attribuer les droits plateforme par une requête client.
- Les données du cockpit propriétaire proviennent de l’application. Les factures, encaissements et dépenses sont distingués ; les commandes du restaurant ne sont pas additionnées aux folios.
- Le résultat financier affiché est indicatif, **pas un bénéfice net certifié**. Les dépenses disponibles sont celles déclarées dans les rapports de clôture ; aucune trésorerie bancaire fictive n’est calculée.
- Le God Mode est une consultation de profil en lecture seule : il ne récupère pas les identifiants d’un autre utilisateur et n’ouvre pas de session en son nom.

### Capacités non configurées

Les sauvegardes et leur restauration, l’authentification multifacteur (MFA), le monitoring externe des erreurs, les métriques de stockage et les tâches planifiées ne sont pas configurés. Le rapprochement bancaire et le registre général des dépenses ne sont pas disponibles comme grands livres complets. L’application est mono-hôtel.

## Vérifications

Depuis `web/` :

```powershell
npm run lint
npm run typecheck
npm run test
npm run build
```

Les scénarios end-to-end de réception nécessitent une base de test dédiée ; leur procédure est décrite dans [`web/README.md`](web/README.md#vérifications).

## Structure du dépôt

```text
.
├── README.md          # Présentation et démarrage rapide
└── web/
    ├── src/app/       # Pages, espaces et routes API
    ├── src/components/# Composants partagés
    ├── src/features/  # Fonctionnalités métier et accès
    ├── src/server/    # Authentification, données et politiques d’accès
    └── prisma/        # Schéma, migrations et seed
```

## Documentation

- [Guide complet de l’application](web/README.md) — installation, espaces, parcours métier, sécurité et tests.
- [Règles de contribution pour le dossier web](web/AGENTS.md).
