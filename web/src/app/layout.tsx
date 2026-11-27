import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import NavigationLoader from "@/components/navigation-loader";
import ImpersonationBanner from "@/components/impersonation-banner";
import ChatWidget from "@/components/chat-widget";
import { currentSession } from "@/server/auth";
import "@/components/navigation-loader.css";
import "./globals.css";

export const instant = false;

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Bliss Hotel",
  description: "Application de gestion hôtelière Bliss Hotel",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const session = await currentSession();
  return (
    <html lang="fr" className={`${manrope.variable} h-full`}>
      <body className="min-h-full">
        <ImpersonationBanner />
        {children}
        {session && <ChatWidget />}
        <NavigationLoader />
      </body>
    </html>
  );
}
