// ============================================================
//  ToolifyPro – Backend Server (Node.js + Express)
//  Handles: PDF merge, compress, split + image ops
// ============================================================
require('dotenv').config();
const express   = require('express');
const multer    = require('multer');
const cors      = require('cors');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');
const path      = require('path');
const { PDFDocument } = require('pdf-lib');
const sharp     = require('sharp');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use('/api/', limiter);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['application/pdf','image/jpeg','image/png','image/webp','image/gif'];
    ok.includes(file.mimetype) ? cb(null, true) : cb(new Error('File type not allowed'));
  }
});

const err = (res, msg, s=400) => res.status(s).json({ success:false, error:msg });

// ── Health ──────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status:'ok', uptime:process.uptime() }));

// ── PDF Info ────────────────────────────────────────────────
app.post('/api/pdf/info', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return err(res,'Upload a PDF file');
    const doc = await PDFDocument.load(req.file.buffer);
    res.json({ success:true, pages:doc.getPageCount(), sizeKB:(req.file.buffer.length/1024).toFixed(1) });
  } catch(e) { err(res, e.message); }
});

// ── PDF Merge ───────────────────────────────────────────────
app.post('/api/pdf/merge', upload.array('pdfs', 20), async (req, res) => {
  try {
    if (!req.files || req.files.length < 2) return err(res,'Upload at least 2 PDF files');
    const merged = await PDFDocument.create();
    for (const file of req.files) {
      const doc = await PDFDocument.load(file.buffer);
      const pages = await merged.copyPages(doc, doc.getPageIndices());
      pages.forEach(p => merged.addPage(p));
    }
    const bytes = await merged.save();
    res.set({'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="merged.pdf"'});
    res.send(Buffer.from(bytes));
  } catch(e) { err(res, e.message); }
});

// ── PDF Split ───────────────────────────────────────────────
app.post('/api/pdf/split', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return err(res,'Upload a PDF file');
    const src = await PDFDocument.load(req.file.buffer);
    const total = src.getPageCount();
    const pages = req.body.pages || '';
    const idx = new Set();
    if (pages) {
      pages.split(',').forEach(p => {
        p = p.trim();
        if (p.includes('-')) { let [a,b]=p.split('-').map(Number); for(let i=a;i<=Math.min(b,total);i++) idx.add(i-1); }
        else { const n=parseInt(p); if(n>=1&&n<=total) idx.add(n-1); }
      });
    } else { for(let i=0;i<total;i++) idx.add(i); }
    const out = await PDFDocument.create();
    const copied = await out.copyPages(src,[...idx]);
    copied.forEach(p => out.addPage(p));
    const bytes = await out.save();
    res.set({'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="split.pdf"'});
    res.send(Buffer.from(bytes));
  } catch(e) { err(res, e.message); }
});

// ── PDF Compress ────────────────────────────────────────────
app.post('/api/pdf/compress', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return err(res,'Upload a PDF file');
    const doc = await PDFDocument.load(req.file.buffer, { ignoreEncryption: true });
    doc.setTitle(''); doc.setAuthor(''); doc.setSubject(''); doc.setKeywords([]);
    const bytes = await doc.save({ useObjectStreams: true });
    res.set({
      'Content-Type':'application/pdf',
      'Content-Disposition':'attachment; filename="compressed.pdf"',
      'X-Original-Size': req.file.buffer.length,
      'X-Compressed-Size': bytes.length
    });
    res.send(Buffer.from(bytes));
  } catch(e) { err(res, e.message); }
});

// ── Image Compress ──────────────────────────────────────────
app.post('/api/image/compress', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return err(res,'Upload an image');
    const q = parseInt(req.body.quality)||75;
    const isPng = req.file.mimetype==='image/png';
    const out = await (isPng ? sharp(req.file.buffer).png({quality:q}) : sharp(req.file.buffer).jpeg({quality:q, mozjpeg:true})).toBuffer();
    res.set({'Content-Type':req.file.mimetype,'Content-Disposition':`attachment; filename="compressed.${isPng?'png':'jpg'}"`, 'X-Original-Size':req.file.buffer.length,'X-Compressed-Size':out.length});
    res.send(out);
  } catch(e) { err(res, e.message); }
});

// ── Image Resize ────────────────────────────────────────────
app.post('/api/image/resize', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return err(res,'Upload an image');
    const w=parseInt(req.body.width)||null, h=parseInt(req.body.height)||null;
    const out = await sharp(req.file.buffer).resize(w,h,{fit:'inside'}).toBuffer();
    const ext = req.file.mimetype.split('/')[1];
    res.set({'Content-Type':req.file.mimetype,'Content-Disposition':`attachment; filename="resized.${ext}"`});
    res.send(out);
  } catch(e) { err(res, e.message); }
});

// ── Image Convert ───────────────────────────────────────────
app.post('/api/image/convert', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return err(res,'Upload an image');
    const to = req.body.format||'jpeg';
    let s = sharp(req.file.buffer);
    if(to==='jpeg') s=s.jpeg({quality:85});
    else if(to==='webp') s=s.webp({quality:80});
    else s=s.png();
    const out = await s.toBuffer();
    res.set({'Content-Type':`image/${to==='jpg'?'jpeg':to}`,'Content-Disposition':`attachment; filename="converted.${to}"`});
    res.send(out);
  } catch(e) { err(res, e.message); }
});

// ── Image Grayscale ─────────────────────────────────────────
app.post('/api/image/grayscale', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return err(res,'Upload an image');
    const out = await sharp(req.file.buffer).grayscale().jpeg({quality:90}).toBuffer();
    res.set({'Content-Type':'image/jpeg','Content-Disposition':'attachment; filename="grayscale.jpg"'});
    res.send(out);
  } catch(e) { err(res, e.message); }
});

// ── Image Rotate ────────────────────────────────────────────
app.post('/api/image/rotate', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return err(res,'Upload an image');
    const out = await sharp(req.file.buffer).rotate(parseInt(req.body.angle)||90).toBuffer();
    const ext = req.file.mimetype.split('/')[1];
    res.set({'Content-Type':req.file.mimetype,'Content-Disposition':`attachment; filename="rotated.${ext}"`});
    res.send(out);
  } catch(e) { err(res, e.message); }
});

// ── Image Flip ──────────────────────────────────────────────
app.post('/api/image/flip', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return err(res,'Upload an image');
    const d = req.body.direction||'horizontal';
    const s = sharp(req.file.buffer);
    const out = await (d==='horizontal' ? s.flop() : s.flip()).toBuffer();
    const ext = req.file.mimetype.split('/')[1];
    res.set({'Content-Type':req.file.mimetype,'Content-Disposition':`attachment; filename="flipped.${ext}"`});
    res.send(out);
  } catch(e) { err(res, e.message); }
});

// ── Image Crop ──────────────────────────────────────────────
app.post('/api/image/crop', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return err(res,'Upload an image');
    const {left=0,top=0,width=100,height=100} = req.body;
    const out = await sharp(req.file.buffer).extract({left:+left,top:+top,width:+width,height:+height}).toBuffer();
    const ext = req.file.mimetype.split('/')[1];
    res.set({'Content-Type':req.file.mimetype,'Content-Disposition':`attachment; filename="cropped.${ext}"`});
    res.send(out);
  } catch(e) { err(res, e.message); }
});

// ── 404 & Error handlers ─────────────────────────────────────
app.use((req, res) => res.status(404).json({ success:false, error:'Not found' }));
app.use((e, req, res, next) => err(res, e.message, 500));

app.listen(PORT, () => console.log(`✅ ToolifyPro running → http://localhost:${PORT}`));