import { useEffect, useRef, useState, memo, useCallback, lazy, Suspense } from 'react';
import {
  newClientId, saveMessage, enqueue, getMessages,
  markConsumedByClientId, deleteForMe, markDeleted,
} from '../lib/localdb.js';
import {
  recordAudio, pickFile, capturePhoto, pickImages, fileToDataURL, getLocation, humanSize,
} from '../lib/media.js';
import Composer from '../components/Composer.jsx';
import PhotoViewer from '../components/PhotoViewer.jsx';
import { partnerDisplayName, getPartnerProfile, savePartnerAlias } from '../lib/auth.js';
import {
  IconCamera, IconImage, IconEye, IconTick, IconDoubleTick,
  IconClose, IconReply, IconTrash, IconCopy, IconPencil, IconDoc, IconPin, IconPlay,
} from '../lib/icons.jsx';

const ImageEditor = lazy(() => import('../components/ImageEditor.jsx'));

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

function Quoted({ reply, me, partnerName, onJump }) {
  if (!reply) return null;
  const who = reply.from === me.id ? 'Tu' : partnerName;
  return (
    <div className="quoted" onClick={(e) => { e.stopPropagation(); onJump?.(reply.clientId); }}>
      <div className="quoted-who">{who}</div>
      <div className="quoted-text">{reply.preview}</div>
    </div>
  );
}

const Bubble = memo(function Bubble({ msg, me, partnerName, onOpenViewOnce, onReply, onLongPress, onJump, onPlayVoiceOnce, registerRef }) {
  const mine = msg.from === me.id;
  const [dx, setDx] = useState(0);
  const start = useRef(null);
  const moved = useRef(false);
  const lpTimer = useRef(null);
  const setRef = (el) => registerRef(msg.clientId, el);

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
    inner = <><span className="msg-text">{msg.body}</span>{foot}</>;
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
      inner = <><audio controls src={msg.mediaData} preload="none"></audio>{foot}</>;
    }
  } else if (msg.kind === 'photo') {
    if (msg.viewOnce) {
      const canOpen = !msg.consumed && !mine;
      return (
        <div ref={setRef} className="bubble-wrap" style={{ transform: `translateX(${dx}px)` }}
          onTouchStart={(e) => down(e.touches[0].clientX, e.touches[0].clientY)}
          onTouchMove={(e) => move(e.touches[0].clientX, e.touches[0].clientY)}
          onTouchEnd={up}
          onContextMenu={(e) => { e.preventDefault(); onLongPress?.(msg); }}>
          {dx > 10 && <span className="swipe-reply"><IconReply /></span>}
          <div className={`bubble viewonce ${msg.consumed ? 'consumed' : ''}`}
            onClick={() => canOpen && onOpenViewOnce(msg)}>
            {msg.consumed
              ? (mine ? `Foto vista pela ${partnerName}` : 'Foto vista')
              : (mine ? 'Foto de visualização única — enviada' : '📷 Toca para ver uma vez')}
            {foot}
          </div>
        </div>
      );
    }
    inner = <><img className="msg-img" src={msg.mediaData} alt="" loading="lazy" decoding="async" />{msg.caption ? <div className="msg-caption">{msg.caption}</div> : null}{foot}</>;
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
    <div ref={setRef} className="bubble-wrap" style={{ transform: `translateX(${dx}px)` }}
      onTouchStart={(e) => down(e.touches[0].clientX, e.touches[0].clientY)}
      onTouchMove={(e) => move(e.touches[0].clientX, e.touches[0].clientY)}
      onTouchEnd={up}
      onContextMenu={(e) => { e.preventDefault(); onLongPress?.(msg); }}>
      {dx > 10 && <span className="swipe-reply"><IconReply /></span>}
      <div className={cls}>
        {msg.replyTo && msg.kind !== 'deleted' && <Quoted reply={msg.replyTo} me={me} partnerName={partnerName} onJump={onJump} />}
        {inner}
      </div>
    </div>
  );
}, (a, b) => {
  const x = a.msg, y = b.msg;
  return a.partnerName === b.partnerName &&
    x.localId === y.localId && x.deliveredAt === y.deliveredAt &&
    x.readAt === y.readAt && x.consumed === y.consumed &&
    x.kind === y.kind && x.body === y.body && x.caption === y.caption &&
    x.mediaData === y.mediaData && x.replyTo === y.replyTo &&
    a.onReply === b.onReply && a.onLongPress === b.onLongPress &&
    a.onJump === b.onJump && a.onOpenViewOnce === b.onOpenViewOnce &&
    a.onPlayVoiceOnce === b.onPlayVoiceOnce && a.registerRef === b.registerRef;
});

