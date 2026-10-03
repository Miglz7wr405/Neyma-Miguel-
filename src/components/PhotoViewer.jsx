import { IconClose } from '../lib/icons.jsx';

export default function PhotoViewer({ src, letter, title, actionLabel, onAction, onClose }) {
  return (
    <div className="photo-viewer" onClick={onClose}>
      <button className="close-x" onClick={onClose}><IconClose /></button>
      {title && <div className="pv-title">{title}</div>}
      <div className="pv-body" onClick={(e) => e.stopPropagation()}>
        {src ? <img src={src} alt="" /> : <div className="pv-letter">{letter}</div>}
      </div>
      {actionLabel && (
        <button className="btn-primary pv-action" onClick={(e) => { e.stopPropagation(); onAction?.(); }}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
