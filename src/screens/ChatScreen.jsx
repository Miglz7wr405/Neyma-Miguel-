import { useEffect, useRef, useState } from 'react';
import {
  newClientId, saveMessage, enqueue, getMessages,
  markConsumedByClientId, deleteForMe, markDeleted,
} from '../lib/localdb.js';
import {
  recordAudio, pickFile, capturePhoto, pickImages, fileToDataURL, getLocation, humanSize,
} from '../lib/media.js';
import ImageEditor from '../components/ImageEditor.jsx';
import { partnerDisplayName, getPartnerProfile, getProfile, savePartnerAlias } from '../lib/auth.js';
import {
  IconSend, IconMic, IconAttach, IconCamera, IconImage, IconEye, IconTick, IconDoubleTick,
  IconClose, IconReply, IconTrash, IconCopy, IconPencil, IconDoc, IconPin, IconPlay,
} from '../lib/icons.jsx';

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

function previewOf(m) {
  if (m.kind === 'text') return m.body;
  if (m.kind === 'audio') return '🎙️ Mensagem de voz';
  if (m.kind === 'photo') return m.caption || '📷 Foto';
  if (m.kind === 'document') return `📄 ${m.body || 'Documento'}`;
  if (m.kind === 'location') return '📍 Localização';
  return '';
}

function TickIndicator({ msg }) {
  if (msg.readAt) return <span className="tick read"><IconDoubleTick /></span>;
  if (msg.deliveredAt) return <span className="tick"><IconDoubleTick /></span>;
  return <span className="tick"><IconTick /></span>;
}

function Quoted({ reply, me, partner, onJump }) {
  if (!reply) return null;
  const who = reply.from === me.id ? 'Tu' : partnerDisplayName(partner);
  return (
    <div className="quoted" onClick={(e) => { e.stopPropagation(); onJump?.(reply.clientId); }}>
      <div className="quoted-who">{who}</div>
      <div className="quoted-text">{reply.preview}</div>
    </div>
  );
}

