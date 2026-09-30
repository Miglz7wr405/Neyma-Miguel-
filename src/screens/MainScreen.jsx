import { useEffect, useMemo, useRef, useState } from 'react';
import { createBus } from '../lib/mqtt.js';
import { getUser, getPartner, logout as authLogout } from '../lib/auth.js';
import {
  saveMessage,
  getMessages,
  drainOutbox,
  markConsumedByClientId,
  markDeliveredByClientId,
  markReadByClientIds,
  saveStatus,
  getActiveStatuses,
  purgeOldStatuses,
} from '../lib/localdb.js';
import { buildSyncRequest, computeMissing } from '../lib/sync.js';
import { IconChat, IconStatus, IconSettings } from '../lib/icons.jsx';
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
  const messagesRef = useRef([]);
  messagesRef.current = messages;

  const bus = useMemo(() => createBus(me), [me.id]);

  const refresh = async () => setMessages(await getMessages());

  // Load local history + statuses immediately.
  useEffect(() => {
    refresh();
    purgeOldStatuses().then(getActiveStatuses).then(setStatuses);
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
        />
      )}
      {tab === 'status' && (
        <StatusScreen me={me} partner={partner} statuses={statuses} setStatuses={setStatuses} bus={bus} />
      )}
      {tab === 'settings' && (
        <SettingsScreen me={me} onLogout={logout} onThemeChange={onThemeChange} />
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
