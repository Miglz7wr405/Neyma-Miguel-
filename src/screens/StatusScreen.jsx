import { useEffect, useState } from 'react';
import { saveStatus } from '../lib/localdb.js';
import { compressImage, pickFile, capturePhoto } from '../lib/media.js';
import { partnerDisplayName, getPartnerProfile, getProfile } from '../lib/auth.js';
import { IconPlus, IconClose, IconCamera, IconImage, IconSend } from '../lib/icons.jsx';

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  return `há ${Math.floor(s / 3600)} h`;
}
function newId() {
  return `st-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function StatusViewer({ items, author, onClose, onReply }) {
  const [idx, setIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [reply, setReply] = useState('');
  const item = items[idx];

  useEffect(() => {
    setProgress(0);
    const start = Date.now();
    const dur = 5000;
    const t = setInterval(() => {
      const p = Math.min(100, ((Date.now() - start) / dur) * 100);
      setProgress(p);
      if (p >= 100) {
        clearInterval(t);
        if (idx + 1 < items.length) setIdx(idx + 1);
        else onClose();
      }
    }, 60);
    return () => clearInterval(t);
  }, [idx, items.length, onClose]);

  if (!item) return null;

  function sendReply() {
    const body = reply.trim();
    if (!body) return;
    const preview = item.kind === 'photo' ? '📷 Foto de status' : (item.body || 'Status').slice(0, 60);
    onReply({
      kind: 'text',
      body,
      replyTo: { clientId: item.id, from: author.id, kind: 'status', preview: `Status: ${preview}` },
    });
    setReply('');
    onClose();
  }

  return (
    <div className="status-viewer">
      <div className="sv-bars">
        {items.map((_, i) => (
          <div key={i} className="bar"><div className="fill" style={{ width: i < idx ? '100%' : i === idx ? `${progress}%` : '0%' }} /></div>
        ))}
      </div>
      <div className="sv-head">
        <div className="avatar md">{author.avatar ? <img src={author.avatar} alt="" /> : author.name[0]}</div>
        <div><div style={{ fontWeight: 600 }}>{author.name}</div><div style={{ fontSize: 12, opacity: 0.7 }}>{timeAgo(item.createdAt)}</div></div>
        <button className="icon-btn" style={{ marginLeft: 'auto', color: '#fff' }} onClick={onClose}><IconClose /></button>
      </div>
      <div className="content" onClick={() => (idx + 1 < items.length ? setIdx(idx + 1) : onClose())}>
        {item.kind === 'photo'
          ? <img src={item.mediaData} alt="" />
          : <div className="status-text-big">{item.body}</div>}
      </div>
      {onReply && (
        <div className="sv-reply" onClick={(e) => e.stopPropagation()}>
          <input placeholder="Responder…" value={reply} onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendReply()} />
          <button className="send-btn" onClick={sendReply}><IconSend /></button>
        </div>
      )}
    </div>
  );
}

export default function StatusScreen({ me, partner, statuses, setStatuses, bus, onReply }) {
  const [composerOpen, setComposerOpen] = useState(false);
  const [text, setText] = useState('');
  const [viewingUser, setViewingUser] = useState(null);

  const myProfile = getProfile();
  const partnerProfile = getPartnerProfile();
  const partnerName = partnerDisplayName(partner);

  const myList = statuses.filter((s) => s.user === me.id).sort((a, b) => a.createdAt - b.createdAt);
  const partnerList = statuses.filter((s) => s.user === partner.id).sort((a, b) => a.createdAt - b.createdAt);

  async function publish(s) {
    await saveStatus(s);
    setStatuses((prev) => [s, ...prev.filter((x) => x.id !== s.id)]);
    bus.publishStatus(s);
    setComposerOpen(false);
    setText('');
  }
  function publishText() {
    if (!text.trim()) return;
    publish({ id: newId(), user: me.id, kind: 'text', body: text.trim(), createdAt: Date.now() });
  }
  async function publishPhoto(fromCamera) {
    const f = fromCamera ? await capturePhoto() : await pickFile('image/*');
    if (!f) return;
    const mediaData = await compressImage(f, 1280, 0.7);
    publish({ id: newId(), user: me.id, kind: 'photo', mediaData, createdAt: Date.now() });
  }

  const author = viewingUser === me.id
    ? { id: me.id, name: myProfile.displayName || me.name, avatar: myProfile.avatar }
    : { id: partner.id, name: partnerName, avatar: partnerProfile.avatar };
  const items = viewingUser === me.id ? myList : viewingUser === partner.id ? partnerList : [];

  return (
    <>
      <header className="header">
        <h1>Status</h1>
        <button className="icon-btn accent" onClick={() => setComposerOpen(true)}><IconPlus /></button>
      </header>
      <div className="status-grid">
        <button className="status-item" onClick={() => myList.length && setViewingUser(me.id)} disabled={!myList.length}>
          <div className={`ring ${myList.length ? '' : 'seen'}`}>
            <div className="inner">{myProfile.avatar ? <img src={myProfile.avatar} alt="" /> : (myProfile.displayName || me.name)[0]}</div>
          </div>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={{ fontWeight: 600 }}>O meu status</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              {myList.length ? `${myList.length} · ${timeAgo(myList[myList.length - 1].createdAt)}` : 'Toca + para publicar'}
            </div>
          </div>
        </button>
        {partnerList.length > 0 && (
          <>
            <div className="status-section">Recentes</div>
            <button className="status-item" onClick={() => setViewingUser(partner.id)}>
              <div className="ring"><div className="inner">{partnerProfile.avatar ? <img src={partnerProfile.avatar} alt="" /> : partnerName[0]}</div></div>
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={{ fontWeight: 600 }}>{partnerName}</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{partnerList.length} · {timeAgo(partnerList[partnerList.length - 1].createdAt)}</div>
              </div>
            </button>
          </>
        )}
      </div>

      {composerOpen && (
        <div className="status-composer-full">
          <div className="scf-head">
            <button className="icon-btn" style={{ color: '#fff' }} onClick={() => setComposerOpen(false)}><IconClose /></button>
            <span style={{ fontWeight: 600 }}>Novo status</span>
          </div>
          <div className="scf-preview">
            <textarea placeholder="Escreve o que sentes…" value={text} onChange={(e) => setText(e.target.value)} autoFocus />
          </div>
          <div className="scf-actions">
            <button onClick={() => publishPhoto(false)}><IconImage /> Galeria</button>
            <button onClick={() => publishPhoto(true)}><IconCamera /> Câmara</button>
            <button className="scf-send" disabled={!text.trim()} onClick={publishText}><IconSend /></button>
          </div>
        </div>
      )}

      {viewingUser && items.length > 0 && (
        <StatusViewer
          items={items}
          author={author}
          onClose={() => setViewingUser(null)}
          onReply={viewingUser === partner.id ? onReply : null}
        />
      )}
    </>
  );
}
