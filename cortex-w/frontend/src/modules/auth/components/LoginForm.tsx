import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const DEMO_ROLES = [
  { label: 'WATCO', username: 'WATCOAdmin', password: 'AdminWatco' },
  { label: 'Admin', username: 'admin', password: 'admin' },
  { label: 'Consumer', username: 'admin', password: 'admin' },
  { label: 'Bill Desk', username: 'admin', password: 'admin' },
] as const;

export function LoginForm() {
  const navigate = useNavigate();
  const login = useAuth((s) => s.login);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [activeRole, setActiveRole] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleRoleSelect(role: typeof DEMO_ROLES[number]) {
    setUsername(role.username);
    setPassword(role.password);
    setActiveRole(role.label);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(username, password);
      navigate('/app/dashboard');
    } catch {
      setError('Invalid username or password. Please verify credentials.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* Right-hand top developer quick-fill bar */}
      <div className="cw-dev-topright-strip">
        <span className="cw-dev-topright-label">Quick Fill:</span>
        {DEMO_ROLES.map((r) => (
          <button
            key={r.label}
            type="button"
            id={`dev-quick-${r.label.toLowerCase().replace(/\s+/g, '-')}`}
            className={`cw-dev-quickbtn ${activeRole === r.label ? 'cw-dev-quickbtn--active' : ''}`}
            onClick={() => handleRoleSelect(r)}
            title={`Fill ${r.label} credentials (${r.username} / ${r.password})`}
          >
            {r.label === 'WATCO' ? '★ WATCO' : r.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="cw-login-form">
        <h1 style={{ font: 'var(--cw-font-page-title)', marginBottom: 4 }}>Sign in</h1>
        <p style={{ color: 'var(--cw-text-muted)', marginBottom: 20 }}>
          Enter your credentials to access the platform
        </p>

        {/* In-form Demo Auth box matching reference */}
        <div className="cw-demo-auth-box">
          <span className="cw-demo-auth-label">Quick Role:</span>
          {DEMO_ROLES.map((r, idx) => (
            <span key={r.label} style={{ display: 'inline-flex', alignItems: 'center' }}>
              <button
                type="button"
                id={`demo-btn-${r.label.toLowerCase().replace(/\s+/g, '-')}`}
                className={`cw-demo-role-btn ${activeRole === r.label ? 'cw-demo-role-btn--active' : ''}`}
                onClick={() => handleRoleSelect(r)}
              >
                {r.label === 'WATCO' ? '★ WATCO' : r.label}
              </button>
              {idx < DEMO_ROLES.length - 1 && <span className="cw-demo-sep">|</span>}
            </span>
          ))}
        </div>

        {activeRole && (
          <div className="cw-autofill-indicator">
            ✓ Auto-filled credentials for <strong>{activeRole}</strong> (<code>{username}</code>)
          </div>
        )}

        <label className="cw-field-label" htmlFor="username" style={{ letterSpacing: '0.04em' }}>
          USER ID / USERNAME
        </label>
        <input
          id="username"
          className="cw-input"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            setActiveRole(null);
          }}
          placeholder="WATCOAdmin or admin"
          autoComplete="username"
          required
        />

        <label className="cw-field-label" htmlFor="password" style={{ letterSpacing: '0.04em' }}>
          PASSWORD
        </label>
        <div className="cw-input-with-icon">
          <input
            id="password"
            className="cw-input"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setActiveRole(null);
            }}
            placeholder="••••••••••••"
            autoComplete="current-password"
            required
          />
          <button
            type="button"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            onClick={() => setShowPassword((v) => !v)}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>

        {error && <p role="alert" style={{ color: 'var(--cw-red)', marginTop: 8 }}>{error}</p>}

        <button type="submit" className="cw-button-primary" style={{ marginTop: 20 }} disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in →'}
        </button>

        <div className="cw-footer-card">
          <div style={{ fontWeight: 600, color: 'var(--cw-text)', marginBottom: 4 }}>Need an account?</div>
          <div style={{ marginBottom: 4 }}>
            To sign up or get platform access, please reach out to our team at
          </div>
          <a href="mailto:info@cognecto.com" style={{ color: 'var(--cw-primary)', textDecoration: 'none', fontWeight: 500 }}>
            info@cognecto.com
          </a>
        </div>
      </form>
    </>
  );
}
