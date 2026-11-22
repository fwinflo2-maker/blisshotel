import Link from "next/link";
import {
  ArrowRight,
  BedDouble,
  Building2,
  CalendarDays,
  ChartNoAxesColumn,
  Check,
  CheckCircle2,
  ConciergeBell,
  Fingerprint,
  Hotel,
  Laptop,
  LockKeyhole,
  MonitorSmartphone,
  ScrollText,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Wallet,
  Wrench,
  X,
} from "lucide-react";
import ScrollReveal from "@/components/scroll-reveal";
import "./landing.css";

const modules = [
  {
    icon: CalendarDays,
    title: "Réservations & planning",
    text: "Disponibilités, tarifs et disponibilité des chambres vérifiés avant chaque confirmation. Aucun conflit, aucune double attribution.",
  },
  {
    icon: ConciergeBell,
    title: "Réception & séjours",
    text: "Arrivées, départs, check-in et check-out. La chambre, le séjour et la note progressent ensemble, sans ressaisie.",
  },
  {
    icon: Wallet,
    title: "Facturation & caisse",
    text: "Avances, paiements partiels, reçus et clôtures de caisse. Chaque mouvement reste rattaché à sa pièce et à son auteur.",
  },
  {
    icon: BedDouble,
    title: "Service d’entretien",
    text: "Tâches affectées aux Agents d’entretien, états des chambres suivis en temps réel et inspections par la Gouvernante.",
  },
  {
    icon: Wrench,
    title: "Maintenance",
    text: "Incidents déclarés depuis une chambre, priorités, affectations et interventions suivies jusqu'à la remise en service.",
  },
  {
    icon: ChartNoAxesColumn,
    title: "Rapports & analyses",
    text: "Occupation, revenus et écarts de caisse, toujours présentés avec leur période, leur devise et leur périmètre.",
  },
];

const experiences = [
  {
    icon: Laptop,
    tag: "Web",
    title: "Pilotage & administration",
    text: "Toute la direction de l'hôtel dans le navigateur, pour les postes d'administration et de comptabilité.",
    points: ["Planning hôtelier complet", "Rapports et exports", "Personnel et permissions"],
  },
  {
    icon: MonitorSmartphone,
    tag: "Desktop",
    title: "Poste de réception",
    text: "Une application de bureau pensée pour le comptoir : rapide au clavier, fiable à l'impression.",
    points: ["Arrivées et départs", "Encaissement et reçus", "État des chambres"],
  },
  {
    icon: Smartphone,
    tag: "Mobile",
    title: "Équipes en mouvement",
    text: "Les tâches terrain à portée de pouce, conçues pour le téléphone et non réduites depuis le Web.",
    points: ["Tâches de ménage", "Incidents de maintenance", "Notifications"],
  },
];

const roles = [
  "Super Administrateur",
  "Propriétaire",
  "Directeur Général",
  "Administrateur Hôtel",
  "Réceptionniste",
  "Comptable",
  "Gouvernante",
  "Agent d'entretien",
  "Responsable Restaurant & Bar",
  "Responsable Maintenance",
];

const security = [
  {
    icon: ShieldCheck,
    title: "Permissions côté serveur",
    text: "Chaque action sensible est vérifiée avant exécution. Masquer un bouton n'a jamais suffi.",
  },
  {
    icon: Building2,
    title: "Isolation par établissement",
    text: "Les données restent rattachées à leur hôtel et au périmètre exact de l'utilisateur connecté.",
  },
  {
    icon: ScrollText,
    title: "Journal d'audit",
    text: "Connexions, remboursements, clôtures et changements de rôle laissent une trace consultable.",
  },
  {
    icon: LockKeyhole,
    title: "Sessions protégées",
    text: "Cookies HTTP-only, mots de passe hachés et secrets tenus hors du dépôt de code.",
  },
];

type PlanSegment = { from: number; to: number; state: "available" | "occupied" | "cleaning" };

