import { useState } from 'react';
import { tryUnlock, getUser, logout } from '../lib/auth.js';
import { IconLock } from '../lib/icons.jsx';

export default function LockScreen({ onUnlock, onForgot }) {
  const user = getUser();
  const [password, setPassword] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const ok = await tryUnlock(password);
    setBusy(false);
    if (ok) onUnlock();
    else setErr('Palavra-passe errada');
  }

  function handleForgot() {
    logout();
    onForgot();
  }

  return (
    <div className="center-screen">
      <div className="brand">
        <div className="logo"><IconLock /></div>
        <h1>Olá, {user?.name}</h1>
        <p className="tag">Introduz a tua palavra-passe para continuar.</p>
      </div>
      <form className="form" onSubmit={submit}>
        <input
          type="password"
          placeholder="Palavra-passe"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          required
        />
        {err && <div className="err">{err}</div>}
        <button className="btn-primary" disabled={busy || !password}>
          {busy ? 'A abrir…' : 'Desbloquear'}
        </button>
        <button type="button" className="btn-ghost" onClick={handleForgot}>
          Trocar de conta
        </button>
      </form>
    </div>
  );
}
