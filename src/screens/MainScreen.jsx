import { useEffect, useMemo, useRef, useState } from 'react';
import { createBus } from '../lib/mqtt.js';
import {
  getUser, getPartner, logout as authLogout,
  getProfile, savePartnerProfile, partnerDisplayName,
} from '../lib/auth.js';
import {
  saveMessage,
  getMessages,
  drainOutbox,
  enqueue,
  newClientId,
  markConsumedByClientId,
  markDeliveredByClientId,
  markReadByClientIds,
  markDeleted,
  saveStatus,
  getActiveStatuses,
  purgeOldStatuses,
} from '../lib/localdb.js';
import { buildSyncRequest, computeMissing } from '../lib/sync.js';
import { ensureNotifyPermission, notify } from '../lib/notify.js';
import { onInstallAvailable, promptInstall, isStandalone, isIOS } from '../lib/install.js';
import { IconChat, IconStatus, IconSettings, IconDownload, IconClose } from '../lib/icons.jsx';
import ChatScreen from './ChatScreen.jsx';
import StatusScreen from './StatusScreen.jsx';
import SettingsScreen from './SettingsScreen.jsx';

export default function MainScreen({ onLogout, onThemeChange }) {
  const me = getUser();
  const partner = getPartner();
  const [tab, setTab] = useState('chats');
  const [online, setOnline] = useState(false);
  const [partnerOnline, setPartnerOnline] = useState(false);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [messages, setMessages] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [pv, setPv] = useState(0); // bump to re-read profiles/alias
  const [showInstall, setShowInstall] = useState(false);
  const [installDismissed, setInstallDismissed] = useState(false);
  const messagesRef = useRef([]);
  messagesRef.current = messages;

  useEffect(() => onInstallAvailable(setShowInstall), []);

  const bus = useMemo(() => createBus(me), [me.id]);

  const refresh = async () => setMessages(await getMessages());

  function previewFor(m) {
    if (m.kind === 'text') return m.body;
    if (m.kind === 'audio') return '🎙️ Mensagem de voz';
    if (m.kind === 'photo') return m.caption || '📷 Foto';
    if (m.kind === 'document') return `📄 ${m.body || 'Documento'}`;
    if (m.kind === 'location') return '📍 Localização';
    return 'Nova mensagem';
  }

  // Send a chat message (used by ChatScreen is internal; this one is for
  // status replies coming from the Status tab).
  async function sendMessage(payload) {
    const clientId = newClientId();
    const msg = {
      clientId, from: me.id, to: partner.id, createdAt: Date.now(),
      deliveredAt: null, readAt: null, consumed: false, ...payload,
    };
    await saveMessage(msg);
    await refresh();
    const { localId, deliveredAt, readAt, ...wire } = msg;
    if (bus.isConnected()) await bus.publishMessage(wire);
    else await enqueue(wire);
  }

  // Load local history + statuses immediately; ask for notifications.
  useEffect(() => {
    refresh();
    purgeOldStatuses().then(getActiveStatuses).then(setStatuses);
    ensureNotifyPermission();
  }, []);

  useEffect(() => {
    const offs = [];

    offs.push(bus.on('connect', async () => {
      setOnline(true);
      // Flush anything queued while offline.
      await drainOutbox(async (item) => {
        const ok = await bus.publishMessage(item);
        if (!ok) throw new Error('offline');
      });
      await refresh();
      // Ask the partner for anything we missed.
      bus.publishCtrl(buildSyncRequest(messagesRef.current));
      // Share my current profile (name + avatar) so the partner sees it.
      const prof = getProfile();
      bus.publishCtrl({ t: 'profile', name: prof.displayName || me.name, avatar: prof.avatar || null });
    }));

    offs.push(bus.on('disconnect', () => {
      setOnline(false);
      setPartnerOnline(false);
    }));

    offs.push(bus.on('message', async (m) => {
      await saveMessage({ ...m, deliveredAt: null, readAt: null });
      await refresh();
      // Acknowledge delivery to the sender.
      if (m.from === partner.id && m.clientId) {
        bus.publishCtrl({ t: 'delivered', clientId: m.clientId });
        notify(partnerDisplayName(partner), previewFor(m), { tag: 'osp-chat' });
      }
    }));

    offs.push(bus.on('ctrl', async (c) => {
      if (c.t === 'delivered' && c.clientId) {
        await markDeliveredByClientId(c.clientId, Date.now());
        await refresh();
      } else if (c.t === 'read' && Array.isArray(c.clientIds)) {
        await markReadByClientIds(c.clientIds, Date.now());
        await refresh();
      } else if (c.t === 'typing') {
        setPartnerTyping(!!c.typing);
      } else if (c.t === 'consumed' && c.clientId) {
        await markConsumedByClientId(c.clientId);
        await refresh();
      } else if (c.t === 'delete' && c.clientId) {
        await markDeleted(c.clientId);
        await refresh();
      } else if (c.t === 'profile') {
        savePartnerProfile({ name: c.name || undefined, avatar: c.avatar || undefined });
        setPv((v) => v + 1);
      } else if (c.t === 'sync-req') {
        const missing = computeMissing(messagesRef.current, c);
        for (const m of missing) {
          // Re-send only our own authored messages the peer lacks.
          if (m.from === me.id) bus.publishMessage(stripLocal(m));
        }
      }
    }));

    offs.push(bus.on('presence', (p) => {
      if (p.user === partner.id) setPartnerOnline(!!p.online);
    }));

    offs.push(bus.on('status', async (s) => {
      await saveStatus(s);
      setStatuses((prev) => [s, ...prev.filter((x) => x.id !== s.id)]);
    }));

    bus.connect();
    return () => {
      offs.forEach((f) => f());
      bus.destroy();
    };
  }, [bus, me.id, partner.id]);

  const logout = () => {
    bus.destroy();
    authLogout();
    onLogout();
  };

  return (
    <div className="screen">
      {!online && <div className="offline-banner">Sem ligação — as mensagens vão quando voltar a internet</div>}
      {showInstall && !installDismissed && !isStandalone() && !isIOS() && (
        <div className="install-banner">
          <IconDownload />
          <span>Instala o app no ecrã principal</span>
          <button onClick={() => promptInstall()}>Instalar</button>
          <button className="x" onClick={() => setInstallDismissed(true)}><IconClose /></button>
        </div>
      )}
      {tab === 'chats' && (
        <ChatScreen
          me={me}
          partner={partner}
          partnerOnline={partnerOnline}
          partnerTyping={partnerTyping}
          messages={messages}
          refresh={refresh}
          bus={bus}
          online={online}
          onProfileChanged={() => setPv((v) => v + 1)}
        />
      )}
      {tab === 'status' && (
        <StatusScreen
          me={me}
          partner={partner}
          statuses={statuses}
          setStatuses={setStatuses}
          bus={bus}
          onReply={(payload) => { sendMessage(payload); setTab('chats'); }}
        />
      )}
      {tab === 'settings' && (
        <SettingsScreen me={me} bus={bus} onLogout={logout} onThemeChange={onThemeChange} onProfileChanged={() => setPv((v) => v + 1)} />
      )}
      <nav className="bottom-nav">
        <button className={tab === 'chats' ? 'active' : ''} onClick={() => setTab('chats')}>
          <IconChat /> Conversa
        </button>
        <button className={tab === 'status' ? 'active' : ''} onClick={() => setTab('status')}>
          <IconStatus /> Status
        </button>
        <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>
          <IconSettings /> Definições
        </button>
      </nav>
    </div>
  );
}

// Remove device-local bookkeeping before re-broadcasting during sync.
function stripLocal(m) {
  const { localId, deliveredAt, readAt, ...rest } = m;
  return rest;
}
