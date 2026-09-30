import { useEffect, useRef, useState } from 'react';
import { newClientId, saveMessage, enqueue, getMessages, markConsumedByClientId } from '../lib/localdb.js';
import { compressImage, recordAudio, pickFile, capturePhoto } from '../lib/media.js';
import { IconSend, IconMic, IconAttach, IconCamera, IconImage, IconEye, IconTick, IconDoubleTick, IconClose } from '../lib/icons.jsx';

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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

function Bubble({ msg, me, partner, onOpenViewOnce }) {
  const mine = msg.from === me.id;
  const cls = `bubble ${mine ? 'me' : 'them'}`;
  const foot = (
    <span className="foot">
      {fmtTime(msg.createdAt)}
      {mine && <TickIndicator msg={msg} />}
    </span>
  );
  if (msg.kind === 'text') {
    return <div className={cls}>{msg.body}{foot}</div>;
  }
  if (msg.kind === 'audio') {
    return (
      <div className={cls}>
        <audio controls src={msg.mediaData} preload="metadata"></audio>
        {foot}
      </div>
    );
  }
  if (msg.kind === 'photo') {
    if (msg.viewOnce) {
      const canOpen = !msg.consumed && !mine;
      return (
        <div
          className={`bubble viewonce ${msg.consumed ? 'consumed' : ''}`}
          onClick={() => canOpen && onOpenViewOnce(msg)}
        >
          {msg.consumed
            ? mine ? `Foto vista pela ${partner.name}` : 'Foto vista'
            : mine ? 'Foto de visualização única — enviada' : '📷 Toca para ver uma vez'}
          {foot}
        </div>
      );
    }
    return (
      <div className={cls}>
        <img className="msg-img" src={msg.mediaData} alt="" />
        {foot}
      </div>
    );
  }
  return null;
}

// Fields that travel over the wire (no device-local bookkeeping).
function forWire(m) {
  const { localId, deliveredAt, readAt, ...rest } = m;
  return rest;
}