const planRows: PlanSegment[][] = [
  [
    { from: 1, to: 4, state: "occupied" },
    { from: 4, to: 5, state: "cleaning" },
    { from: 5, to: 8, state: "available" },
  ],
  [
    { from: 1, to: 2, state: "available" },
    { from: 2, to: 6, state: "occupied" },
    { from: 6, to: 7, state: "cleaning" },
    { from: 7, to: 8, state: "available" },
  ],
  [
    { from: 1, to: 3, state: "occupied" },
    { from: 3, to: 5, state: "available" },
    { from: 5, to: 8, state: "occupied" },
  ],
  [
    { from: 1, to: 2, state: "cleaning" },
    { from: 2, to: 5, state: "occupied" },
    { from: 5, to: 6, state: "available" },
    { from: 6, to: 8, state: "occupied" },
  ],
  [
    { from: 1, to: 3, state: "available" },
    { from: 3, to: 7, state: "occupied" },
    { from: 7, to: 8, state: "cleaning" },
  ],
];

export default function Home() {
  return (
    <div className="lp">
      <ScrollReveal />

      <header className="lp-header">
        <Link className="lp-brand" href="/" aria-label="Bliss Hotel — accueil">
          <span className="lp-brand-mark">
            <Hotel size={18} strokeWidth={1.9} />
          </span>
          <span className="lp-brand-copy">
            <strong>BLISS HOTEL</strong>
            <span>Système de gestion hôtelière</span>
          </span>
        </Link>

        <nav className="lp-nav" aria-label="Navigation principale">
          <a href="#plateforme">Plateforme</a>
          <a href="#experiences">Expériences</a>
          <a href="#profils">Profils</a>
          <a href="#securite">Sécurité</a>
        </nav>

        <Link className="lp-header-cta" href="/connexion">
          Se connecter
          <ArrowRight size={15} />
        </Link>
      </header>

      <section className="lp-hero">
        <div className="lp-hero-particles" aria-hidden="true">
          {Array.from({ length: 14 }, (_, index) => <span key={index} />)}
        </div>
        <div className="lp-shell lp-hero-grid">
          <div className="lp-hero-copy">
            <p className="lp-eyebrow lp-rise lp-d1">
              <Sparkles size={13} strokeWidth={2} />
              Logiciel de gestion hôtelière
            </p>
            <h1 className="lp-rise lp-d2">
              Bliss Hotel —<br />
              <span className="lp-accent">une seule</span> plateforme.
            </h1>
            <p className="lp-hero-lede lp-rise lp-d3">
              Le logiciel de gestion du Bliss Hotel : réservations, réception, caisse et
              opérations. Une base de données unique, des équipes qui
              travaillent enfin sur les mêmes informations.
            </p>
            <div className="lp-hero-actions lp-rise lp-d4">
              <Link className="lp-btn lp-btn-light" href="/connexion">
                Se connecter
                <ArrowRight size={16} />
              </Link>
              <a className="lp-btn lp-btn-ghost" href="#plateforme">
                Découvrir le logiciel
              </a>
            </div>
            <ul className="lp-hero-meta lp-rise lp-d5">
              <li>Application web</li>
              <li>Application desktop</li>
              <li>Application mobile</li>
              <li>Base de données unique</li>
            </ul>
          </div>

          <div className="lp-hero-visual lp-rise lp-d3">
            <div className="lp-preview" aria-hidden="true">
              <div className="lp-window">
                <div className="lp-window-bar">
                  <div className="lp-window-brand">
                    <span className="lp-window-mark">
                      <Building2 size={13} strokeWidth={1.9} />
                    </span>
                    <span>BLISS HÔTEL</span>
                  </div>
                  <div className="lp-window-tabs">
                    <span className="active">Planning</span>
                    <span>Réception</span>
                    <span>Caisse</span>
                  </div>
                </div>

                <div className="lp-window-app">
                  <div className="lp-rail">
                    <span className="is-active">
                      <CalendarDays size={12} strokeWidth={1.9} />
                    </span>
                    <span>
                      <ConciergeBell size={12} strokeWidth={1.9} />
                    </span>
                    <span>
                      <Wallet size={12} strokeWidth={1.9} />
                    </span>
                    <span>
                      <BedDouble size={12} strokeWidth={1.9} />
                    </span>
                    <span>
                      <ChartNoAxesColumn size={12} strokeWidth={1.9} />
                    </span>
                  </div>

                  <div className="lp-window-body">
                    <div className="lp-window-title">
                      <div>
                        <span className="lp-window-kicker">Aperçu de l’interface — Bliss Hôtel</span>
                        <strong>Planning des chambres</strong>
                      </div>
                      <div className="lp-legend">
                        <span>
                          <i className="is-available" />
                          Disponible
                        </span>
                        <span>
                          <i className="is-occupied" />
                          Occupée
                        </span>
                        <span>
                          <i className="is-cleaning" />
                          À nettoyer
                        </span>
                      </div>
                    </div>

                    <div className="lp-plan">
                      <div className="lp-plan-days">
                        <span>L</span>
                        <span>M</span>
                        <span>M</span>
                        <span>J</span>
                        <span>V</span>
                        <span>S</span>
                        <span>D</span>
                      </div>
                      {planRows.map((row, rowIndex) => (
                        <div className="lp-plan-row" key={rowIndex}>
                          {row.map((segment, segmentIndex) => (
                            <i
                              key={segmentIndex}
                              className={`lp-bar is-${segment.state}`}
                              style={{ gridColumn: `${segment.from} / ${segment.to}` }}
                            />
                          ))}
                        </div>
                      ))}
                      <span className="lp-plan-today" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="lp-float">
                <span className="lp-float-icon">
                  <CheckCircle2 size={16} />
                </span>
                <div>
                  <strong>Chambre validée</strong>
                  <span>Prête à être relouée</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-pillars" aria-label="Modules du logiciel">
        <div className="lp-shell">
          <ul>
            <li>Réservations</li>
            <li>Réception</li>
            <li>Facturation</li>
            <li>Caisse</li>
            <li>Service d’entretien</li>
            <li>Maintenance</li>
            <li>Rapports</li>
          </ul>
        </div>
      </section>

      <section className="lp-section" id="plateforme">
        <div className="lp-shell">
          <div className="lp-section-head" data-reveal>
            <p className="lp-kicker">Le logiciel</p>
            <h2>Tout ce que gère un hôtel, dans un seul logiciel.</h2>
            <p className="lp-lede">
              Réserver, accueillir, encaisser, nettoyer, réparer : les modules du logiciel couvrent
              le quotidien de l’établissement et partagent les mêmes données, les mêmes règles métier
              et le même journal d’audit.
            </p>
          </div>

          <div className="lp-modules" data-reveal>
            {modules.map(({ icon: Icon, title, text }) => (
              <article className="lp-module" key={title}>
                <span className="lp-module-icon">
                  <Icon size={19} strokeWidth={1.8} />
                </span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>

          <div className="lp-compare" data-reveal>
            <div className="lp-compare-col is-before">
              <h3>Sans logiciel unifié</h3>
              <ul>
                <li>
                  <X size={14} strokeWidth={2} />
                  Un tableur par service
                </li>
                <li>
                  <X size={14} strokeWidth={2} />
                  Réservations notées sur papier
                </li>
                <li>
                  <X size={14} strokeWidth={2} />
                  Caisse réconciliée à la main
                </li>
                <li>
                  <X size={14} strokeWidth={2} />
                  Aucune trace des actions sensibles
                </li>
              </ul>
            </div>
            <div className="lp-compare-col is-after">
              <h3>Avec le logiciel</h3>
              <ul>
                <li>
                  <Check size={14} strokeWidth={2.2} />
                  Une base de données unique
                </li>
                <li>
                  <Check size={14} strokeWidth={2.2} />
                  Un planning partagé par les équipes
                </li>
                <li>
                  <Check size={14} strokeWidth={2.2} />
                  Clôtures et écarts traçables
                </li>
                <li>
                  <Check size={14} strokeWidth={2.2} />
                  Journal d’audit sur les actions sensibles
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-section lp-section-soft" id="experiences">
        <div className="lp-shell">
          <div className="lp-section-head" data-reveal>
            <p className="lp-kicker">Trois applications</p>
            <h2>Trois applications. Un seul logiciel.</h2>
            <p className="lp-lede">
              Le même logiciel s’installe sur le navigateur, sur le poste de réception et sur le
              mobile des équipes. Une réservation prise au comptoir apparaît sur le téléphone du
              housekeeping ; un encaissement remonte dans les rapports de la direction. Sans
              synchronisation à organiser, sans double saisie.
            </p>
          </div>

          <div className="lp-experiences" data-reveal>
            {experiences.map(({ icon: Icon, tag, title, text, points }) => (
              <article className="lp-experience" key={tag}>
                <div className="lp-experience-head">
                  <span className="lp-module-icon">
                    <Icon size={19} strokeWidth={1.8} />
                  </span>
                  <h3>{title}</h3>
                  <span className="lp-experience-tag">{tag}</span>
                </div>
                <p className="lp-experience-text">{text}</p>
                <ul>
                  {points.map((point) => (
                    <li key={point}>
                      <CheckCircle2 size={14} strokeWidth={2} />
                      {point}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-section" id="profils">
        <div className="lp-shell lp-roles">
          <div data-reveal>
            <p className="lp-kicker">Accès & responsabilités</p>
            <h2>Onze profils. Des permissions explicites.</h2>
            <p className="lp-lede">
              Du propriétaire à l’agent d’entretien, chaque utilisateur ne voit que son périmètre :
              son établissement, son service et les actions autorisées.
            </p>
            <p className="lp-lede">
              Le profil Réceptionniste réunit à lui seul l’accueil, les réservations et la caisse :
              un seul compte, une interface intégrée.
            </p>
            <p className="lp-roles-note">
              <Fingerprint size={16} strokeWidth={1.9} />
              Contrôle d’accès par rôle, ajustable sans toucher au code.
            </p>
          </div>

          <div className="lp-role-cloud" data-reveal>
            <div className="lp-role-lead">
              <span className="lp-role-lead-icon">
                <ConciergeBell size={17} strokeWidth={1.9} />
              </span>
              <div>
                <strong>Réceptionniste</strong>
                <span>Accueil & séjours · Réservations · Caisse</span>
              </div>
              <span className="lp-role-lead-tag">Rôles réunis</span>
            </div>

            <div className="lp-role-chips">
              {roles.map((role) => (
                <span className="lp-role" key={role}>
                  {role}
                </span>
              ))}
            </div>

            <p className="lp-role-foot">
              Le profil Réceptionniste regroupe la gestion des réservations, des séjours et de la
              caisse dans un seul compte individuel.
            </p>
          </div>
        </div>
      </section>

      <section className="lp-security" id="securite">
        <div className="lp-shell">
          <div className="lp-section-head" data-reveal>
            <p className="lp-kicker lp-kicker-light">Confiance</p>
            <h2>La sécurité se construit côté serveur.</h2>
            <p className="lp-lede lp-lede-light">
              Une donnée hôtelière est sensible par nature : identité des clients, montants,
              clôtures. Le logiciel applique les permissions à chaque requête, pas seulement à
              l’écran.
            </p>
          </div>

          <div className="lp-security-grid" data-reveal>
            {security.map(({ icon: Icon, title, text }) => (
              <article className="lp-security-item" key={title}>
                <Icon size={18} strokeWidth={1.8} />
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-section lp-cta">
        <div className="lp-shell">
          <div className="lp-cta-panel" data-reveal>
            <div>
              <p className="lp-kicker">Bliss Hotel</p>
              <h2>Votre logiciel de gestion.</h2>
              <p className="lp-lede">
                Accédez au Bliss Hotel et pilotez réservations, caisse et équipes depuis la
                même plateforme.
              </p>
            </div>
            <div className="lp-cta-actions">
              <Link className="lp-btn lp-btn-solid" href="/connexion">
                Se connecter
                <ArrowRight size={16} />
              </Link>
              <span className="lp-cta-note">
                <LockKeyhole size={13} strokeWidth={2} />
                Accès réservé aux équipes autorisées
              </span>
            </div>
          </div>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-shell lp-footer-inner">
          <div className="lp-brand">
            <span className="lp-brand-mark">
              <Hotel size={16} strokeWidth={1.9} />
            </span>
            <span className="lp-brand-copy">
              <strong>BLISS HOTEL</strong>
              <span>Système de gestion hôtelière</span>
            </span>
          </div>
          <p className="lp-footer-text">
            Réservations · Réception · Caisse · Service d’entretien — une seule source de vérité.
          </p>
          <div className="lp-footer-links">
            <Link href="/connexion">Connexion</Link>
            <span aria-hidden="true">·</span>
            <span>© 2026 Bliss Hotel</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
