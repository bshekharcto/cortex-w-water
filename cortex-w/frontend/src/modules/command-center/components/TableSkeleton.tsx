interface Props {
  rows?: number;
  /** What is loading, read out to screen readers. */
  label: string;
}

/** Placeholder rows shown inside a table body while its data loads (instead of a bare "Loading…" line). */
export function TableSkeleton({ rows = 6, label }: Props) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <tr key={i} className="cc-skeleton-row" aria-hidden={i > 0}>
          <td colSpan={99}>
            <span className="cc-skeleton-box" />
            {i === 0 && <span className="cc-sr-only">{label}</span>}
          </td>
        </tr>
      ))}
    </>
  );
}
