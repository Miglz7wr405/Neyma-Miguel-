import { useEffect, useRef, useState } from 'react';
import { newClientId, saveMessage, enqueue, getMessages } from '../lib/localdb.js';
import { uploadFile, mediaUrl } from '../lib/api.js';
import { recordAudio, pickFile, capturePhoto } from '../lib/media.js';
import { IconSend, IconMic, IconAttach, IconCamera, IconImage, IconEye, IconTick, IconDoubleTick, IconClose } from '../lib/icons.jsx';

function fmtTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function fmtDay(ts) {
  const d = new Date(ts);
  const today = new Date();
  const y = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return 'Hoje';
  if (d.toDateString() === y.toDateString()) return 'Ontem';
  return d.toLocaleDateString();
}

function TickIndicator({ msg }) {
  if (msg.readAt) return <span className="tick read"><IconDoubleTick /></span>;
  if (msg.deliveredAt) return <span className="tick"><IconDoubleTick /></span>;
  return <span className="tick"><IconTick /></span>;
}

function ViewOnceModal({ src, onClose }) {
  return (
    <div className="viewonce-modal" onClick={onClose}>
      <button className="close-x" onClick={onClose}><IconClose /></button>
      <img src={src} alt="" />
    </div>
  );
}

function Bubble({ msg, me, onOpenViewOnce }) {
  const mine = msg.from === me.id;
  const cls = `bubble ${mine ? 'me' : 'them'}`;
  if (msg.kind === 'text') {
    return (
      <div className={cls}>
        {msg.body}
        <span className="foot">
          {fmtTime(msg.createdAt)}
          {mine && <TickIndicator msg={msg} />}
        </span>
      </div>
    );
  }
  if (msg.kind === 'audio') {
    return (
      <div className={cls}>
        <audio controls src={mediaUrl(msg.mediaPath)} preload="metadata"></audio>
        <span className="foot">
          {fmtTime(msg.createdAt)}
          {mine && <TickIndicator msg={msg} />}
        </span>
      </div>
    );
  }
  if (msg.kind === 'photo') {
    if (msg.viewOnce) {
      const canOpen = !msg.consumed && !mine;
      return (
        <div
          className={`bubble viewonce ${msg.consumed ? 'consumed' : ''}`}
          onClick={() => canOpen && onOpenViewOnce(mediaUrl(msg.mediaPath), msg.id)}
        >
          {msg.consumed
            ? mine ? 'Foto vista pela Neyma' : 'Foto vista'
            : mine ? 'Foto de visualização única — enviada' : '📷 Toca para ver uma vez'}
          <span className="foot">
            {fmtTime(msg.createdAt)}
            {mine && <TickIndicator msg={msg} />}
          </span>
        </div>
      );
    }
    return (
      <div className={cls}>
        <img className="msg-img" src={mediaUrl(msg.mediaPath)} alt="" />
        <span className="foot">
          {fmtTime(msg.createdAt)}
          {mine && <TickIndicator msg={msg} />}
        </span>
      </div>
    );
  }
  return null;
}

