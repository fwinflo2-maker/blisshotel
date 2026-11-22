import styles from './cockpit-charts.module.css';

export type CockpitSegment = { label: string; value: number; color: string };

export function CockpitDonut({ segments, total, centerValue, centerLabel, onSelect }: {
  segments: CockpitSegment[];
  total: number;
  centerValue: string;
  centerLabel: string;
  onSelect?: (label: string) => void;
}) {
  const radius = 43;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return <div className={styles.donutLayout}>
    <svg className={styles.donut} viewBox="0 0 120 120" role="img" aria-label={`${centerLabel} : ${centerValue}`}>
      <circle className={styles.track} cx="60" cy="60" r={radius} />
      {total > 0 && segments.filter((segment) => segment.value > 0).map((segment, index) => {
        const length = (segment.value / total) * circumference;
        const currentOffset = offset;
        offset += length;
        return <circle key={segment.label} className={styles.segment} cx="60" cy="60" r={radius} stroke={segment.color} strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-currentOffset} style={{ animationDelay: `${index * 90}ms` }}><title>{segment.label} · {segment.value}</title></circle>;
      })}
      <text className={styles.centerValue} x="60" y="57">{centerValue}</text>
      <text className={styles.centerLabel} x="60" y="72">{centerLabel}</text>
    </svg>
    <div className={styles.legend}>
      {segments.map((segment) => <button key={segment.label} type="button" className={styles.legendButton} onClick={() => onSelect?.(segment.label)} disabled={!onSelect}>
        <i className={styles.legendSwatch} style={{ backgroundColor: segment.color }} />
        <span>{segment.label}</span><strong>{segment.value}</strong>
      </button>)}
    </div>
  </div>;
}

export function CockpitBars({ rows, maxValue, formatValue = (value) => new Intl.NumberFormat('fr-FR').format(value) }: { rows: { label: string; value: number; color: string }[]; maxValue?: number; formatValue?: (value: number) => string }) {
  const max = Math.max(1, maxValue ?? 0, ...rows.map((row) => row.value));
  return <div className={styles.barChart}>
    {rows.map((row, index) => <div className={styles.barRow} key={row.label}>
      <span>{row.label}</span><div className={styles.barTrack}><i className={styles.barFill} style={{ width: `${(row.value / max) * 100}%`, backgroundColor: row.color, animationDelay: `${index * 80}ms` }} /></div><strong>{formatValue(row.value)}</strong>
    </div>)}
  </div>;
}
