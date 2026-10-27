const {putObject}=require('./object-storage');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');

const STORAGE_ROOT = process.env.VERCEL
  ? path.join(os.tmpdir(), 'shop_by_scha_storage')
  : path.join(__dirname, '..', 'storage');
const PRIVATE_RECEIPTS_DIR = path.join(STORAGE_ROOT, 'private_receipts');
const MERCHANT_QR_DIR = path.join(STORAGE_ROOT, 'merchant_qr');
const PUBLIC_UPLOADS_DIR = process.env.VERCEL
  ? path.join(STORAGE_ROOT, 'uploads')
  : path.join(__dirname, '..', 'public', 'uploads');

for (const dir of [PRIVATE_RECEIPTS_DIR, MERCHANT_QR_DIR, PUBLIC_UPLOADS_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

function detectMimeFromBuffer(buf, fallbackMime = '') {
  if (!buf || buf.length < 4) return null;
  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { mime: 'image/png', ext: '.png' };
  }
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mime: 'image/jpeg', ext: '.jpg' };
  }
  // PDF: 25 50 44 46 (%PDF)
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) {
    return { mime: 'application/pdf', ext: '.pdf' };
  }
  return null;
}

async function savePrivateReceipt(fileBuffer, originalFilename = 'receipt.png') {
  if (!fileBuffer || fileBuffer.length === 0) {
    throw new Error('Receipt file is required.');
  }
  if (fileBuffer.length > MAX_UPLOAD_BYTES) {
    throw new Error('Receipt file exceeds the 10MB maximum size limit.');
  }
  const detected = detectMimeFromBuffer(fileBuffer);
  if (!detected) {
    throw new Error('Invalid receipt file format. Only JPG, PNG, and PDF files are accepted.');
  }

  const safeOriginal = String(originalFilename).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  const randomName = `receipt_${Date.now()}_${crypto.randomBytes(12).toString('hex')}${detected.ext}`;
  const fullPath = path.join(PRIVATE_RECEIPTS_DIR, randomName);
  await putObject('receipts/'+randomName,fileBuffer,detected.mime,fullPath);

  return {
    filename: randomName,
    originalName: safeOriginal || `receipt${detected.ext}`,
    mimeType: detected.mime,
    sizeBytes: fileBuffer.length
  };
}

async function savePublicMedia(fileBuffer, originalFilename = 'image.png', prefix = 'media') {
  if (!fileBuffer || fileBuffer.length === 0) {
    throw new Error('Media file is empty.');
  }
  if (fileBuffer.length > MAX_UPLOAD_BYTES) {
    throw new Error('Media file exceeds the 10MB maximum size limit.');
  }
  const detected = detectMimeFromBuffer(fileBuffer);
  if (!detected || (detected.mime !== 'image/png' && detected.mime !== 'image/jpeg')) {
    throw new Error('Invalid image format. Only PNG and JPG images are accepted.');
  }
  const randomName = `${prefix}_${Date.now()}_${crypto.randomBytes(8).toString('hex')}${detected.ext}`;
  const fullPath = path.join(PUBLIC_UPLOADS_DIR, randomName);
  await putObject('media/'+randomName,fileBuffer,detected.mime,fullPath);
  return {
    publicPath: `/uploads/${randomName}`,
    mimeType: detected.mime,
    sizeBytes: fileBuffer.length
  };
}

// Parse multipart/form-data or application/json from an incoming HTTP request
function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;

    req.on('data', (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_UPLOAD_BYTES + 1024 * 512) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      try {
        const rawBuf = Buffer.concat(chunks);
        const contentType = req.headers['content-type'] || '';

        if (contentType.includes('multipart/form-data')) {
          const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
          if (!boundaryMatch) {
            return resolve({ fields: {}, files: {} });
          }
          const boundary = `--${boundaryMatch[1] || boundaryMatch[2]}`;
          const boundaryBuf = Buffer.from(boundary);
          const fields = {};
          const files = {};

          let start = rawBuf.indexOf(boundaryBuf);
          while (start !== -1) {
            const next = rawBuf.indexOf(boundaryBuf, start + boundaryBuf.length);
            if (next === -1) break;

            const partBuf = rawBuf.subarray(start + boundaryBuf.length + 2, next - 2);
            const headerEnd = partBuf.indexOf(Buffer.from('\r\n\r\n'));
            if (headerEnd !== -1) {
              const headerStr = partBuf.subarray(0, headerEnd).toString('utf8');
              const bodyBuf = partBuf.subarray(headerEnd + 4);
              const nameMatch = headerStr.match(/name="([^"]+)"/i);
              const filenameMatch = headerStr.match(/filename="([^"]*)"/i);
              const contentTypeMatch = headerStr.match(/Content-Type:\s*([^\r\n]+)/i);

              if (nameMatch) {
                const fieldName = nameMatch[1];
                if (filenameMatch && filenameMatch[1]) {
                  files[fieldName] = {
                    filename: filenameMatch[1],
                    contentType: contentTypeMatch ? contentTypeMatch[1].trim() : 'application/octet-stream',
                    buffer: bodyBuf
                  };
                } else {
                  fields[fieldName] = bodyBuf.toString('utf8');
                }
              }
            }
            start = next;
          }
          return resolve({ fields, files, isMultipart: true });
        }

        if (rawBuf.length === 0) {
          return resolve({});
        }

        const str = rawBuf.toString('utf8');
        if (contentType.includes('application/json') || str.trim().startsWith('{')) {
          return resolve(JSON.parse(str));
        }
        return resolve({ raw: str });
      } catch (err) {
        reject(err);
      }
    });

    req.on('error', reject);
  });
}

module.exports = {
  PRIVATE_RECEIPTS_DIR,
  PUBLIC_UPLOADS_DIR,
  detectMimeFromBuffer,
  savePrivateReceipt,
  savePublicMedia,
  parseRequestBody
};