function forWire(m) {
  const { localId, deliveredAt, readAt, ...rest } = m;
  return rest;
}

export default function ChatScreen({ me, partner, partnerOnline, partnerTyping, messages, refresh, bus, online, onProfileChanged }) {
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
  const [visibleCount, setVisibleCount] = useState(50);
  const [showPartnerPhoto, setShowPartnerPhoto] = useState(false);
  const bodyRef = useRef(null);
  const recRef = useRef(null);
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

  const openViewOnce = useCallback((msg) => {
    setViewOnceSrc(msg.mediaData);
    markConsumedByClientId(msg.clientId).then(refresh);
    bus.publishCtrl({ t: 'consumed', clientId: msg.clientId });
  }, [bus, refresh]);
  const playVoiceOnce = useCallback((msg) => {
    setVoAudio(msg.mediaData);
    markConsumedByClientId(msg.clientId).then(refresh);
    bus.publishCtrl({ t: 'consumed', clientId: msg.clientId });
  }, [bus, refresh]);

  const registerRef = useCallback((clientId, el) => {
    if (clientId && el) bubbleRefs.current[clientId] = el;
  }, []);

  const jumpTo = useCallback((clientId) => {
    const el = bubbleRefs.current[clientId];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), 1200);
    }
  }, []);

  // Context-menu actions
  const doReply = useCallback((m) => { setReplyTarget(m); setMenuMsg(null); }, []);
  const onLongPress = useCallback((m) => setMenuMsg(m), []);
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

  // Windowing: only render the most recent `visibleCount` messages.
  const hasMore = messages.length > visibleCount;
  const windowed = hasMore ? messages.slice(messages.length - visibleCount) : messages;
  const rows = [];
  let lastDay = '';
  for (const m of windowed) {
    const d = fmtDay(m.createdAt);
    if (d !== lastDay) { rows.push({ divider: d, key: `d-${d}-${m.createdAt}` }); lastDay = d; }
    rows.push({ msg: m, key: `m-${m.localId || m.clientId}` });
  }
  const lastMine = [...messages].reverse().find((m) => m.from === me.id && m.kind !== 'deleted');
  const seenLabel = lastMine?.readAt ? `Visto às ${fmtTime(lastMine.readAt)}` : null;

  return (
    <>
      <header className="header">
        <div className="avatar" onClick={() => setShowPartnerPhoto(true)} style={{ cursor: 'pointer' }}>
          {partnerAvatar ? <img src={partnerAvatar} alt="" /> : partnerName[0]}
        </div>
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
        {hasMore && (
          <button className="load-more" onClick={() => setVisibleCount((c) => c + 50)}>
            Ver mensagens anteriores
          </button>
        )}
        {rows.map((row) =>
          row.divider ? (
            <div key={row.key} className="day-divider">{row.divider}</div>
          ) : (
            <Bubble
              key={row.key}
              msg={row.msg}
              me={me}
              partnerName={partnerName}
              registerRef={registerRef}
              onOpenViewOnce={openViewOnce}
              onPlayVoiceOnce={playVoiceOnce}
              onReply={doReply}
              onLongPress={onLongPress}
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

      <Composer
        onSend={(body) => sendPayload({ kind: 'text', body })}
        onTyping={(b) => bus.publishCtrl({ t: 'typing', typing: b })}
        onAttach={() => setAttachOpen((v) => !v)}
        voArmed={voArmed}
        onToggleVo={() => { setVoArmed((v) => !v); showToast(voArmed ? 'Áudio normal' : 'Próximo áudio: ouvir 1×'); }}
        recording={recording}
        onMic={{
          start: startRec,
          stop: stopRec,
          leave: () => recording && cancelRec(),
        }}
      />

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
      {showPartnerPhoto && (
        <PhotoViewer
          src={partnerAvatar}
          letter={partnerName[0]}
          title={partnerName}
          onClose={() => setShowPartnerPhoto(false)}
        />
      )}
      {editorFiles && (
        <Suspense fallback={<div className="img-editor"><div className="ie-loading">A abrir editor…</div></div>}>
          <ImageEditor
            files={editorFiles}
            startViewOnce={editorVO}
            onCancel={() => setEditorFiles(null)}
            onSend={handleEditorSend}
          />
        </Suspense>
      )}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
