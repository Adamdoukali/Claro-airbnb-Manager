import React, { useState } from 'react';
import { Lock, Mail, ShieldCheck, ArrowRight, UserCheck, AlertCircle } from 'lucide-react';
import { api } from '../api';

export default function LoginScreen({ onLogin, onGuestAccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api('/api/auth/login', { method: 'POST', body: { email, password } });
      onLogin(data.user, data.features);
    } catch (err) {
      setError(err.status === 429 ? 'Trop de tentatives. Réessayez dans quelques minutes.' : err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <img src="/claro.png" alt="Claro Digital" style={{ height: 34, width: 'auto' }} />
          <div style={{ width: 1, height: 26, background: '#E5E7EB' }} />
          <div className="logo-text" style={{ color: '#81172E' }}>
            airbnb <span style={{ color: '#1C1917', fontWeight: 600, fontSize: '0.95rem' }}>Manager</span>
          </div>
        </div>

        <div className="login-icon">
          <ShieldCheck size={28} />
        </div>
        <h1 className="login-title">Espace Hôte</h1>
        <p className="login-subtitle">Connectez-vous pour gérer vos calendriers et fiches de police.</p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="login-email">Email</label>
            <div className="input-with-icon">
              <Mail size={18} />
              <input
                id="login-email"
                type="email"
                className="form-input"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vous@exemple.com"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="login-password">Mot de passe</label>
            <div className="input-with-icon">
              <Lock size={18} />
              <input
                id="login-password"
                type="password"
                className="form-input"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
              />
            </div>
          </div>

          {error && (
            <div className="login-error" role="alert">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <button type="submit" className="btn btn-rausch" style={{ width: '100%', padding: 14 }} disabled={loading}>
            {loading ? 'Connexion…' : 'Se connecter'}
            <ArrowRight size={18} />
          </button>
        </form>

        <div className="login-footer">
          <span className="text-muted text-sm">Vous êtes voyageur ?</span>
          <button type="button" className="btn btn-secondary btn-sm btn-pill" onClick={onGuestAccess}>
            <UserCheck size={14} />
            <span>Check-in voyageur</span>
          </button>
        </div>
      </div>
    </div>
  );
}
