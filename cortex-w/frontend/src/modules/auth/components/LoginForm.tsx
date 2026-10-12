import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export function LoginForm() {
  const navigate = useNavigate();
  const login = useAuth((s) => s.login);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
      <form onSubmit={handleSubmit} className="cw-login-form">
        <h1 style={{ font: 'var(--cw-font-page-title)', marginBottom: 4 }}>Sign in</h1>
        <p style={{ color: 'var(--cw-text-muted)', marginBottom: 20 }}>
          Enter your credentials to access the platform
        </p>

        <label className="cw-field-label" htmlFor="username" style={{ letterSpacing: '0.04em' }}>
          USER ID / USERNAME
        </label>
        <input
          id="username"
          className="cw-input"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
          }}
          placeholder="Username"
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
