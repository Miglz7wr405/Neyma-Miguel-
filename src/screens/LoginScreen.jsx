import { useState } from 'react';
import { login } from '../lib/auth.js';
import { IconHeart } from '../lib/icons.jsx';

export default function LoginScreen({ onDone }) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await login({ phone, password });
      onDone();
    } catch (e) {
      setErr(e.message || 'Erro');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center-screen">
      <div className="brand">
        <div className="logo"><IconHeart /></div>
        <h1>Our Sacred Place</h1>
        <p className="tag">Só nós dois. Conversas confidenciais.</p>
      </div>
      <form className="form" onSubmit={submit}>
        <input
          inputMode="tel"
          placeholder="Número"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Palavra-passe"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {err && <div className="err">{err}</div>}
        <button className="btn-primary" disabled={busy || !phone || !password}>
          {busy ? 'A entrar…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
