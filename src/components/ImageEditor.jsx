import { useEffect, useRef, useState } from 'react';
import { fileToDataURL, loadImage } from '../lib/media.js';
import { IconClose, IconSend, IconEye, IconCrop, IconText, IconRotate, IconCheck, IconImage } from '../lib/icons.jsx';

const TEXT_COLORS = ['#ffffff', '#ff2d95', '#ffd93d', '#3ea6ff', '#48d18a', '#111111'];

async function rotate90(src) {
  const img = await loadImage(src);
  const W = img.naturalWidth, H = img.naturalHeight;
  const c = document.createElement('canvas');
  c.width = H; c.height = W;
  const ctx = c.getContext('2d');
  ctx.translate(H / 2, W / 2);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(img, -W / 2, -H / 2);
  return c.toDataURL('image/jpeg', 0.92);
}

async function cropSrc(src, rect) {
  const img = await loadImage(src);
  const W = img.naturalWidth, H = img.naturalHeight;
  const sx = Math.max(0, rect.x * W), sy = Math.max(0, rect.y * H);
  const sw = Math.min(W - sx, rect.w * W), sh = Math.min(H - sy, rect.h * H);
  const c = document.createElement('canvas');
  c.width = Math.round(sw); c.height = Math.round(sh);
  c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return c.toDataURL('image/jpeg', 0.92);
}

async function compose(item) {
  const img = await loadImage(item.src);
  let W = img.naturalWidth, H = img.naturalHeight;
  const maxDim = 1024;
  const sc = Math.max(W, H) > maxDim ? maxDim / Math.max(W, H) : 1;
  const cw = Math.round(W * sc), ch = Math.round(H * sc);
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, cw, ch);
  for (const t of item.texts) {
    const fs = Math.max(18, Math.round(0.07 * ch));
    ctx.font = `700 ${fs}px -apple-system, Segoe UI, Roboto, sans-serif`;
    ctx.fillStyle = t.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 6;
    ctx.fillText(t.text, t.xFrac * cw, t.yFrac * ch);
  }
  return c.toDataURL('image/jpeg', 0.7);
}

