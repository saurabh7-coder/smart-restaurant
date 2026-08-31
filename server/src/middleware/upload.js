import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import multer from 'multer';
import { ApiError } from '../utils/ApiError.js';

export const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');

/**
 * Whether this process can actually write uploads.
 *
 * On a serverless host the filesystem is read-only, and this `mkdirSync` runs
 * at *import* time — so an unguarded call does not merely break uploading, it
 * throws while the module is being loaded and takes the entire API down with
 * it. The failure is caught here and turned into a flag, so the rest of the
 * app boots and only the upload route reports the limitation.
 */
export const canWriteUploads = (() => {
  try {
    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    fs.accessSync(UPLOAD_DIR, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
})();

const ALLOWED = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
]);

/*
 * In-memory when the disk is read-only. The upload is rejected below before
 * anything is persisted, so this only needs to keep multer from touching the
 * filesystem while it parses the request.
 */
const storage = !canWriteUploads
  ? multer.memoryStorage()
  : multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    // Never trust the client-supplied filename — it can contain path traversal.
    const ext = ALLOWED.get(file.mimetype) || '.bin';
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
    });

export const uploadImage = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED.has(file.mimetype)) {
      return cb(ApiError.badRequest('Only JPG, PNG, WEBP or GIF images are allowed.'));
    }
    return cb(null, true);
  },
}).single('image');

/** Wraps multer so its errors flow through the standard error handler. */
export function handleImageUpload(req, res, next) {
  uploadImage(req, res, (err) => {
    if (err) return next(err);

    if (req.file && !canWriteUploads) {
      /*
       * Say so rather than pretending it worked. Serverless hosts do offer a
       * writable /tmp, but it is wiped between invocations — an image saved
       * there would upload cleanly, appear on the menu, and 404 minutes later.
       * A clear refusal is far kinder than that.
       */
      return next(
        ApiError.badRequest(
          'This deployment cannot store uploaded images because its filesystem is read-only. ' +
            'Paste an image URL instead, or connect object storage such as Vercel Blob or S3.',
          { image: 'Uploads are disabled on this deployment' },
        ),
      );
    }

    if (req.file) req.body.image = `/uploads/${req.file.filename}`;
    return next();
  });
}
