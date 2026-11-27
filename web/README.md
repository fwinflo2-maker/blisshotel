# BLISS HÔTEL — Application Web

Application Next.js App Router pour la gestion hôtelière.

## Prérequis

- Node.js LTS
- XAMPP avec MariaDB démarré
- npm

## Base de données locale

Créez la base `bliss_hotel` en `utf8mb4` et un utilisateur MariaDB dédié. Ne jamais utiliser `root` dans l'application.

Un exemple de fichier est disponible dans `.env.example`. Copiez-le vers `.env.local` puis remplacez les valeurs locales :

```text
DATABASE_URL="mysql://bliss_app:mot_de_passe@127.0.0.1:3306/bliss_hotel"
SESSION_SECRET="une-valeur-secrete-d-au-moins-32-caracteres"
```

La base est dédiée à l'établissement BLISS HOTEL. Les migrations vérifient les données existantes et s'arrêtent si elles détectent d'autres établissements ou organisations. Faites une sauvegarde avant toute migration d'une base existante. Initialisez la base et le catalogue RBAC avec :

```powershell
npm install
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

Le seed crée les rôles, permissions et la configuration unique BLISS HOTEL sans ajouter d'utilisateur ni de données métier fictifs.

Après l'initialisation, créez explicitement le premier compte de plateforme depuis le terminal intégré :

```powershell
npm run admin:create
```

Le mot de passe est saisi sans être affiché. Cette commande ne crée qu'un seul compte de bootstrap et refuse de s'exécuter lorsqu'un compte Super Administrateur existe déjà.

## Démarrage

```powershell
npm run dev
```

L'application est disponible sur `http://127.0.0.1:3000`.

## Profils livrés

- `/` : page d'accueil publique.
- `/super-admin` : console de plateforme indépendante réservée au compte Super Administrateur. Elle couvre les comptes et sessions, les rôles/permissions, la configuration hôtelière, l’inventaire, l’audit et les indicateurs de supervision disponibles.
- `/proprietaire` : espace propriétaire distinct, avec vue de synthèse issue des données réelles de BLISS HOTEL et accès aux outils de gestion hôtelière autorisés.
- `/admin-hotel` : consultation des rapports de fin de service pour l'Administrateur Hôtel.
- `/reception` : espace opérationnel unifié du Réceptionniste.
- `/housekeeping` : supervision des tâches et inspections par la Gouvernante ; exécution des tâches par les Agents d’entretien.
- `/direction` : tableau de bord du Directeur Général avec occupation, arrivées/départs, suivi Housekeeping, factures, encaissements, soldes ouverts et clôtures.
- `/comptabilite` : tableau de bord Comptable en lecture seule, avec consultation filtrable des factures, encaissements, soldes ouverts, clôtures de caisse et dépenses signalées dans les rapports de service. Le rapprochement bancaire reste à configurer.
- `/super-admin`, `/proprietaire` et `/direction` : God Mode de consultation des profils, avec contrôle d’accès par rôle et journalisation des consultations.

La Gouvernante peut créer des comptes individuels d’Agents d’entretien et leur affecter des tâches de nettoyage, de préparation du lit ou de rangement. Un agent démarre sa tâche puis la marque terminée ; la chambre reste indisponible pendant toute tâche ouverte et ne redevient attribuable qu’une fois terminée, si elle n’est ni occupée ni en maintenance. Cette indisponibilité est contrôlée côté serveur pour toutes les opérations de Réception. L’Administrateur Hôtel, le Propriétaire et le Super Administrateur peuvent également créer des comptes d’Agents d’entretien.
Les espaces Réception, Housekeeping et Super Administrateur proposent un choix de thème clair ou sombre ; la préférence est mémorisée dans le navigateur.

L'espace Réception couvre la vue d'ensemble (avec filtre jour/semaine/mois sur les statistiques personnelles et distinction claire personnel/global), les réservations (filtres en attente / confirmées / à venir / en séjour / passées, identité du créateur et historique par réservation), la réception et les séjours (arrivées du jour, clients hébergés, départs, changement de chambre, prolongation, occupants), les clients (fiches complètes : nationalité, adresse, type et numéro de pièce d'identité, scan ou photo de la pièce (JPEG, PNG, WebP ou PDF, 5 Mo max, conservé en base et servi uniquement aux comptes autorisés, avec le nom du réceptionniste qui l'a déposé), notes ; modification sans jamais écraser « Client enregistré par : … »), les factures (liste filtrable payées / partielles / impayées / facturées, émission, reçu imprimable/PDF), le planning chambres (états housekeeping visibles), la caisse personnelle (ouverture, transactions détaillées, clôture avec écart conservé), les rapports de service (Jour 08 h–18 h et Nuit 18 h–08 h, clôture liée à la caisse, dépenses et consignes de relève), l'historique des opérations (les siennes et celles de l'équipe, en lecture seule), les notifications et le profil (permissions, changement de mot de passe révoquant les sessions). Les mutations sont protégées par les permissions utilisateur, les conflits de chambre sont vérifiés en transaction côté serveur, les encaissements sont idempotents et les actions financières/opérationnelles sont auditées. Plusieurs réceptionnistes travaillent simultanément sur les mêmes données partagées.

