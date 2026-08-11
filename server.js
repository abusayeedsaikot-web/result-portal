const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');

const { parsePdfBuffer } = require('./pdf-parser');
const {
  upsertRecords,
  findByRoll,
  count
} = require('./database');

const app = express();

const PORT = process.env.PORT || 3000;
const ADMIN_KEY =
  process.env.ADMIN_KEY || 'change-this-key';

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 50 * 1024 * 1024
  },

  fileFilter: (req, file, cb) => {
    const ok =
      file.mimetype === 'application/pdf' ||
      file.originalname
        .toLowerCase()
        .endsWith('.pdf');

    cb(
      ok
        ? null
        : new Error('Only PDF files are allowed.'),
      ok
    );
  }
});

// ===============================
// Middleware
// ===============================

app.use(cors());
app.use(express.json());

app.use(
  express.static(
    path.join(__dirname, 'public')
  )
);

// ===============================
// ===============================
// Search Result - Multiple Semesters
// ===============================

app.post('/api/result', (req, res) => {
  try {
    const roll = String(req.body?.roll || '').trim();

    if (!/^\d{6}$/.test(roll)) {
      return res.status(400).json({
        found: false,
        message: 'Enter a valid 6-digit Roll number.'
      });
    }

    const results = findByRoll(roll);

    if (!results || results.length === 0) {
      return res.status(404).json({
        found: false,
        message: 'No result found.'
      });
    }

    const formattedResults = results
      .sort((a, b) => Number(a.semester) - Number(b.semester))
      .map(result => ({
        ...result,
        ref_subjects: result.ref_subjects
          ? String(result.ref_subjects)
              .split(',')
              .map(x => x.trim())
              .filter(Boolean)
          : []
      }));

    return res.json({
      found: true,
      count: formattedResults.length,
      results: formattedResults
    });

  } catch (err) {
    console.error('Result search error:', err);

    return res.status(500).json({
      found: false,
      message: 'Server error.'
    });
  }
});
// Admin PDF Import
// ===============================

app.post(
  '/api/admin/import-pdf',
  upload.array('pdf', 10),
  async (req, res) => {

    try {

      // Check admin key
      if (
        req.get('x-admin-key') !== ADMIN_KEY
      ) {
        return res.status(401).json({
          ok: false,
          message: 'Invalid admin key.'
        });
      }

      // Check files
      if (
        !req.files ||
        req.files.length === 0
      ) {
        return res.status(400).json({
          ok: false,
          message: 'PDF file required.'
        });
      }

      let totalImported = 0;
      let totalPages = 0;
      const results = [];

      // Process every PDF
      for (const file of req.files) {

        console.log(
          `Starting PDF import: ${file.originalname}`
        );

        const parsed =
          await parsePdfBuffer(
            file.buffer,
            progress => {

              if (
                progress.page === 1 ||
                progress.page ===
                  progress.totalPages ||
                progress.page % 25 === 0
              ) {
                console.log(
                  `PDF import: ${file.originalname} | ` +
                  `page ${progress.page}/` +
                  `${progress.totalPages} | ` +
                  `records ${progress.records}`
                );
              }

            }
          );

        const imported =
          upsertRecords(
            parsed.records,
            file.originalname
          );

        totalImported += imported;
        totalPages += parsed.pages;

        results.push({
          file: file.originalname,
          pages: parsed.pages,
          records: imported
        });

        console.log(
          `Completed: ${file.originalname} | ` +
          `pages ${parsed.pages} | ` +
          `records ${imported}`
        );
      }

      return res.json({
        ok: true,
        message:
          'PDF imported successfully.',
        files: results,
        pages: totalPages,
        records: totalImported,
        databaseRecords: count()
      });

    } catch (e) {

      console.error(
        'PDF import error:',
        e
      );

      return res.status(500).json({
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

app.get('/api/health', (req, res) => {

  try {

    return res.json({
      ok: true,
      records: count()
    });

  } catch (err) {

    console.error(
      'Health check error:',
      err
    );

    return res.status(500).json({
      ok: false,
      message: 'Database error.'
    });
  }
});

// ===============================
// Root
// ===============================

app.get('/', (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      'public',
      'index.html'
    )
  );
});

// ===============================
// Error Handler
// ===============================

app.use(
  (err, req, res, next) => {

    console.error(
      'Server error:',
      err
    );

    return res.status(500).json({
      ok: false,
      message:
        err.message ||
        'Internal server error.'
    });
  }
);

// ===============================
// Start Server
// ===============================

app.listen(
  PORT,
  '0.0.0.0',
  () => {

    console.log(
      `Result portal running on port ${PORT}`
    );

  }
);
