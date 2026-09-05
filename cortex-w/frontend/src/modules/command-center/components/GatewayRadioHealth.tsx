interface Props {
  gatewayAlias: string;
}

export function GatewayRadioHealth({ gatewayAlias }: Props) {
  const rssiBands = [
    { label: 'Strong (>= -80 dBm)', count: 412, pct: 56, color: '#10B981' },
    { label: 'Good (-81 to -90 dBm)', count: 218, pct: 30, color: '#3B82F6' },
    { label: 'Weak (-91 to -100 dBm)', count: 82, pct: 11, color: '#F59E0B' },
    { label: 'Critical (< -100 dBm)', count: 26, pct: 3, color: '#EF4444' },
  ];

  const snrBands = [
    { label: 'Excellent (>= 5 dB)', count: 320, pct: 43, color: '#10B981' },
    { label: 'Good (0 to <5 dB)', count: 260, pct: 35, color: '#3B82F6' },
    { label: 'Marginal (-10 to <0 dB)', count: 110, pct: 15, color: '#F59E0B' },
    { label: 'Poor (< -10 dB)', count: 48, pct: 7, color: '#EF4444' },
  ];

  return (
    <div className="cc-radio-health-view">
      <div className="cc-card cc-chart-card">
        <div className="cc-card-header">
          <span className="cc-card-title">RSSI DISTRIBUTION — {gatewayAlias.toUpperCase()}</span>
          <span className="cc-card-meta">738 frames</span>
        </div>
        <div className="cc-bars-container">
          {rssiBands.map((b) => (
            <div key={b.label} className="cc-bar-row">
              <span className="cc-bar-label">{b.label}</span>
              <div className="cc-bar-track">
                <div
                  className="cc-bar-fill"
                  style={{ width: `${b.pct}%`, backgroundColor: b.color }}
                />
              </div>
              <span className="cc-bar-val">{b.count}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="cc-card cc-chart-card">
        <div className="cc-card-header">
          <span className="cc-card-title">SNR DISTRIBUTION — {gatewayAlias.toUpperCase()}</span>
          <span className="cc-card-meta">738 frames</span>
        </div>
        <div className="cc-bars-container">
          {snrBands.map((b) => (
            <div key={b.label} className="cc-bar-row">
              <span className="cc-bar-label">{b.label}</span>
              <div className="cc-bar-track">
                <div
                  className="cc-bar-fill"
                  style={{ width: `${b.pct}%`, backgroundColor: b.color }}
                />
              </div>
              <span className="cc-bar-val">{b.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
