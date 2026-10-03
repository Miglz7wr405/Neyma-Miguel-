// 1:1 voice call over WebRTC. Signaling rides the encrypted MQTT ctrl channel
// (t:'call'). Media is peer-to-peer. Public STUN only (no TURN) — works on most
// networks; may fail on very strict/symmetric NATs.

const ICE = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
  ],
};

export function createVoice(bus, me, partner, handlers) {
  let pc = null;
  let localStream = null;
  let state = 'idle'; // idle | calling | incoming | connecting | connected
  const pendingIce = [];

  const setState = (s) => { state = s; handlers.onState?.(s); };

  function newPc() {
    const p = new RTCPeerConnection(ICE);
    p.onicecandidate = (e) => { if (e.candidate) bus.publishCtrl({ t: 'call', kind: 'ice', candidate: e.candidate }); };
    p.ontrack = (e) => handlers.onRemote?.(e.streams[0]);
    p.onconnectionstatechange = () => {
      if (p.connectionState === 'connected') setState('connected');
      else if (['failed', 'disconnected', 'closed'].includes(p.connectionState) && state !== 'idle') cleanup(false);
    };
    return p;
  }

  async function getMic() {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
    return localStream;
  }

  async function flushIce() {
    while (pendingIce.length) { try { await pc.addIceCandidate(pendingIce.shift()); } catch {} }
  }

  async function call() {
    if (state !== 'idle') return;
    setState('calling');
    pc = newPc();
    await getMic();
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    bus.publishCtrl({ t: 'call', kind: 'offer', sdp: pc.localDescription });
  }

  async function accept() {
    if (state !== 'incoming' || !pc) return;
    setState('connecting');
    await getMic();
    await flushIce();
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    bus.publishCtrl({ t: 'call', kind: 'answer', sdp: pc.localDescription });
  }

  function cleanup(notify) {
    if (notify && state !== 'idle') bus.publishCtrl({ t: 'call', kind: 'bye' });
    try { localStream?.getTracks().forEach((t) => t.stop()); } catch {}
    try { pc?.close(); } catch {}
    pc = null; localStream = null; pendingIce.length = 0;
    setState('idle');
  }

  function toggleMute() {
    if (!localStream) return false;
    const track = localStream.getAudioTracks()[0];
    if (!track) return false;
    track.enabled = !track.enabled;
    return !track.enabled; // true = muted
  }

  async function onSignal(c) {
    if (c.kind === 'offer') {
      if (state !== 'idle') return; // busy
      pc = newPc();
      await pc.setRemoteDescription(c.sdp);
      await flushIce();
      setState('incoming');
    } else if (c.kind === 'answer') {
      if (pc) { await pc.setRemoteDescription(c.sdp); }
    } else if (c.kind === 'ice') {
      if (pc && pc.remoteDescription) { try { await pc.addIceCandidate(c.candidate); } catch {} }
      else pendingIce.push(c.candidate);
    } else if (c.kind === 'bye') {
      cleanup(false);
    }
  }

  return { call, accept, hangup: () => cleanup(true), toggleMute, onSignal, getState: () => state };
}
