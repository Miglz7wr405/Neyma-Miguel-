import { useEffect, useState } from 'react';
import { getTheme, setTheme, getProfile, saveProfile } from '../lib/auth.js';
import { compressImage, pickFile } from '../lib/media.js';
import { canInstall, onInstallAvailable, promptInstall, isIOS, isStandalone } from '../lib/install.js';
import { IconPencil, IconDownload, IconCamera } from '../lib/icons.jsx';
import PhotoViewer from '../components/PhotoViewer.jsx';

const THEMES = [
  { id: 'rose', name: 'Rosa Confidencial', color: '#e91e63' },
  { id: 'purple', name: 'Roxo Íntimo', color: '#a862ff' },
  { id: 'midnight', name: 'Meia-Noite', color: '#3ea6ff' },
];

export default function SettingsScreen({ me, bus, onLogout, onThemeChange, onProfileChanged }) {
  const [themeId, setThemeId] = useState(getTheme());
  const [displayName, setDisplayName] = useState(getProfile().displayName || '');
  const [avatar, setAvatar] = useState(getProfile().avatar || null);
  const [savedToast, setSavedToast] = useState(false);
  const [installable, setInstallable] = useState(canInstall());
  const [iosHelp, setIosHelp] = useState(false);
  const [showMyPhoto, setShowMyPhoto] = useState(false);

  useEffect(() => onInstallAvailable(setInstallable), []);

  function pickTheme(t) {
    setTheme(t); setThemeId(t); onThemeChange?.();
  }

  function broadcastProfile(name, av) {
    bus?.publishCtrl?.({ t: 'profile', name: name || me.name, avatar: av || null });
  }

  function handleSaveProfile() {
    saveProfile({ displayName: displayName || null });
    broadcastProfile(displayName, avatar);
    onProfileChanged?.();
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 1500);
  }

  async function changeAvatar() {
    const f = await pickFile('image/*');
    if (!f) return;
    const dataUrl = await compressImage(f, 256, 0.8);
    setAvatar(dataUrl);
    saveProfile({ avatar: dataUrl });
    broadcastProfile(displayName, dataUrl);
    onProfileChanged?.();
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 1500);
  }

  async function installApp() {
    if (isIOS()) { setIosHelp(true); return; }
    await promptInstall();
  }

  return (
    <>
      <header className="header"><h1>Definições</h1></header>
      <div className="settings">
        <div className="profile-hero">
          <button className="avatar lg av-edit" onClick={() => setShowMyPhoto(true)}>
            {avatar ? <img src={avatar} alt="" /> : (displayName || me.name)[0]}
            <span className="av-cam"><IconCamera /></span>
          </button>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{displayName || me.name}</div>
            <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>{me.phone}</div>
          </div>
        </div>

        <h2>O meu nome</h2>
        <div className="row">
          <span className="row-ic"><IconPencil /></span>
          <input
            placeholder={me.name}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            style={{ flex: 1, background: 'transparent', outline: 'none', fontSize: 15 }}
          />
          <button className="btn-primary" style={{ padding: '8px 14px' }} onClick={handleSaveProfile}>Guardar</button>
        </div>

        <h2>Tema</h2>
        <div className="theme-picker">
          {THEMES.map((t) => (
            <div key={t.id} className={`swatch ${t.id === themeId ? 'active' : ''}`}
              style={{ background: `linear-gradient(135deg, ${t.color}, #ffffff20)` }}
              onClick={() => pickTheme(t.id)} title={t.name} />
          ))}
        </div>
        <div style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 6 }}>
          {THEMES.find((t) => t.id === themeId)?.name}
        </div>

        {!isStandalone() && (
          <>
            <h2>App</h2>
            <button className="install-cta" onClick={installApp}>
              <IconDownload /> Baixar / Instalar no ecrã principal
            </button>
          </>
        )}

        <h2>Conta</h2>
        <div className="row" onClick={onLogout} style={{ cursor: 'pointer', color: 'var(--danger)' }}>
          <label>Terminar sessão / trocar de conta</label>
        </div>

        <div style={{ marginTop: 40, textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}>
          Our Sacred Place · feito com amor 🤍
        </div>
      </div>

      {showMyPhoto && (
        <PhotoViewer
          src={avatar}
          letter={(displayName || me.name)[0]}
          title="A minha foto"
          actionLabel="Mudar foto"
          onAction={() => { setShowMyPhoto(false); changeAvatar(); }}
          onClose={() => setShowMyPhoto(false)}
        />
      )}
      {iosHelp && (
        <div className="viewonce-modal" onClick={() => setIosHelp(false)}>
          <div className="mini-modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0 }}>Instalar no iPhone</h3>
            <p style={{ fontSize: 14, lineHeight: 1.5 }}>
              Toca no botão <b>Partilhar</b> (o quadrado com a seta) e escolhe
              <b> "Adicionar ao ecrã principal"</b>.
            </p>
            <button className="btn-primary" onClick={() => setIosHelp(false)}>Percebi</button>
          </div>
        </div>
      )}
      {savedToast && <div className="toast">Guardado</div>}
    </>
  );
}