Pour les nuitées, l’arrivée n’a pas d’heure conventionnelle imposée ; l’heure de départ est fixée à 12 h par défaut. La disponibilité d’une chambre est calculée à partir de cette heure pour éviter les chevauchements le jour d’un départ.

Une facture doit être créée depuis le folio avant son impression. Le Réceptionniste peut préciser le nom du payeur, qui peut différer du client hébergé ; celui-ci est proposé par défaut. La facture affiche le payeur, le client hébergé, la date et l'heure d'émission, le ou les modes utilisés et les montants facturé/encaissé/restant dû. Les moyens Espèces, Airtel Money et MTN Money sont activés par défaut. Le bouton « Imprimer la facture » ouvre l'aperçu du rouleau thermique 80 mm puis la boîte d'impression du navigateur ; l'imprimante thermique doit être installée et configurée dans Windows. L'impression n'est pas lancée automatiquement.

La devise configurée par le Propriétaire ou le Super Administrateur est la devise de saisie par défaut. Les montants comptables, les tableaux de bord et les nouvelles factures sont conservés et affichés en XAF ; les données historiques ne sont pas reconverties. Les saisies EUR sont converties au taux fixe de 655,957 XAF pour 1 EUR. Les saisies USD utilisent un taux en ligne actualisé quotidiennement et conservé en cache ; les nouvelles saisies USD sont refusées si aucun taux exploitable de moins de 36 heures n'est disponible. Les tarifs du restaurant restent saisis en XAF. Les moyens MTN Money, Airtel Money et Cash sont activés par défaut.

La clôture d'une caisse enregistre aussi un rapport de fin de service, lié à la session et horodaté dans le fuseau de l'hôtel. Il contient les opérations, paiements, soldes de caisse, dépenses, état des chambres, incidents et consignes. Les dépenses en espèces diminuent le théorique et les dépenses de service sont reprises dans le tableau comptable. Le Réceptionniste ne consulte que ses rapports ; l'Administrateur Hôtel, le Propriétaire et le Super Administrateur peuvent consulter tous les rapports et les exporter en PDF via la boîte d'impression du navigateur (« Enregistrer au format PDF »). Les PDF sont conçus en format A4 ; aucun fichier PDF n'est stocké automatiquement.

