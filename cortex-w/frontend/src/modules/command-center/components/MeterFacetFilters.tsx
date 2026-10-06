import { formatFrequency } from '../utils/format';

export interface MeterFacetState {
  dr: string; // '' = any
  frequency: string; // Hz as text, '' = any
  confirmed: string; // 'true' | 'false' | '' = any
}

interface Props {
  value: MeterFacetState;
  onChange: (next: MeterFacetState) => void;
  drOptions: number[];
  frequencyOptions: number[];
}

const selectStyle = { minWidth: 0, padding: '3px 6px', fontSize: 11.5 } as const;

/** DR / frequency / confirmed filters shared by the per-gateway and fleet Meters tables. */
export function MeterFacetFilters({ value, onChange, drOptions, frequencyOptions }: Props) {
  return (
    <>
      <select
        className="cc-fleet-search"
        style={selectStyle}
        aria-label="Filter by data rate"
        value={value.dr}
        onChange={(e) => onChange({ ...value, dr: e.target.value })}
      >
        <option value="">DR: any</option>
        {drOptions.map((d) => (
          <option key={d} value={String(d)}>
            DR{d}
          </option>
        ))}
      </select>
      <select
        className="cc-fleet-search"
        style={selectStyle}
        aria-label="Filter by frequency"
        value={value.frequency}
        onChange={(e) => onChange({ ...value, frequency: e.target.value })}
      >
        <option value="">Freq: any</option>
        {frequencyOptions.map((f) => (
          <option key={f} value={String(f)}>
            {formatFrequency(f)} MHz
          </option>
        ))}
      </select>
      <select
        className="cc-fleet-search"
        style={selectStyle}
        aria-label="Filter by confirmed uplinks"
        value={value.confirmed}
        onChange={(e) => onChange({ ...value, confirmed: e.target.value })}
      >
        <option value="">Confirmed: any</option>
        <option value="true">Confirmed</option>
        <option value="false">Unconfirmed</option>
      </select>
    </>
  );
}
