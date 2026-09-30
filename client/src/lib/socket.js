import { io } from 'socket.io-client';
import { getToken } from './auth.js';

let socket = null;

export function getSocket() {
  if (socket) return socket;
  socket = io({
    auth: { token: getToken() },
    autoConnect: true,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
