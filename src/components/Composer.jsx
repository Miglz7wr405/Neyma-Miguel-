import { useRef, useState } from 'react';
import { IconSend, IconMic, IconAttach, IconEye } from '../lib/icons.jsx';

// Isolated so typing never re-renders the message list (perf).
export default function Composer({ onSend, onTyping, onAttach, onMic, voArmed, onToggleVo, recording }) {
  const [text, setText] = useState('');
  const taRef = useRef(null);
  const typingTimer = useRef(null);

  function autoGrow() {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, Math.round(window.innerHeight * 0.4)) + 'px';
  }

  function change(v) {
    setText(v);
    requestAnimationFrame(autoGrow);
    if (!typingTimer.current) onTyping?.(true);
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => { onTyping?.(false); typingTimer.current = null; }, 1200);
  }

  function send() {
    const body = text.trim();
    if (!body) return;
    onSend(body);
    setText('');
    requestAnimationFrame(() => { if (taRef.current) taRef.current.style.height = 'auto'; });
    onTyping?.(false);
    clearTimeout(typingTimer.current);
    typingTimer.current = null;
  }

  return (
    <div className="composer">
      <button className="icon-btn" onClick={onAttach}><IconAttach /></button>
      <div className="field">
        <textarea
          ref={taRef}
          rows={1}
          placeholder="Mensagem"
          value={text}
          onChange={(e) => change(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
        />
        <button className={`vo-toggle ${voArmed ? 'on' : ''}`} title="Áudio de audição única" onClick={onToggleVo}>
          <IconEye />
        </button>
      </div>
      {text.trim() ? (
        <button className="send-btn" onClick={send}><IconSend /></button>
      ) : (
        <button
          className={`send-btn ${recording ? 'recording' : ''}`}
          onMouseDown={onMic.start}
          onMouseUp={onMic.stop}
          onMouseLeave={onMic.leave}
          onTouchStart={(e) => { e.preventDefault(); onMic.start(); }}
          onTouchEnd={(e) => { e.preventDefault(); onMic.stop(); }}
        >
          <IconMic />
        </button>
      )}
    </div>
  );
}
