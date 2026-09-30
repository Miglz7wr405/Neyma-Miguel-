import { useEffect, useState } from 'react';
import { getTheme, setTheme, getProfile, saveProfile } from '../lib/auth.js';

const THEMES = [
  { id: 'rose', name: 'Rosa Confidencial', color: '#e91e63' },
  { id: 'purple', name: 'Roxo Íntimo', color: '#a862ff' },
  { id: 'midnight', name: 'Meia-Noite', color: '#3ea6ff' },
];

export default function SettingsScreen({ me, onLogout, onThemeChange }) {
  const [themeId, setThemeId] = useState(getTheme());
  const [displayName, setDisplayName] = useState(getProfile().displayName || '');
  const [savedToast, setSavedToast] = useState(false);
  const [installEvent, setInstallEvent] = useState(null);

  useEffect(() => {
    const h = (e) => {
      e.preventDefault();
      setInstallEvent(e);
    };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);

  function pickTheme(t) {
    setTheme(t);
    setThemeId(t);
    onThemeChange?.();
  }

  function handleSaveProfile() {
    saveProfile({ displayName: displayName || null });
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 1500);
  }

  async function installApp() {
    if (!installEvent) return;
    installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  }

  return (
    <>
      <header className="header">
        <h1>Definições</h1>
      </header>
      <div className="settings">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
          <div className="avatar lg">{me.name[0]}</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{me.name}</div>
            <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>{me.phone}</div>
          </div>
        </div>

        <h2>Perfil</h2>
        <div className="row">
          <input
            placeholder={me.name}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            style={{ flex: 1, background: 'transparent', outline: 'none', fontSize: 15 }}
          />
          <button className="btn-primary" style={{ padding: '8px 14px' }} onClick={handleSaveProfile}>
            Guardar
          </button>
        </div>

        <h2>Tema</h2>
        <div className="theme-picker">
          {THEMES.map((t) => (
            <div
              key={t.id}
              className={`swatch ${t.id === themeId ? 'active' : ''}`}
              style={{ background: `linear-gradient(135deg, ${t.color}, #ffffff20)` }}
              onClick={() => pickTheme(t.id)}
              title={t.name}
            />
          ))}
        </div>
        <div style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 6 }}>
          {THEMES.find((t) => t.id === themeId)?.name}
        </div>

        {installEvent && (
          <>
            <h2>App</h2>
            <div className="row" onClick={installApp} style={{ cursor: 'pointer' }}>
              <label>📥 Descarregar / Instalar app no ecrã principal</label>
            </div>
          </>
        )}

        <h2>Segurança</h2>
        <div className="row" onClick={onLogout} style={{ cursor: 'pointer', color: 'var(--danger)' }}>
          <label>Terminar sessão e apagar dados locais</label>
        </div>

        <div style={{ marginTop: 40, textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}>
          Our Sacred Place · v1.0 · feito com amor 🤍
        </div>
      </div>

      {savedToast && <div className="toast">Guardado</div>}
    </>
  );
}
