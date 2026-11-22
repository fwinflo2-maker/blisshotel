"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const MIN_VISIBLE_MS = 550;
const NAVIGATION_TIMEOUT_MS = 15000;

export default function NavigationLoader() {
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);
  const navigationPending = useRef(false);
  const startedAt = useRef(0);
  const timeout = useRef<number | null>(null);
  const previousPathname = useRef(pathname);

  const finishNavigation = useCallback(() => {
    navigationPending.current = false;
    startedAt.current = 0;
    timeout.current = null;
    setLoading(false);
  }, []);

  useEffect(() => {
    function startNavigation() {
      if (timeout.current) window.clearTimeout(timeout.current);
      navigationPending.current = true;
      startedAt.current = performance.now();
      setLoading(true);
      timeout.current = window.setTimeout(finishNavigation, NAVIGATION_TIMEOUT_MS);
    }

    function handleClick(event: MouseEvent) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (!(event.target instanceof Element)) return;

      const link = event.target.closest("a");
      if (!link || (link.target && link.target !== "_self") || link.hasAttribute("download")) return;

      const destination = new URL(link.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.pathname === window.location.pathname) return;

      startNavigation();
    }

    document.addEventListener("click", handleClick, true);
    window.addEventListener("popstate", startNavigation);
    return () => {
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("popstate", startNavigation);
      if (timeout.current) window.clearTimeout(timeout.current);
    };
  }, [finishNavigation]);

  useEffect(() => {
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;

    if (!navigationPending.current) {
      navigationPending.current = true;
      startedAt.current = performance.now();
      setLoading(true);
    }
    if (timeout.current) window.clearTimeout(timeout.current);
    const elapsed = performance.now() - startedAt.current;
    timeout.current = window.setTimeout(finishNavigation, Math.max(0, MIN_VISIBLE_MS - elapsed));
  }, [pathname, finishNavigation]);

  if (!loading) return null;

  return (
    <div className="route-loading-overlay" role="status" aria-live="polite">
      <div className="route-loading-card">
        <span className="route-loading-rings" aria-hidden="true" />
        <span>Chargement de la page…</span>
      </div>
    </div>
  );
}
