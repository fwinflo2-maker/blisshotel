import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import NavigationLoader from "@/components/navigation-loader";
import "@/components/navigation-loader.css";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Bliss Hotel",
  description: "Application de gestion hôtelière Bliss Hotel",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${manrope.variable} h-full`}>
      <body className="min-h-full">
        {children}
        <NavigationLoader />
      </body>
    </html>
  );
}
