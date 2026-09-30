import { useState } from 'react';
import { saveStatus } from '../lib/localdb.js';
import { compressImage, pickFile, capturePhoto } from '../lib/media.js';
import { IconPlus, IconClose, IconCamera, IconImage } from '../lib/icons.jsx';

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  return `há ${Math.floor(s / 3600)} h`;
}

function StatusViewer({ items, onClose }) {
  const [idx, setIdx] = useState(0);
  const item = items[idx];
  if (!item) return null;
  function next() {
    if (idx + 1 < items.length) setIdx(idx + 1);
    else onClose();
  }
  return (
    <div className="status-viewer" onClick={next}>
      <button className="close" onClick={(e) => { e.stopPropagation(); onClose(); }}><IconClose /></button>
      <div style={{ display: 'flex' }}>
        {items.map((_, i) => (
          <div key={i} className="bar" style={{ flex: 1 }}>
            <div className="fill" style={{ width: i <= idx ? '100%' : '0%' }} />
          </div>
        ))}
      </div>
      <div className="content">
        {item.kind === 'photo' ? <img src={item.mediaData} alt="" /> : <div style={{ textAlign: 'center' }}>{item.body}</div>}
      </div>
    </div>
  );
}

function newId() {
  return `st-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

export default function StatusScreen({ me, partner, statuses, setStatuses, bus }) {
  const [composerOpen, setComposerOpen] = useState(false);
  const [text, setText] = useState('');
  const [viewingUser, setViewingUser] = useState(null);

  const myList = statuses.filter((s) => s.user === me.id).sort((a, b) => a.createdAt - b.createdAt);
  const partnerList = statuses.filter((s) => s.user === partner.id).sort((a, b) => a.createdAt - b.createdAt);

  async function publish(s) {
    await saveStatus(s);
    setStatuses((prev) => [s, ...prev.filter((x) => x.id !== s.id)]);
    bus.publishStatus(s);
    setComposerOpen(false);
  }

  function publishText() {
    if (!text.trim()) return;
    publish({ id: newId(), user: me.id, kind: 'text', body: text.trim(), createdAt: Date.now() });
    setText('');
  }
  async function publishPhoto(fromCamera) {
    const f = fromCamera ? await capturePhoto() : await pickFile('image/*');
    if (!f) return;
    const mediaData = await compressImage(f, 1280, 0.7);
    publish({ id: newId(), user: me.id, kind: 'photo', mediaData, createdAt: Date.now() });
  }

  const items = viewingUser === me.id ? myList : viewingUser === partner.id ? partnerList : [];

  return (
    <>
      <header className="header">
        <h1>Status</h1>
        <button className="icon-btn accent" onClick={() => setComposerOpen(true)}><IconPlus /></button>
      </header>
      <div className="status-grid">
        <button className="status-item" onClick={() => myList.length && setViewingUser(me.id)} disabled={!myList.length}>
          <div className={`ring ${myList.length ? '' : 'seen'}`}><div className="inner">{me.name[0]}</div></div>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={{ fontWeight: 600 }}>O meu status</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              {myList.length ? `${myList.length} · ${timeAgo(myList[myList.length - 1].createdAt)}` : 'Toca + para publicar'}
            </div>
          </div>
        </button>
        {partnerList.length > 0 && (
          <button className="status-item" onClick={() => setViewingUser(partner.id)}>
            <div className="ring"><div className="inner">{partner.name[0]}</div></div>
            <div style={{ flex: 1, textAlign: 'left' }}>
              <div style={{ fontWeight: 600 }}>{partner.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                {partnerList.length} · {timeAgo(partnerList[partnerList.length - 1].createdAt)}
              </div>
            </div>
          </button>
        )}
      </div>

      {composerOpen && (
        <div className="viewonce-modal" onClick={() => setComposerOpen(false)}>
          <div className="status-composer" onClick={(e) => e.stopPropagation()}
            style={{ background: 'var(--panel)', borderRadius: 16, minWidth: 300, maxWidth: 400 }}>
            <h3 style={{ margin: 0 }}>Publicar status</h3>
            <textarea placeholder="Escreve algo…" value={text} onChange={(e) => setText(e.target.value)} />
            <button className="btn-primary" onClick={publishText}>Publicar texto</button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-primary" style={{ flex: 1 }} onClick={() => publishPhoto(true)}><IconCamera /> Câmera</button>
              <button className="btn-primary" style={{ flex: 1 }} onClick={() => publishPhoto(false)}><IconImage /> Galeria</button>
            </div>
            <button className="btn-ghost" onClick={() => setComposerOpen(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {viewingUser && items.length > 0 && <StatusViewer items={items} onClose={() => setViewingUser(null)} />}
    </>
  );
}
