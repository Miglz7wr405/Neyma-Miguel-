import { useEffect, useRef, useState } from 'react';
import {
  TRUTHS, QUESTIONS, DARES, MOST_LIKELY, NEVER, ROULETTE, GUESS, WOULD_YOU_RATHER, pick,
} from '../lib/gamedata.js';
import { IconClose, IconHeart, IconSend } from '../lib/icons.jsx';

const CUSTOM_KEY = 'osp:customCards';
const loadCustom = () => { try { return JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]'); } catch { return []; } };
const saveCustom = (a) => localStorage.setItem(CUSTOM_KEY, JSON.stringify(a));

const GAMES = [
  { id: 'truthdare', name: 'Verdade ou Desafio', emoji: '🎯', desc: 'Verdade profunda ou um desafio.', levels: true },
  { id: 'questions', name: 'Perguntas de casal', emoji: '💬', desc: 'Conheçam-se a fundo.', levels: true },
  { id: 'prefer', name: 'O que preferes?', emoji: '⚖️', desc: 'Escolham e revelem.' },
  { id: 'mostlikely', name: 'Quem é mais provável', emoji: '👀', desc: 'Votem quem dos dois.' },
  { id: 'never', name: 'Nunca na vida', emoji: '🙊', desc: 'Já fiz ou nunca?' },
  { id: 'roulette', name: 'Roleta do amor', emoji: '🎡', desc: 'Um desafio romântico à sorte.' },
  { id: 'guess', name: 'Quão bem me conheces?', emoji: '💘', desc: 'Adivinha sobre mim.' },
  { id: 'custom', name: 'Criar o nosso jogo', emoji: '✨', desc: 'As vossas próprias cartas.' },
];

const LEVELS = [{ id: 'suave', name: 'Suave' }, { id: 'profundo', name: 'Profundo' }, { id: 'picante', name: 'Picante' }];

export default function GamesScreen({ me, partner, partnerOnline, bus, onStartCall }) {
  const [game, setGame] = useState(null);
  const [level, setLevel] = useState('profundo');
  const [card, setCard] = useState(null);
  const [myChoice, setMyChoice] = useState(null);
  const [partnerChoice, setPartnerChoice] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [answerText, setAnswerText] = useState('');
  const [custom, setCustom] = useState(loadCustom());
  const [newCard, setNewCard] = useState('');
  const [count, setCount] = useState(0);
  const threadRef = useRef(null);

  useEffect(() => {
    const off = bus.on('ctrl', (c) => {
      if (c.t !== 'game') return;
      if (c.action === 'open') { setGame(c.game); setCard(null); setMyChoice(null); setPartnerChoice(null); setAnswers([]); }
      else if (c.action === 'card') { setGame(c.game); setCard(c.card); setMyChoice(null); setPartnerChoice(null); setAnswers([]); setCount((n) => n + 1); }
      else if (c.action === 'choice') setPartnerChoice(c.value);
      else if (c.action === 'answer') setAnswers((a) => [...a, { by: c.by, name: partner.name, text: c.text }]);
      else if (c.action === 'close') { setGame(null); setCard(null); }
      else if (c.action === 'addcard') { const a = [...loadCustom(), c.text]; saveCustom(a); setCustom(a); }
    });
    return off;
  }, [bus, partner.name]);

  useEffect(() => { if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight; }, [answers]);

  function openGame(id) { setGame(id); setCard(null); setMyChoice(null); setPartnerChoice(null); setAnswers([]); bus.publishCtrl({ t: 'game', action: 'open', game: id }); }
  function closeGame() { setGame(null); setCard(null); bus.publishCtrl({ t: 'game', action: 'close' }); }

  function broadcastCard(c) {
    setCard(c); setMyChoice(null); setPartnerChoice(null); setAnswers([]); setCount((n) => n + 1);
    bus.publishCtrl({ t: 'game', action: 'card', game, card: c });
  }
  function choose(value) { setMyChoice(value); bus.publishCtrl({ t: 'game', action: 'choice', value }); }

  function sendAnswer() {
    const t = answerText.trim();
    if (!t) return;
    setAnswers((a) => [...a, { by: me.id, name: 'Tu', text: t }]);
    bus.publishCtrl({ t: 'game', action: 'answer', text: t });
    setAnswerText('');
  }

  function addCustom() {
    const t = newCard.trim();
    if (!t) return;
    const a = [...custom, t];
    saveCustom(a); setCustom(a); setNewCard('');
    bus.publishCtrl({ t: 'game', action: 'addcard', text: t });
  }

  const nameOf = (id) => (id === me.id ? 'Tu' : partner.name);

  if (!game) {
    return (
      <>
        <header className="header"><h1>Jogos</h1></header>
        <div className="games-menu">
          <div className="games-hero"><IconHeart /> Jogos só para nós dois</div>
          {onStartCall && <button className="voice-cta" onClick={onStartCall}>🎙️ Abrir sala de voz</button>}
          {GAMES.map((g) => (
            <button key={g.id} className="game-card" onClick={() => openGame(g.id)}>
              <span className="game-emoji">{g.emoji}</span>
              <span className="game-meta">
                <span className="game-name">{g.name}</span>
                <span className="game-desc">{g.desc}</span>
              </span>
            </button>
          ))}
          <div className="games-note">
            {partnerOnline ? `${partner.name} está online — joguem juntos!` : `${partner.name} está offline — verá quando entrar.`}
          </div>
        </div>
      </>
    );
  }

  const meta = GAMES.find((g) => g.id === game);
  const revealed = myChoice != null && partnerChoice != null;

  // options for two-choice games (rendered locally so "Eu" is device-correct)
  let opts = null;
  if (game === 'prefer' && card) opts = [{ label: card.a, value: 'a' }, { label: card.b, value: 'b' }];
  if (game === 'mostlikely' && card) opts = [{ label: 'Eu', value: me.id }, { label: partner.name, value: partner.id }];
  if (game === 'never' && card) opts = [{ label: 'Já fiz 😏', value: 'done' }, { label: 'Nunca 🙈', value: 'never' }];
  const labelFor = (val) => {
    if (val == null) return '';
    if (game === 'prefer') return val === 'a' ? card.a : card.b;
    if (game === 'mostlikely') return nameOf(val);
    if (game === 'never') return val === 'done' ? 'Já fiz' : 'Nunca';
    return String(val);
  };

  return (
    <>
      <header className="header">
        <button className="icon-btn" onClick={closeGame}><IconClose /></button>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0 }}>{meta?.name}</h1>
          <p className="sub">{partnerOnline ? `com ${partner.name} • online` : `${partner.name} offline`}{count ? ` • ${count} jogada(s)` : ''}</p>
        </div>
        {onStartCall && <button className="icon-btn accent" title="Sala de voz" onClick={onStartCall}>🎙️</button>}
      </header>

      <div className="game-play">
        {meta?.levels && (
          <div className="level-picker">
            {LEVELS.map((l) => <button key={l.id} className={level === l.id ? 'on' : ''} onClick={() => setLevel(l.id)}>{l.name}</button>)}
          </div>
        )}

        {game === 'truthdare' && (
          <>
            {card ? (
              <div className={`play-card ${card.kind} pop`}>
                <div className="pc-tag">{card.kind === 'truth' ? 'VERDADE' : 'DESAFIO'}</div>
                <div className="pc-text">{card.text}</div>
              </div>
            ) : <div className="play-hint">Escolhe Verdade ou Desafio</div>}
            <div className="play-actions two">
              <button className="btn-primary" onClick={() => broadcastCard({ kind: 'truth', text: TRUTHS[level][pick(TRUTHS[level])] })}>Verdade</button>
              <button className="btn-primary alt" onClick={() => broadcastCard({ kind: 'dare', text: DARES[pick(DARES)] })}>Desafio</button>
            </div>
          </>
        )}

        {game === 'questions' && (
          <>
            {card ? <div className="play-card q pop"><div className="pc-text">{card.text}</div></div> : <div className="play-hint">Puxa uma pergunta</div>}
            <div className="play-actions"><button className="btn-primary" onClick={() => broadcastCard({ kind: 'q', text: QUESTIONS[level][pick(QUESTIONS[level])] })}>{card ? 'Próxima' : 'Puxar pergunta'}</button></div>
          </>
        )}

        {game === 'roulette' && (
          <>
            {card ? <div className="play-card roul pop"><div className="pc-text">{card.text}</div></div> : <div className="play-hint">Gira a roleta do amor</div>}
            <div className="play-actions"><button className="btn-primary" onClick={() => broadcastCard({ kind: 'roul', text: ROULETTE[pick(ROULETTE)] })}>{card ? 'Girar outra vez' : 'Girar 🎡'}</button></div>
          </>
        )}

        {game === 'guess' && (
          <>
            {card ? <div className="play-card guess pop"><div className="pc-text">{card.text}</div></div> : <div className="play-hint">Puxa uma carta e adivinhem</div>}
            <div className="play-actions"><button className="btn-primary" onClick={() => broadcastCard({ kind: 'guess', text: GUESS[pick(GUESS)] })}>{card ? 'Próxima' : 'Puxar carta'}</button></div>
          </>
        )}

        {game === 'custom' && (
          <>
            {card ? <div className="play-card custom pop"><div className="pc-text">{card.text}</div></div> : <div className="play-hint">{custom.length ? 'Puxa uma das vossas cartas' : 'Criem a primeira carta!'}</div>}
            <div className="play-actions"><button className="btn-primary" disabled={!custom.length} onClick={() => broadcastCard({ kind: 'custom', text: custom[pick(custom)] })}>{card ? 'Próxima carta' : 'Puxar carta nossa'}</button></div>
            <div className="custom-add">
              <input placeholder="Escreve uma carta nossa…" value={newCard} onChange={(e) => setNewCard(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCustom()} />
              <button className="btn-primary" onClick={addCustom}>Adicionar</button>
            </div>
            <div className="custom-count">{custom.length} carta(s) nossa(s)</div>
          </>
        )}

        {(game === 'prefer' || game === 'mostlikely' || game === 'never') && (
          <>
            {card ? (
              <>
                {game !== 'prefer' && (
                  <div className={`play-card ${game} pop`}>
                    <div className="pc-text">{game === 'mostlikely' ? `Quem é mais provável a ${card.text}?` : `Nunca na vida eu ${card.text}`}</div>
                  </div>
                )}
                <div className="choice-wrap">
                  {opts.map((o) => {
                    const picked = myChoice === o.value;
                    return (
                      <button key={o.value} className={`choice-opt ${picked ? 'picked' : ''}`} disabled={myChoice != null} onClick={() => choose(o.value)}>
                        {o.label}
                      </button>
                    );
                  })}
                </div>
                {myChoice != null && !revealed && <div className="play-hint">À espera de {partner.name}…</div>}
                {revealed && (
                  <div className="reveal">
                    <div>Tu: <b>{labelFor(myChoice)}</b></div>
                    <div>{partner.name}: <b>{labelFor(partnerChoice)}</b></div>
                    {myChoice === partnerChoice && <div className="reveal-match">Coincidiram! 💞</div>}
                  </div>
                )}
                <div className="play-actions"><button className="btn-primary" onClick={() => drawChoice(game, broadcastCard)}>Próxima</button></div>
              </>
            ) : (
              <div className="play-actions"><button className="btn-primary" onClick={() => drawChoice(game, broadcastCard)}>Começar</button></div>
            )}
          </>
        )}

        {card && (
          <div className="answers">
            <div className="answers-list" ref={threadRef}>
              {answers.length === 0 && <div className="answers-empty">Respondam aqui em tempo real 💬</div>}
              {answers.map((a, i) => <div key={i} className={`ans ${a.by === me.id ? 'me' : 'them'}`}><b>{a.name}:</b> {a.text}</div>)}
            </div>
            <div className="answers-input">
              <input placeholder="Responde aqui…" value={answerText} onChange={(e) => setAnswerText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendAnswer()} />
              <button className="send-btn" onClick={sendAnswer}><IconSend /></button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function drawChoice(game, broadcastCard) {
  if (game === 'prefer') { const [a, b] = WOULD_YOU_RATHER[pick(WOULD_YOU_RATHER)]; broadcastCard({ kind: 'prefer', a, b }); }
  else if (game === 'mostlikely') broadcastCard({ kind: 'mostlikely', text: MOST_LIKELY[pick(MOST_LIKELY)] });
  else if (game === 'never') broadcastCard({ kind: 'never', text: NEVER[pick(NEVER)] });
}
