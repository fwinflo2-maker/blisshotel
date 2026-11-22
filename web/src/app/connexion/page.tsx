import LoginForm from "./login-form";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Connexion | Bliss Hôtel",
  description: "Accédez à votre espace de gestion Bliss Hôtel.",
};

export default function LoginPage() {
  return <LoginForm />;
}
