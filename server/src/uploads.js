import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { uploadsDir } from './db.js';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const id = crypto.randomBytes(12).toString('hex');
    const ext = path.extname(file.originalname || '') || guessExt(file.mimetype);
    cb(null, `${id}${ext}`);
  },
});

function guessExt(mt = '') {
  if (mt.includes('webm')) return '.webm';
  if (mt.includes('ogg')) return '.ogg';
  if (mt.includes('mp4')) return '.mp4';
  if (mt.includes('mpeg')) return '.mp3';
  if (mt.includes('wav')) return '.wav';
  if (mt.includes('png')) return '.png';
  if (mt.includes('jpeg') || mt.includes('jpg')) return '.jpg';
  if (mt.includes('gif')) return '.gif';
  if (mt.includes('webp')) return '.webp';
  return '';
}

export const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB per file
});

export function deleteFileSafe(p) {
  if (p && fs.existsSync(p)) {
    try { fs.unlinkSync(p); } catch {}
  }
}

export { uploadsDir };
