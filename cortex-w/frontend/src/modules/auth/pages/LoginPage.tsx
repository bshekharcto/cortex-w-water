import { Waves, Radio, Map as MapIcon, BrainCircuit } from 'lucide-react';
import { LoginForm } from '../components/LoginForm';

const CAPABILITY_ROWS = [
  { icon: Waves, title: 'Unified Water Operations', copy: 'One view of meters, gateways, consumers, billing and network performance.' },
  { icon: Radio, title: 'Network Observability', copy: 'Know what is reporting, through which gateway, and where communication is degrading.' },
  { icon: MapIcon, title: 'GIS Intelligence', copy: 'Explore meter coverage and plan gateway placement directly on the network map.' },
  { icon: BrainCircuit, title: 'AI-Assisted Analysis', copy: 'Surface communication, device and hydraulic anomalies before they become operational issues.' },
];

/**
 * The one screen in the app allowed a dark branded panel outside the
 * Command Center scope — this is the established Cortex-family login
 * pattern (spec 4.1), not part of the dark-mode deviation discussion.
 */
export function LoginPage() {
  return (
    <div className="cw-login-layout">
      <aside className="cw-login-brand-panel">
        <div>
          <div className="cw-brand-mark">Cortex-W</div>
          <div className="cw-brand-subline">Water Intelligence</div>
          <span className="cw-pill">A COGNECTO PRODUCT</span>
        </div>

        <h2 className="cw-hero-copy">The Intelligence Layer for Water Networks.</h2>
        <p className="cw-supporting-copy">
          Monitor water-meter connectivity, gateway health, consumer activity and network intelligence from one operational workspace.
        </p>

        <ul className="cw-capability-list">
          {CAPABILITY_ROWS.map(({ icon: Icon, title, copy }) => (
            <li key={title}>
              <Icon size={18} strokeWidth={1.5} />
              <div>
                <strong>{title}</strong>
                <p>{copy}</p>
              </div>
            </li>
          ))}
        </ul>
      </aside>

      <main className="cw-login-auth-panel">
        <LoginForm />
      </main>
    </div>
  );
}
