export default function Loading() {
  return (
    <div className="route-loading-overlay" role="status" aria-live="polite">
      <div className="route-loading-card">
        <span className="route-loading-rings" aria-hidden="true" />
        <span>Chargement de votre espace…</span>
      </div>
    </div>
  );
}
