import { useEffect, useRef, useState } from 'react';
import { TRUTHS, DARES, COUPLE_QUESTIONS, WOULD_YOU_RATHER, pick } from '../lib/gamedata.js';
import { IconClose, IconHeart } from '../lib/icons.jsx';

const CUSTOM_KEY = 'osp:customCards';
const loadCustom = () => { try { return JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]'); } catch { return []; } };
const saveCustom = (a) => localStorage.setItem(CUSTOM_KEY, JSON.stringify(a));

const GAMES = [
  { id: 'truthdare', name: 'Verdade ou Desafio', emoji: '🎯', desc: 'À vez: verdade picante ou desafio.' },
  { id: 'questions', name: 'Perguntas de casal', emoji: '💬', desc: 'Conheçam-se ainda melhor.' },
  { id: 'prefer', name: 'O que preferes?', emoji: '⚖️', desc: 'Escolham e vejam a resposta do outro.' },
  { id: 'custom', name: 'Criar o nosso jogo', emoji: '✨', desc: 'As vossas próprias cartas.' },
];

export default function GamesScreen({ me, partner, partnerOnline, bus }) {
  const [game, setGame] = useState(null);
  const [card, setCard] = useState(null);
  const [myChoice, setMyChoice] = useState(null);
  const [partnerChoice, setPartnerChoice] = useState(null);
  const [custom, setCustom] = useState(loadCustom());
  const [newCard, setNewCard] = useState('');
  const stateRef = useRef({});
  stateRef.current = { game, card };

  useEffect(() => {
    const off = bus.on('ctrl', (c) => {
      if (c.t !== 'game') return;
      if (c.action === 'open') { setGame(c.game); setCard(null); setMyChoice(null); setPartnerChoice(null); }
      else if (c.action === 'card') { setGame(c.game); setCard(c.card); setMyChoice(null); setPartnerChoice(null); }
      else if (c.action === 'choice') { setPartnerChoice(c.value); }
      else if (c.action === 'close') { setGame(null); setCard(null); }
      else if (c.action === 'addcard') { const a = [...loadCustom(), c.text]; saveCustom(a); setCustom(a); }
    });
    return off;
  }, [bus]);

  function openGame(id) {
    setGame(id); setCard(null); setMyChoice(null); setPartnerChoice(null);
    bus.publishCtrl({ t: 'game', action: 'open', game: id });
  }
  function closeGame() {
    setGame(null); setCard(null);
    bus.publishCtrl({ t: 'game', action: 'close' });
  }
  function broadcastCard(c) {
    setCard(c); setMyChoice(null); setPartnerChoice(null);
    bus.publishCtrl({ t: 'game', action: 'card', game, card: c });
  }

  function drawTruth() { broadcastCard({ kind: 'truth', text: TRUTHS[pick(TRUTHS)] }); }
  function drawDare() { broadcastCard({ kind: 'dare', text: DARES[pick(DARES)] }); }
  function drawQuestion() { broadcastCard({ kind: 'q', text: COUPLE_QUESTIONS[pick(COUPLE_QUESTIONS)] }); }
  function drawPrefer() { const [a, b] = WOULD_YOU_RATHER[pick(WOULD_YOU_RATHER)]; broadcastCard({ kind: 'prefer', a, b }); }
  function drawCustom() {
    if (!custom.length) return;
    broadcastCard({ kind: 'custom', text: custom[pick(custom)] });
  }

  function choose(value) {
    setMyChoice(value);
    bus.publishCtrl({ t: 'game', action: 'choice', value });
  }

  function addCustom() {
    const t = newCard.trim();
    if (!t) return;
    const a = [...custom, t];
    saveCustom(a); setCustom(a); setNewCard('');
    bus.publishCtrl({ t: 'game', action: 'addcard', text: t });
  }

  // ---- menu ----
  if (!game) {
    return (
      <>
        <header className="header"><h1>Jogos</h1></header>
        <div className="games-menu">
          <div className="games-hero"><IconHeart /> Jogos só para nós dois</div>
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

  const gameMeta = GAMES.find((g) => g.id === game);

  return (
    <>
      <header className="header">
        <button className="icon-btn" onClick={closeGame}><IconClose /></button>
        <h1 style={{ flex: 1 }}>{gameMeta?.name}</h1>
      </header>
      <div className="game-play">
        {game === 'truthdare' && (
          <>
            {card ? (
              <div className={`play-card ${card.kind}`}>
                <div className="pc-tag">{card.kind === 'truth' ? 'VERDADE' : 'DESAFIO'}</div>
                <div className="pc-text">{card.text}</div>
              </div>
            ) : <div className="play-hint">Escolhe Verdade ou Desafio para começar</div>}
            <div className="play-actions two">
              <button className="btn-primary" onClick={drawTruth}>Verdade</button>
              <button className="btn-primary alt" onClick={drawDare}>Desafio</button>
            </div>
          </>
        )}

        {game === 'questions' && (
          <>
            {card ? <div className="play-card q"><div className="pc-text">{card.text}</div></div>
              : <div className="play-hint">Puxa uma pergunta para começar</div>}
            <div className="play-actions">
              <button className="btn-primary" onClick={drawQuestion}>{card ? 'Próxima pergunta' : 'Puxar pergunta'}</button>
            </div>
          </>
        )}

        {game === 'prefer' && (
          <>
            {card ? (
              <>
                <div className="prefer-wrap">
                  {['a', 'b'].map((side) => {
                    const label = side === 'a' ? card.a : card.b;
                    const picked = myChoice === side;
                    return (
                      <button key={side} className={`prefer-opt ${picked ? 'picked' : ''}`} disabled={!!myChoice} onClick={() => choose(side)}>
                        {label}
                        {myChoice && partnerChoice && (
                          <span className="prefer-tags">
                            {myChoice === side && <em>Tu</em>}
                            {partnerChoice === side && <em>{partner.name}</em>}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {myChoice && !partnerChoice && <div className="play-hint">À espera da escolha de {partner.name}…</div>}
                {myChoice && partnerChoice && (
                  <div className="play-actions"><button className="btn-primary" onClick={drawPrefer}>Próxima</button></div>
                )}
              </>
            ) : (
              <div className="play-actions"><button className="btn-primary" onClick={drawPrefer}>Começar</button></div>
            )}
          </>
        )}

        {game === 'custom' && (
          <>
            {card ? <div className="play-card custom"><div className="pc-text">{card.text}</div></div>
              : <div className="play-hint">{custom.length ? 'Puxa uma das vossas cartas' : 'Ainda não há cartas. Criem a primeira!'}</div>}
            <div className="play-actions">
              <button className="btn-primary" onClick={drawCustom} disabled={!custom.length}>
                {card ? 'Próxima carta' : 'Puxar carta nossa'}
              </button>
            </div>
            <div className="custom-add">
              <input placeholder="Escreve uma carta (pergunta ou desafio)…" value={newCard}
                onChange={(e) => setNewCard(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCustom()} />
              <button className="btn-primary" onClick={addCustom}>Adicionar</button>
            </div>
            <div className="custom-count">{custom.length} carta(s) nossa(s)</div>
          </>
        )}
      </div>
    </>
  );
}
