require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');

const { parsePdfBuffer } = require('./pdf-parser');
const {
  upsertRecords,
  findByRoll,
  count,
  initDone
} = require('./database');

const app = express();

const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'change-this-key';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const ok =
      file.mimetype === 'application/pdf' ||
      file.originalname.toLowerCase().endsWith('.pdf');

    if (ok) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed.'));
    }
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));


// ===============================
// Result Search
// ===============================

app.post('/api/result', async (req, res) => {
  const roll = String(req.body?.roll || '').trim();

  if (!/^\d{6}$/.test(roll)) {
    return res.status(400).json({
      found: false,
      message: 'Enter a valid 6-digit Roll number.'
    });
  }

  let r;
  try {
    r = await findByRoll(roll);
  } catch (e) {
    console.error('Result lookup error:', e);
    return res.status(500).json({ found: false, message: 'Server error while looking up the result.' });
  }

  if (!r) {
    return res.status(404).json({
      found: false,
      message: 'No result found.'
    });
  }

  r.ref_subjects = r.ref_subjects
    ? r.ref_subjects
        .split(';')
        .map(x => x.trim())
        .filter(Boolean)
    : [];

  res.json({
    found: true,
    result: r
  });
});


// ===============================
// Admin - Multiple PDF Import
// ===============================

app.post(
  '/api/admin/import-pdf',
  upload.array('pdf', 10),
  async (req, res) => {
    try {

      // Admin key check
      if (req.get('x-admin-key') !== ADMIN_KEY) {
        return res.status(401).json({
          ok: false,
          message: 'Invalid admin key.'
        });
      }

      // Check files
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          ok: false,
          message: 'PDF file required.'
        });
      }

      const results = [];

      // Process PDFs one by one
      for (const file of req.files) {

        console.log(
          `Starting PDF: ${file.originalname}`
        );

        const parsed = await parsePdfBuffer(
          file.buffer,
          p => {

            if (
              p.page === 1 ||
              p.page === p.totalPages ||
              p.page % 25 === 0
            ) {
              console.log(
                `PDF import: ${file.originalname} - ` +
                `page ${p.page}/${p.totalPages}, ` +
                `records ${p.records}`
              );
            }

          }
        );

        const imported = await upsertRecords(
          parsed.records,
          file.originalname
        );

        results.push({
          file: file.originalname,
          pages: parsed.pages,
          records: imported
        });

        console.log(
          `Completed: ${file.originalname} - ` +
          `${imported} records`
        );
      }

      // Send final response
      res.json({
        ok: true,
        message: 'All PDFs imported successfully.',
        files: results,
        databaseRecords: await count()
      });

    } catch (e) {

      console.error(
        'PDF import error:',
        e
      );

      res.status(500).json({
        ok: false,
        message:
          e.message ||
          'PDF import failed.'
      });
    }
  }
);


// ===============================
// Health Check
// ===============================

app.get('/api/health', async (req, res) => {
  res.json({
    ok: true,
    records: await count()
  });
});


// ===============================
// Start Server
// ===============================

initDone
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(
        `Result portal running on port ${PORT}`
      );
    });
  })
  .catch(err => {
    console.error('Failed to start server — database not ready:', err);
    process.exit(1);
  });