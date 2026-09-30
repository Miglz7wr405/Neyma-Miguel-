import { useEffect, useMemo, useState } from 'react';
import { getSocket, disconnectSocket } from '../lib/socket.js';
import { getUser, getPartner, logout as authLogout } from '../lib/auth.js';
import { saveMessage, lastServerId, markConsumed, markReadUpTo, getMessages, drainOutbox, db as ldb } from '../lib/localdb.js';
import { fetchMessagesSince } from '../lib/api.js';
import { IconChat, IconStatus, IconSettings } from '../lib/icons.jsx';
import ChatScreen from './ChatScreen.jsx';
import StatusScreen from './StatusScreen.jsx';
import SettingsScreen from './SettingsScreen.jsx';

export default function MainScreen({ onLogout, onThemeChange }) {
  const me = getUser();
  const partner = getPartner();
  const [tab, setTab] = useState('chats');
  const [online, setOnline] = useState(navigator.onLine);
  const [partnerOnline, setPartnerOnline] = useState(false);
  const [messages, setMessages] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [tick, setTick] = useState(0);
  const socket = useMemo(() => getSocket(), []);

  useEffect(() => {
    const onlineFn = () => setOnline(true);
    const offlineFn = () => setOnline(false);
    window.addEventListener('online', onlineFn);
    window.addEventListener('offline', offlineFn);
    return () => {
      window.removeEventListener('online', onlineFn);
      window.removeEventListener('offline', offlineFn);
    };
  }, []);

  // Initial load: from local DB, then sync from server since lastId
  useEffect(() => {
    (async () => {
      const local = await getMessages();
      setMessages(local);
      const since = await lastServerId();
      try {
        const rows = await fetchMessagesSince(since);
        for (const m of rows) {
          await saveMessage({
            id: m.id,
            clientId: m.clientId,
            from: m.from,
            to: m.to,
            kind: m.kind,
            body: m.body,
            mediaPath: m.mediaPath,
            viewOnce: m.viewOnce,
            consumed: m.consumed,
            deliveredAt: m.deliveredAt,
            readAt: m.readAt,
            createdAt: m.createdAt,
          });
        }
        setMessages(await getMessages());
      } catch (e) {
        console.warn('sync failed', e);
      }
    })();
  }, [tick]);

  // Socket wiring
  useEffect(() => {
    const handleNew = async (m) => {
      await saveMessage({ ...m });
      setMessages(await getMessages());
    };
    const handleRead = async ({ upToId, readAt }) => {
      await markReadUpTo(upToId, readAt);
      setMessages(await getMessages());
    };
    const handleConsumed = async ({ id }) => {
      await markConsumed(id);
      setMessages(await getMessages());
    };
    const handlePresence = ({ user, online }) => {
      if (user === partner.id) setPartnerOnline(!!online);
    };
    const handleStatusNew = (s) => {
      setStatuses((prev) => [s, ...prev.filter((p) => p.id !== s.id)]);
    };

    socket.on('message:new', handleNew);
    socket.on('message:read', handleRead);
    socket.on('message:consumed', handleConsumed);
    socket.on('presence', handlePresence);
    socket.on('status:new', handleStatusNew);
    socket.on('connect', () => setTick((v) => v + 1));

    return () => {
      socket.off('message:new', handleNew);
      socket.off('message:read', handleRead);
      socket.off('message:consumed', handleConsumed);
      socket.off('presence', handlePresence);
      socket.off('status:new', handleStatusNew);
    };
  }, [socket, partner.id]);

  // Drain offline outbox when we come online
  useEffect(() => {
    if (!online || !socket.connected) return;
    drainOutbox(async (item) => {
      return new Promise((resolve, reject) => {
        socket.emit('message:send', item, (ack) => {
          if (ack?.ok) resolve();
          else reject(new Error('ack failed'));
        });
      });
    }).then(async () => setMessages(await getMessages()));
  }, [online, socket, tick]);

  const logout = () => {
    disconnectSocket();
    authLogout();
    onLogout();
  };

  return (
    <div className="screen">
      {!online && <div className="offline-banner">Sem ligação — vais enviar quando voltar</div>}
      {tab === 'chats' && (
        <ChatScreen
          me={me}
          partner={partner}
          partnerOnline={partnerOnline}
          messages={messages}
          setMessages={setMessages}
          socket={socket}
          online={online}
        />
      )}
      {tab === 'status' && (
        <StatusScreen
          me={me}
          partner={partner}
          statuses={statuses}
          setStatuses={setStatuses}
          socket={socket}
        />
      )}
      {tab === 'settings' && (
        <SettingsScreen
          me={me}
          onLogout={logout}
          onThemeChange={onThemeChange}
        />
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
