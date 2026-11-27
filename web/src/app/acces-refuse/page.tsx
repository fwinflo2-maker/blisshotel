import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { LogoutButton } from "@/components/logout-button";

export default function AccessDeniedPage() {
  return (
    <main className="status-page">
      <div className="status-card"><ShieldAlert size={28} /><p>Erreur 403</p><h1>Accès refusé</h1><span>Votre profil ne dispose pas des droits nécessaires pour cette page ou cette opération.</span><Link href="/tableau-de-bord">Revenir au tableau de bord</Link><LogoutButton className="status-logout" /></div>
    </main>
  );
}