function Bubble({ msg, me, partner, onOpenViewOnce, onReply, onLongPress, onJump, onPlayVoiceOnce, refAttr }) {
  const mine = msg.from === me.id;
  const [dx, setDx] = useState(0);
  const start = useRef(null);
  const moved = useRef(false);
  const lpTimer = useRef(null);

  function down(x, y) {
    start.current = { x, y };
    moved.current = false;
    lpTimer.current = setTimeout(() => { if (!moved.current) onLongPress?.(msg); }, 480);
  }
  function move(x, y) {
    if (!start.current) return;
    const ddx = x - start.current.x;
    const ddy = y - start.current.y;
    if (Math.abs(ddx) > 8 || Math.abs(ddy) > 8) { moved.current = true; clearTimeout(lpTimer.current); }
    if (ddx > 0 && Math.abs(ddx) > Math.abs(ddy)) setDx(Math.min(72, ddx));
  }
  function up() {
    clearTimeout(lpTimer.current);
    if (dx > 48) onReply?.(msg);
    setDx(0);
    start.current = null;
  }

  const cls = `bubble ${mine ? 'me' : 'them'}`;
  const foot = (
    <span className="foot">
      {fmtTime(msg.createdAt)}
      {mine && <TickIndicator msg={msg} />}
    </span>
  );

  let inner = null;
  if (msg.kind === 'deleted') {
    inner = <span className="deleted-msg">🚫 Esta mensagem foi apagada</span>;
  } else if (msg.kind === 'text') {
    inner = <>{msg.body}{foot}</>;
  } else if (msg.kind === 'audio') {
    if (msg.viewOnce) {
      const canPlay = !msg.consumed && !mine;
      inner = msg.consumed
        ? <><span className="vo-consumed">🎙️ Áudio ouvido</span>{foot}</>
        : (
          <div className="vo-audio" onClick={() => canPlay && onPlayVoiceOnce(msg)}>
            <IconPlay /> {mine ? 'Áudio de audição única — enviado' : 'Ouvir uma vez'}{foot}
          </div>
        );
    } else {
      inner = <><audio controls src={msg.mediaData} preload="metadata"></audio>{foot}</>;
    }
  } else if (msg.kind === 'photo') {
    if (msg.viewOnce) {
      const canOpen = !msg.consumed && !mine;
      return (
        <div ref={refAttr} className="bubble-wrap" style={{ transform: `translateX(${dx}px)` }}
          onTouchStart={(e) => down(e.touches[0].clientX, e.touches[0].clientY)}
          onTouchMove={(e) => move(e.touches[0].clientX, e.touches[0].clientY)}
          onTouchEnd={up}
          onContextMenu={(e) => { e.preventDefault(); onLongPress?.(msg); }}>
          {dx > 10 && <span className="swipe-reply"><IconReply /></span>}
          <div className={`bubble viewonce ${msg.consumed ? 'consumed' : ''}`}
            onClick={() => canOpen && onOpenViewOnce(msg)}>
            {msg.consumed
              ? (mine ? `Foto vista pela ${partnerDisplayName(partner)}` : 'Foto vista')
              : (mine ? 'Foto de visualização única — enviada' : '📷 Toca para ver uma vez')}
            {foot}
          </div>
        </div>
      );
    }
    inner = <><img className="msg-img" src={msg.mediaData} alt="" />{msg.caption ? <div className="msg-caption">{msg.caption}</div> : null}{foot}</>;
  } else if (msg.kind === 'document') {
    inner = (
      <a className="doc-card" href={msg.mediaData} download={msg.body || 'ficheiro'} onClick={(e) => e.stopPropagation()}>
        <span className="doc-ic"><IconDoc /></span>
        <span className="doc-meta">
          <span className="doc-name">{msg.body || 'Documento'}</span>
          <span className="doc-size">{msg.size ? humanSize(msg.size) : 'ficheiro'}</span>
        </span>
        {foot}
      </a>
    );
  } else if (msg.kind === 'location') {
    const url = `https://maps.google.com/?q=${msg.lat},${msg.lng}`;
    inner = (
      <a className="loc-card" href={url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
        <span className="loc-ic"><IconPin /></span>
        <span className="loc-meta">
          <span className="doc-name">Localização</span>
          <span className="doc-size">Abrir no mapa</span>
        </span>
        {foot}
      </a>
    );
  }

  return (
    <div ref={refAttr} className="bubble-wrap" style={{ transform: `translateX(${dx}px)` }}
      onTouchStart={(e) => down(e.touches[0].clientX, e.touches[0].clientY)}
      onTouchMove={(e) => move(e.touches[0].clientX, e.touches[0].clientY)}
      onTouchEnd={up}
      onContextMenu={(e) => { e.preventDefault(); onLongPress?.(msg); }}>
      {dx > 10 && <span className="swipe-reply"><IconReply /></span>}
      <div className={cls}>
        {msg.replyTo && msg.kind !== 'deleted' && <Quoted reply={msg.replyTo} me={me} partner={partner} onJump={onJump} />}
        {inner}
      </div>
    </div>
  );
}

function forWire(m) {
  const { localId, deliveredAt, readAt, ...rest } = m;
  return rest;
}

export default function ChatScreen({ me, partner, partnerOnline, partnerTyping, messages, refresh, bus, online, onProfileChanged }) {
  const [text, setText] = useState('');
  const [attachOpen, setAttachOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [voArmed, setVoArmed] = useState(false); // next media = view-once
  const [viewOnceSrc, setViewOnceSrc] = useState(null);
  const [voAudio, setVoAudio] = useState(null); // playing view-once audio src
  const [editorFiles, setEditorFiles] = useState(null);
  const [editorVO, setEditorVO] = useState(false);
  const [toast, setToast] = useState(null);
  const [replyTarget, setReplyTarget] = useState(null);
  const [menuMsg, setMenuMsg] = useState(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [aliasInput, setAliasInput] = useState('');
  const bodyRef = useRef(null);
  const recRef = useRef(null);
  const typingTimer = useRef(null);
  const ackedRead = useRef(new Set());
  const bubbleRefs = useRef({});

  const partnerName = partnerDisplayName(partner);
  const partnerAvatar = getPartnerProfile().avatar;

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, partnerTyping]);

  useEffect(() => {
    const toAck = messages.filter(
      (m) => m.from === partner.id && m.clientId && !ackedRead.current.has(m.clientId),
    );
    if (toAck.length && bus.isConnected()) {
      toAck.forEach((m) => ackedRead.current.add(m.clientId));
      bus.publishCtrl({ t: 'read', clientIds: toAck.map((m) => m.clientId) });
    }
  }, [messages, bus, partner.id]);

  function showToast(t) { setToast(t); setTimeout(() => setToast(null), 1800); }

  async function sendPayload(payload) {
    const clientId = newClientId();
    const msg = {
      clientId, from: me.id, to: partner.id, createdAt: Date.now(),
      deliveredAt: null, readAt: null, consumed: false,
      replyTo: replyTarget
        ? { clientId: replyTarget.clientId, from: replyTarget.from, kind: replyTarget.kind, preview: previewOf(replyTarget).slice(0, 80) }
        : null,
      ...payload,
    };
    setReplyTarget(null);
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
    const files = fromCamera ? [await capturePhoto()].filter(Boolean) : await pickImages();
    if (!files || !files.length) return;
    setEditorVO(!!viewOnce);
    setEditorFiles(files);
  }

  async function handleEditorSend(list) {
    setEditorFiles(null);
    for (const it of list) {
      await sendPayload({ kind: 'photo', mediaData: it.dataURL, viewOnce: it.viewOnce, caption: it.caption || null });
    }
  }

  async function handleDocument() {
    setAttachOpen(false);
    const f = await pickFile('*/*');
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) { showToast('Ficheiro grande demais (máx 2MB)'); return; }
    try {
      const mediaData = await fileToDataURL(f);
      sendPayload({ kind: 'document', body: f.name, size: f.size, mediaData });
    } catch { showToast('Não consegui ler o ficheiro'); }
  }

  async function handleLocation() {
    setAttachOpen(false);
    try {
      const { lat, lng } = await getLocation();
      sendPayload({ kind: 'location', lat, lng });
    } catch { showToast('Não consegui obter a localização'); }
  }

  async function startRec() {
    try { recRef.current = await recordAudio(); setRecording(true); }
    catch { showToast('Sem acesso ao microfone'); }
  }
  async function stopRec() {
    if (!recRef.current) return;
    const mediaData = await recRef.current.stop();
    recRef.current = null;
    setRecording(false);
    const vo = voArmed;
    setVoArmed(false);
    sendPayload({ kind: 'audio', mediaData, viewOnce: vo });
  }
  function cancelRec() { recRef.current?.cancel(); recRef.current = null; setRecording(false); }

  function openViewOnce(msg) {
    setViewOnceSrc(msg.mediaData);
    markConsumedByClientId(msg.clientId).then(refresh);
    bus.publishCtrl({ t: 'consumed', clientId: msg.clientId });
  }
  function playVoiceOnce(msg) {
    setVoAudio(msg.mediaData);
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

  function jumpTo(clientId) {
    const el = bubbleRefs.current[clientId];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), 1200);
    }
  }

  // Context-menu actions
  function doReply(m) { setReplyTarget(m); setMenuMsg(null); }
  function doCopy(m) {
    if (m.kind === 'text') navigator.clipboard?.writeText(m.body).catch(() => {});
    setMenuMsg(null);
    showToast('Copiado');
  }
  async function doDeleteForMe(m) { setMenuMsg(null); await deleteForMe(m.clientId); await refresh(); }
  async function doDeleteForAll(m) {
    setMenuMsg(null);
    await markDeleted(m.clientId);
    await refresh();
    bus.publishCtrl({ t: 'delete', clientId: m.clientId });
  }

  function saveAlias() {
    savePartnerAlias(aliasInput.trim());
    setRenameOpen(false);
    onProfileChanged?.();
  }

  const rows = [];
  let lastDay = '';
  for (const m of messages) {
    const d = fmtDay(m.createdAt);
    if (d !== lastDay) { rows.push({ divider: d, key: `d-${d}-${m.createdAt}` }); lastDay = d; }
    rows.push({ msg: m, key: `m-${m.localId || m.clientId}` });
  }
  const lastMine = [...messages].reverse().find((m) => m.from === me.id && m.kind !== 'deleted');
  const seenLabel = lastMine?.readAt ? `Visto às ${fmtTime(lastMine.readAt)}` : null;

  return (
    <>
      <header className="header">
        <div className="avatar">{partnerAvatar ? <img src={partnerAvatar} alt="" /> : partnerName[0]}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
            {partnerName}
            <button className="icon-btn" style={{ width: 26, height: 26 }}
              onClick={() => { setAliasInput(''); setRenameOpen(true); }}>
              <IconPencil />
            </button>
          </h1>
          <p className="sub">{partnerTyping ? 'a escrever…' : partnerOnline ? 'online' : 'offline'}</p>
        </div>
      </header>

      <div className="chat-body" ref={bodyRef}>
        {rows.map((row) =>
          row.divider ? (
            <div key={row.key} className="day-divider">{row.divider}</div>
          ) : (
            <Bubble
              key={row.key}
              msg={row.msg}
              me={me}
              partner={partner}
              refAttr={(el) => { if (el && row.msg.clientId) bubbleRefs.current[row.msg.clientId] = el; }}
              onOpenViewOnce={openViewOnce}
              onPlayVoiceOnce={playVoiceOnce}
              onReply={doReply}
              onLongPress={(m) => setMenuMsg(m)}
              onJump={jumpTo}
            />
          ),
        )}
        {seenLabel && <div className="seen-label">{seenLabel}</div>}
      </div>

      {replyTarget && (
        <div className="reply-bar">
          <div className="reply-bar-body">
            <div className="quoted-who">{replyTarget.from === me.id ? 'Tu' : partnerName}</div>
            <div className="quoted-text">{previewOf(replyTarget)}</div>
          </div>
          <button className="icon-btn" onClick={() => setReplyTarget(null)}><IconClose /></button>
        </div>
      )}

      {attachOpen && (
        <>
          <div className="sheet-backdrop" onClick={() => setAttachOpen(false)} />
          <div className="attach-sheet">
            <button onClick={() => handleImage(false, false)}><span className="ic gal"><IconImage /></span>Galeria</button>
            <button onClick={() => handleImage(true, false)}><span className="ic cam"><IconCamera /></span>Câmara</button>
            <button onClick={handleDocument}><span className="ic doc"><IconDoc /></span>Documento</button>
            <button onClick={handleLocation}><span className="ic loc"><IconPin /></span>Localização</button>
            <button onClick={() => handleImage(false, true)}><span className="ic eye"><IconEye /></span>Foto 1×</button>
            <button onClick={() => handleImage(true, true)}><span className="ic eye"><IconEye /></span>Câmara 1×</button>
          </div>
        </>
      )}

      <div className="composer">
        <button className="icon-btn" onClick={() => setAttachOpen((v) => !v)}><IconAttach /></button>
        <div className="field">
          <textarea
            rows={1}
            placeholder="Mensagem"
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendText(); } }}
          />
          <button className={`vo-toggle ${voArmed ? 'on' : ''}`} title="Áudio de audição única"
            onClick={() => { setVoArmed((v) => !v); showToast(voArmed ? 'Áudio normal' : 'Próximo áudio: ouvir 1×'); }}>
            <IconEye />
          </button>
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

      {menuMsg && (
        <>
          <div className="sheet-backdrop" onClick={() => setMenuMsg(null)} />
          <div className="ctx-menu">
            <button onClick={() => doReply(menuMsg)}><IconReply /> Responder</button>
            {menuMsg.kind === 'text' && <button onClick={() => doCopy(menuMsg)}><IconCopy /> Copiar</button>}
            {menuMsg.from === me.id && menuMsg.kind !== 'deleted' && (
              <button className="danger" onClick={() => doDeleteForAll(menuMsg)}><IconTrash /> Apagar para todos</button>
            )}
            <button className="danger" onClick={() => doDeleteForMe(menuMsg)}><IconTrash /> Apagar para mim</button>
            <button onClick={() => setMenuMsg(null)}>Cancelar</button>
          </div>
        </>
      )}

      {renameOpen && (
        <div className="viewonce-modal" onClick={() => setRenameOpen(false)}>
          <div className="mini-modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0 }}>Nome do contacto</h3>
            <input placeholder={partnerName} value={aliasInput} onChange={(e) => setAliasInput(e.target.value)} autoFocus />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-primary" style={{ flex: 1 }} onClick={saveAlias}>Guardar</button>
              <button className="btn-ghost" onClick={() => { savePartnerAlias(''); setRenameOpen(false); onProfileChanged?.(); }}>Repor</button>
            </div>
          </div>
        </div>
      )}

      {viewOnceSrc && (
        <div className="viewonce-modal" onClick={() => setViewOnceSrc(null)}>
          <button className="close-x" onClick={() => setViewOnceSrc(null)}><IconClose /></button>
          <img src={viewOnceSrc} alt="" />
        </div>
      )}
      {voAudio && (
        <div className="viewonce-modal" onClick={() => setVoAudio(null)}>
          <div className="mini-modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0 }}>Áudio — só uma vez</h3>
            <audio controls autoPlay src={voAudio} onEnded={() => setTimeout(() => setVoAudio(null), 500)}></audio>
            <button className="btn-ghost" onClick={() => setVoAudio(null)}>Fechar</button>
          </div>
        </div>
      )}
      {editorFiles && (
        <ImageEditor
          files={editorFiles}
          startViewOnce={editorVO}
          onCancel={() => setEditorFiles(null)}
          onSend={handleEditorSend}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