La migration `20261118214356_reception_workflows` ajoute les modèles opérationnels ; `20261118230000_single_hotel` conserve uniquement la configuration et les données de BLISS HOTEL, et interrompt la migration si d'autres établissements ou organisations sont détectés ; `20261119004102_reception_profile_completion` ajoute les champs d'identité des clients (nationalité, adresse, pièce d'identité, notes), la photo du nom du créateur (`createdByName` sur clients et réservations), la relation `Reservation.createdBy → User` et l'index d'audit par opérateur ; `20261119110000_reception_shift_reports` ajoute les rapports, les dépenses de service et la permission de consultation ; `20261119130000_invoice_payer_and_mobile_money` ajoute le nom du payeur sur la facture et active Airtel Money et MTN Money ; `20261119140000_client_id_document` ajoute le scan de la pièce d'identité aux fiches clients ; `20261124210000_invoice_currency_snapshot` fige la devise des factures en XAF ; `20261124215000_currency_conversion_and_payment_methods` ajoute le cache du taux USD/XAF, conserve l'origine des montants de réservation/paiement pour l'idempotence et garantit les moyens MTN Money, Airtel Money et Cash. Les catégories/chambres et moyens de paiement se configurent désormais dans la console Super Administrateur (section Inventaire hôtel), qui permet aussi de créer, modifier, activer et désactiver les comptes individuels des réceptionnistes. Aucune donnée de démonstration n'est créée. Le départ avec solde est bloqué par défaut (`allowCheckoutWithBalance = false`) et cette règle est modifiable dans la configuration Super Administrateur.

Les rôles Directeur Général, Comptable, Housekeeping, Agents d’entretien, Réception, Propriétaire et Super Administrateur disposent d’espaces propres. Plusieurs Comptables peuvent disposer de comptes individuels distincts, créés par le Super Administrateur ou le Propriétaire.

Les espaces Propriétaire et Super Administrateur comprennent un journal en lecture seule des annulations effectuées par les comptes Réceptionniste ; une annulation conserve la réservation et n'est pas une suppression définitive.

### Espace propriétaire

La page `/proprietaire` affiche un cockpit calculé à partir des réservations, folios/factures, encaissements, clôtures de caisse, commandes du restaurant, chambres, comptes du personnel et événements d’audit existants. Les factures ne sont pas assimilées à des paiements reçus ; les commandes du restaurant sont affichées séparément des folios afin d’éviter leur double comptage. Le résultat présenté est indicatif et ne constitue pas un bénéfice net certifié. Les dépenses actuellement disponibles proviennent des rapports de clôture ; aucun solde bancaire ou de caisse fictif n’est calculé.

Le compte propriétaire peut gérer les données hôtelières prévues (utilisateurs hôteliers, rôles hôteliers, inventaire et configuration) via des routes protégées côté serveur. La liste de rôles visible au propriétaire exclut les rôles Propriétaire et Super Administrateur. Les outils de plateforme — diagnostics globaux, audit de plateforme, gestion des sessions et fonctionnalités globales — restent réservés au Super Administrateur.

### Console Super Administrateur

La console `/super-admin` est distincte de l’espace propriétaire. L’API `platformApi` exige un compte portant le statut `platformAdmin` ; un rôle hôtelier ne peut pas obtenir ces droits en envoyant une requête client. Les endpoints de gestion hôtelière partagés utilisent un contrôle séparé et ne donnent pas accès aux fonctions globales de plateforme.

La console comprend les indicateurs globaux issus de MariaDB, les comptes et filtres par rôle/statut, les sessions actives (jusqu’à 500 affichées), les rôles/permissions, la configuration de BLISS HOTEL, l’inventaire, les fonctionnalités activables, le journal d’audit et les événements d’échec d’authentification. La révocation de sessions de comptes hôteliers est journalisée ; cette action refuse les comptes Super Administrateur. Le Super Administrateur conserve le contrôle technique de l'application sans gérer plusieurs hôtels.

Les indicateurs de service sont limités aux données exposées par l’application. Les sauvegardes/restaurations, le MFA, le monitoring externe des erreurs, les métriques de stockage et les tâches planifiées ne sont pas configurés et ne sont pas présentés comme opérationnels. BLISS HOTEL fonctionne en mono-hôtel.

Les demandes de réinitialisation créent un lien à usage unique, valable 30 minutes. Le lien est affiché une seule fois à l'administrateur et doit être remis à l'utilisateur par un canal de confiance. La modification du mot de passe invalide les sessions existantes. Aucun fournisseur d'e-mail externe n'est appelé automatiquement.

## Vérifications

```powershell
npm run lint
npm run typecheck
npm run test
npm run build
```

Les scénarios métier réels du poste réceptionniste (double compte, traçabilité des créateurs, conflits de chambre, idempotence des paiements, clôture de caisse, désactivation de compte) s'exécutent sur une base de test dédiée via `scripts/e2e-reception.ts` :

```powershell
# 1) Base de test
mysql -u root -e "CREATE DATABASE bliss_hotel_e2e CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
$env:DATABASE_URL="mysql://bliss_app:...@127.0.0.1:3306/bliss_hotel_e2e"
npm run prisma:migrate -- --deploy   # ou : npx prisma migrate deploy
npm run prisma:seed
# 2) Serveur de production sur la base de test
npx next start -p 3100
# 3) Scénarios (autre terminal, même DATABASE_URL)
npm run test:e2e
```

## Architecture

- `src/app` : routes, layouts et API Route Handlers
- `src/components` : composants d'interface réutilisables
- `src/features/access` : catalogue des rôles et permissions
- `src/server` : base de données, sessions, politique d'autorisation
- `prisma` : schéma, migrations et seed RBAC

## Sécurité

- Authentification par cookie HTTP-only et sessions persistées
- Hachage des mots de passe avec bcrypt
- Limitation des tentatives de connexion
- Permissions vérifiées côté serveur
- Le God Mode affiche les métadonnées et permissions d’un profil en lecture seule ; il ne récupère aucun identifiant, n’ouvre pas de session au nom du profil et ne permet pas d’exécuter ses actions. Le Propriétaire ne voit pas les profils Super Administrateur ; le Directeur Général ne voit ni les profils Super Administrateur ni les profils Propriétaire.
- Une seule configuration hôtelière et une seule base de données opérationnelle pour BLISS HOTEL
- Journal d'audit pour les connexions et actions sensibles
- Séparation serveur entre les endpoints de plateforme Super Administrateur et les endpoints de gestion hôtelière Propriétaire/Super Administrateur
- Révocation des sessions actives des comptes hôteliers par le Super Administrateur, avec événement d'audit ; les sessions d’un compte Super Administrateur ne sont pas révocables depuis cette action