export default function ChatScreen({ me, partner, partnerOnline, partnerTyping, messages, refresh, bus, online }) {
  const [text, setText] = useState('');
  const [attachOpen, setAttachOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [viewOnceSrc, setViewOnceSrc] = useState(null);
  const [toast, setToast] = useState(null);
  const bodyRef = useRef(null);
  const recRef = useRef(null);
  const typingTimer = useRef(null);
  const ackedRead = useRef(new Set());

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, partnerTyping]);

  // Tell the partner we've read their messages (chat is open).
  useEffect(() => {
    const toAck = messages.filter(
      (m) => m.from === partner.id && m.clientId && !ackedRead.current.has(m.clientId),
    );
    if (toAck.length && bus.isConnected()) {
      toAck.forEach((m) => ackedRead.current.add(m.clientId));
      bus.publishCtrl({ t: 'read', clientIds: toAck.map((m) => m.clientId) });
    }
  }, [messages, bus, partner.id]);

  function showToast(t) {
    setToast(t);
    setTimeout(() => setToast(null), 1800);
  }

  async function sendPayload(payload) {
    const clientId = newClientId();
    const msg = {
      clientId, from: me.id, to: partner.id, createdAt: Date.now(),
      deliveredAt: null, readAt: null, consumed: false, ...payload,
    };
    await saveMessage(msg);
    await refresh();
    if (online && bus.isConnected()) {
      await bus.publishMessage(forWire(msg));
    } else {
      await enqueue(forWire(msg));
      showToast('Guardado — envia quando ligares os dados');
    }
  }

  function handleSendText() {
    const body = text.trim();
    if (!body) return;
    sendPayload({ kind: 'text', body });
    setText('');
    bus.publishCtrl({ t: 'typing', typing: false });
  }

  async function handleImage(fromCamera, viewOnce) {
    setAttachOpen(false);
    const f = fromCamera ? await capturePhoto() : await pickFile('image/*');
    if (!f) return;
    try {
      const mediaData = await compressImage(f);
      sendPayload({ kind: 'photo', mediaData, viewOnce: !!viewOnce });
    } catch {
      showToast('Não consegui preparar a foto');
    }
  }

  async function startRec() {
    try {
      recRef.current = await recordAudio();
      setRecording(true);
    } catch {
      showToast('Sem acesso ao microfone');
    }
  }
  async function stopRec() {
    if (!recRef.current) return;
    const mediaData = await recRef.current.stop();
    recRef.current = null;
    setRecording(false);
    sendPayload({ kind: 'audio', mediaData });
  }
  function cancelRec() {
    recRef.current?.cancel();
    recRef.current = null;
    setRecording(false);
  }

  function openViewOnce(msg) {
    setViewOnceSrc(msg.mediaData);
    markConsumedByClientId(msg.clientId).then(refresh);
    bus.publishCtrl({ t: 'consumed', clientId: msg.clientId });
  }

  function onTextChange(v) {
    setText(v);
    if (!typingTimer.current) bus.publishCtrl({ t: 'typing', typing: true });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      bus.publishCtrl({ t: 'typing', typing: false });
      typingTimer.current = null;
    }, 1200);
  }

  // Build render list with day dividers.
  const rows = [];
  let lastDay = '';
  for (const m of messages) {
    const d = fmtDay(m.createdAt);
    if (d !== lastDay) { rows.push({ divider: d, key: `d-${d}-${m.createdAt}` }); lastDay = d; }
    rows.push({ msg: m, key: `m-${m.localId || m.clientId}` });
  }
  const lastMine = [...messages].reverse().find((m) => m.from === me.id);
  const seenLabel = lastMine?.readAt ? `Visto às ${fmtTime(lastMine.readAt)}` : null;

  return (
    <>
      <header className="header">
        <div className="avatar">{partner.name[0]}</div>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0 }}>{partner.name}</h1>
          <p className="sub">
            {partnerTyping ? 'a escrever…' : partnerOnline ? 'online' : 'offline'}
          </p>
        </div>
      </header>
      <div className="chat-body" ref={bodyRef}>
        {rows.map((row) =>
          row.divider ? (
            <div key={row.key} className="day-divider">{row.divider}</div>
          ) : (
            <Bubble key={row.key} msg={row.msg} me={me} partner={partner} onOpenViewOnce={openViewOnce} />
          ),
        )}
        {seenLabel && <div style={{ alignSelf: 'flex-end', fontSize: 11, color: 'var(--tick-read)', padding: '2px 6px' }}>{seenLabel}</div>}
      </div>
      {attachOpen && (
        <div className="attach-menu" onMouseLeave={() => setAttachOpen(false)}>
          <button onClick={() => handleImage(true, false)}><IconCamera /> Câmera</button>
          <button onClick={() => handleImage(false, false)}><IconImage /> Galeria</button>
          <button onClick={() => handleImage(true, true)}><IconEye /> Câmera 1×</button>
          <button onClick={() => handleImage(false, true)}><IconEye /> Foto 1×</button>
        </div>
      )}
      <div className="composer">
        <button className="icon-btn" onClick={() => setAttachOpen((v) => !v)}><IconAttach /></button>
        <div className="field">
          <textarea
            rows={1}
            placeholder="Mensagem"
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendText(); }
            }}
          />
        </div>
        {text.trim() ? (
          <button className="send-btn" onClick={handleSendText}><IconSend /></button>
        ) : (
          <button
            className={`send-btn ${recording ? 'recording' : ''}`}
            onMouseDown={startRec}
            onMouseUp={stopRec}
            onMouseLeave={() => recording && cancelRec()}
            onTouchStart={(e) => { e.preventDefault(); startRec(); }}
            onTouchEnd={(e) => { e.preventDefault(); stopRec(); }}
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
