"use client";

import { useEffect } from "react";

/**
 * Révèle progressivement les blocs marqués `data-reveal` lorsqu'ils entrent
 * dans la fenêtre. Aucun bloc déjà visible n'est masqué (pas de scintillement)
 * et la préférence système « réduire les animations » est respectée.
 */
export default function ScrollReveal() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const targets = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (targets.length === 0 || !("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("lp-in");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.1 },
    );

    for (const target of targets) {
      if (target.getBoundingClientRect().top > window.innerHeight * 0.94) {
        target.classList.add("lp-out");
        observer.observe(target);
      }
    }

    return () => observer.disconnect();
  }, []);

  return null;
}