export default function ImageEditor({ files, startViewOnce, onCancel, onSend }) {
  const [items, setItems] = useState([]);
  const [idx, setIdx] = useState(0);
  const [mode, setMode] = useState('none'); // none | crop | text
  const [crop, setCrop] = useState({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
  const [activeText, setActiveText] = useState(null);
  const [busy, setBusy] = useState(false);
  const imgRef = useRef(null);
  const dragRef = useRef(null);

  useEffect(() => {
    (async () => {
      const arr = [];
      for (const f of files) {
        const src = await fileToDataURL(f);
        arr.push({ src, caption: '', viewOnce: !!startViewOnce, texts: [] });
      }
      setItems(arr);
    })();
  }, [files, startViewOnce]);

  if (!items.length) return <div className="img-editor"><div className="ie-loading">A preparar…</div></div>;

  const item = items[idx];
  const update = (patch) => setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  async function doRotate() {
    setBusy(true);
    update({ src: await rotate90(item.src), texts: [] });
    setBusy(false);
  }

  async function applyCrop() {
    setBusy(true);
    update({ src: await cropSrc(item.src, crop), texts: [] });
    setCrop({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
    setMode('none');
    setBusy(false);
  }

  function addText() {
    const t = { id: Math.random().toString(36).slice(2, 7), text: 'Texto', color: '#ffffff', xFrac: 0.5, yFrac: 0.5 };
    update({ texts: [...item.texts, t] });
    setActiveText(t.id);
    setMode('text');
  }
  function updateText(id, patch) {
    update({ texts: item.texts.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
  }
  function removeText(id) {
    update({ texts: item.texts.filter((t) => t.id !== id) });
    if (activeText === id) setActiveText(null);
  }

  // Pointer helpers mapping to image box fractions
  function fracFromEvent(e) {
    const r = imgRef.current.getBoundingClientRect();
    const px = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
    const py = (e.touches ? e.touches[0].clientY : e.clientY) - r.top;
    return { x: Math.min(1, Math.max(0, px / r.width)), y: Math.min(1, Math.max(0, py / r.height)) };
  }

  function startTextDrag(e, t) {
    e.stopPropagation();
    dragRef.current = { type: 'text', id: t.id };
  }
  function startCropDrag(e, corner) {
    e.stopPropagation();
    dragRef.current = { type: 'crop', corner };
  }
  function onMove(e) {
    if (!dragRef.current) return;
    const f = fracFromEvent(e);
    if (dragRef.current.type === 'text') {
      updateText(dragRef.current.id, { xFrac: f.x, yFrac: f.y });
    } else if (dragRef.current.type === 'crop') {
      setCrop((c) => {
        let { x, y, w, h } = c;
        const corner = dragRef.current.corner;
        if (corner.includes('l')) { const nx = Math.min(f.x, x + w - 0.1); w += x - nx; x = nx; }
        if (corner.includes('r')) { w = Math.max(0.1, f.x - x); }
        if (corner.includes('t')) { const ny = Math.min(f.y, y + h - 0.1); h += y - ny; y = ny; }
        if (corner.includes('b')) { h = Math.max(0.1, f.y - y); }
        return { x, y, w: Math.min(w, 1 - x), h: Math.min(h, 1 - y) };
      });
    }
  }
  function endDrag() { dragRef.current = null; }

  async function send() {
    setBusy(true);
    const out = [];
    for (const it of items) {
      const dataURL = await compose(it);
      out.push({ dataURL, caption: it.caption.trim(), viewOnce: it.viewOnce });
    }
    onSend(out);
  }

  return (
    <div className="img-editor"
      onMouseMove={onMove} onMouseUp={endDrag}
      onTouchMove={onMove} onTouchEnd={endDrag}>
      <div className="ie-top">
        <button className="icon-btn" onClick={onCancel}><IconClose /></button>
        <div className="ie-tools">
          <button className={item.viewOnce ? 'on' : ''} onClick={() => update({ viewOnce: !item.viewOnce })} title="Ver uma vez"><IconEye /></button>
          <button className={mode === 'crop' ? 'on' : ''} onClick={() => setMode(mode === 'crop' ? 'none' : 'crop')} title="Recortar"><IconCrop /></button>
          <button onClick={doRotate} title="Rodar"><IconRotate /></button>
          <button className={mode === 'text' ? 'on' : ''} onClick={addText} title="Texto"><IconText /></button>
        </div>
      </div>

      <div className="ie-stage">
        <div className="ie-imgwrap">
          <img ref={imgRef} src={item.src} alt="" draggable={false} />
          {/* text layers */}
          {item.texts.map((t) => (
            <div key={t.id}
              className={`ie-text ${activeText === t.id ? 'active' : ''}`}
              style={{ left: `${t.xFrac * 100}%`, top: `${t.yFrac * 100}%`, color: t.color }}
              onMouseDown={(e) => startTextDrag(e, t)}
              onTouchStart={(e) => startTextDrag(e, t)}
              onClick={(e) => { e.stopPropagation(); setActiveText(t.id); setMode('text'); }}>
              {t.text || ' '}
            </div>
          ))}
          {/* crop overlay */}
          {mode === 'crop' && (
            <div className="ie-crop" style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%` }}>
              {['tl', 'tr', 'bl', 'br'].map((c) => (
                <span key={c} className={`ie-handle ${c}`}
                  onMouseDown={(e) => startCropDrag(e, c)}
                  onTouchStart={(e) => startCropDrag(e, c)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {mode === 'text' && activeText && (
        <div className="ie-textbar">
          <input autoFocus value={item.texts.find((t) => t.id === activeText)?.text || ''}
            onChange={(e) => updateText(activeText, { text: e.target.value })}
            placeholder="Escreve…" />
          <div className="ie-colors">
            {TEXT_COLORS.map((c) => (
              <span key={c} className="sw" style={{ background: c }} onClick={() => updateText(activeText, { color: c })} />
            ))}
          </div>
          <button className="icon-btn" onClick={() => removeText(activeText)}><IconClose /></button>
          <button className="icon-btn accent" onClick={() => setMode('none')}><IconCheck /></button>
        </div>
      )}

      {mode === 'crop' && (
        <div className="ie-cropbar">
          <button className="btn-ghost" onClick={() => { setMode('none'); setCrop({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 }); }}>Cancelar</button>
          <button className="btn-primary" onClick={applyCrop}>Recortar</button>
        </div>
      )}

      {mode === 'none' && (
        <div className="ie-bottom">
          {items.length > 1 && (
            <div className="ie-thumbs">
              {items.map((it, i) => (
                <img key={i} src={it.src} alt="" className={i === idx ? 'on' : ''} onClick={() => setIdx(i)} />
              ))}
            </div>
          )}
          <div className="ie-caption-row">
            <span className="cap-ic"><IconImage /></span>
            <input placeholder="Adicionar legenda…" value={item.caption}
              onChange={(e) => update({ caption: e.target.value })} />
            <button className="send-btn" disabled={busy} onClick={send}><IconSend /></button>
          </div>
        </div>
      )}
    </div>
  );
}