export default function ChatScreen({ me, partner, partnerOnline, messages, setMessages, socket, online }) {
  const [text, setText] = useState('');
  const [attachOpen, setAttachOpen] = useState(false);
  const [recording, setRecording] = useState(null);
  const [viewOnceSrc, setViewOnceSrc] = useState(null);
  const [typing, setTyping] = useState(false);
  const [toast, setToast] = useState(null);
  const bodyRef = useRef(null);
  const typingTimer = useRef(null);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const onTyping = ({ user, typing }) => {
      if (user === partner.id) setTyping(!!typing);
    };
    socket.on('typing', onTyping);
    return () => socket.off('typing', onTyping);
  }, [socket, partner.id]);

  // Mark partner's messages as read while chat is open
  useEffect(() => {
    const unread = messages.filter((m) => m.from === partner.id && !m.readAt && m.id);
    if (!unread.length) return;
    const upToId = Math.max(...unread.map((m) => m.id));
    socket.emit('message:read', { upToId });
  }, [messages, socket, partner.id]);

  function showToast(t) {
    setToast(t);
    setTimeout(() => setToast(null), 1600);
  }

  async function sendPayload(payload) {
    const clientId = newClientId();
    const optimistic = {
      clientId,
      from: me.id,
      to: partner.id,
      createdAt: Date.now(),
      deliveredAt: null,
      readAt: null,
      consumed: false,
      ...payload,
    };
    await saveMessage(optimistic);
    setMessages(await getMessages());
    if (online && socket.connected) {
      socket.emit('message:send', { clientId, ...payload }, async (ack) => {
        if (ack?.ok && ack.message) {
          await saveMessage({ ...ack.message });
          setMessages(await getMessages());
        }
      });
    } else {
      await enqueue({ clientId, ...payload });
      showToast('Guardado — envia quando ligares os dados');
    }
  }

  function handleSendText() {
    const body = text.trim();
    if (!body) return;
    sendPayload({ kind: 'text', body });
    setText('');
    socket.emit('typing', { typing: false });
  }

  async function handlePickImage(viewOnce) {
    setAttachOpen(false);
    const f = await pickFile('image/*');
    if (!f) return;
    try {
      const { mediaPath } = await uploadFile(f);
      sendPayload({ kind: 'photo', mediaPath, viewOnce: !!viewOnce });
    } catch (e) {
      showToast('Falha ao enviar foto (precisa de estar online)');
    }
  }
  async function handleCamera(viewOnce) {
    setAttachOpen(false);
    const f = await capturePhoto();
    if (!f) return;
    try {
      const { mediaPath } = await uploadFile(f);
      sendPayload({ kind: 'photo', mediaPath, viewOnce: !!viewOnce });
    } catch {
      showToast('Falha ao enviar (precisa de estar online)');
    }
  }

  async function handleMicDown() {
    try {
      const rec = await recordAudio();
      setRecording(rec);
    } catch {
      showToast('Sem acesso ao microfone');
    }
  }
  async function handleMicUp() {
    if (!recording) return;
    const file = await recording.stop();
    setRecording(null);
    try {
      const { mediaPath } = await uploadFile(file);
      sendPayload({ kind: 'audio', mediaPath });
    } catch {
      showToast('Falha ao enviar áudio (precisa de estar online)');
    }
  }
  function handleMicCancel() {
    recording?.cancel();
    setRecording(null);
  }

  function onTextChange(v) {
    setText(v);
    if (!typingTimer.current) {
      socket.emit('typing', { typing: true });
    }
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      socket.emit('typing', { typing: false });
      typingTimer.current = null;
    }, 1200);
  }

  const grouped = [];
  let lastDay = '';
  for (const m of messages) {
    const d = fmtDay(m.createdAt);
    if (d !== lastDay) {
      grouped.push({ divider: d, key: `d-${d}-${m.createdAt}` });
      lastDay = d;
    }
    grouped.push({ msg: m, key: `m-${m.localId || m.clientId || m.id}` });
  }

  const displayName = partner.name;

  return (
    <>
      <header className="header">
        <div className="avatar">{displayName[0]}</div>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0 }}>{displayName}</h1>
          <p className="sub">
            {typing ? 'A escrever…' : partnerOnline ? 'online' : 'offline'}
          </p>
        </div>
      </header>
      <div className="chat-body" ref={bodyRef}>
        {grouped.map((row) =>
          row.divider ? (
            <div key={row.key} className="day-divider">{row.divider}</div>
          ) : (
            <Bubble key={row.key} msg={row.msg} me={me} onOpenViewOnce={(src) => setViewOnceSrc(src)} />
          ),
        )}
      </div>
      {attachOpen && (
        <div className="attach-menu" onMouseLeave={() => setAttachOpen(false)}>
          <button onClick={() => handleCamera(false)}><IconCamera /> Câmera</button>
          <button onClick={() => handlePickImage(false)}><IconImage /> Galeria</button>
          <button onClick={() => handleCamera(true)}><IconEye /> Câmera 1×</button>
          <button onClick={() => handlePickImage(true)}><IconEye /> Foto 1×</button>
        </div>
      )}
      <div className="composer">
        <button className="icon-btn" onClick={() => setAttachOpen((v) => !v)}>
          <IconAttach />
        </button>
        <div className="field">
          <textarea
            rows={1}
            placeholder="Mensagem"
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendText();
              }
            }}
          />
        </div>
        {text.trim() ? (
          <button className="send-btn" onClick={handleSendText}>
            <IconSend />
          </button>
        ) : (
          <button
            className={`send-btn ${recording ? 'recording' : ''}`}
            onMouseDown={handleMicDown}
            onMouseUp={handleMicUp}
            onMouseLeave={handleMicCancel}
            onTouchStart={(e) => { e.preventDefault(); handleMicDown(); }}
            onTouchEnd={(e) => { e.preventDefault(); handleMicUp(); }}
          >
            <IconMic />
          </button>
        )}
      </div>
      {viewOnceSrc && <ViewOnceModal src={viewOnceSrc} onClose={() => setViewOnceSrc(null)} />}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
