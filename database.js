const { Pool } = require('pg');

// Render injects DATABASE_URL automatically when you link a Postgres
// database to your web service (Environment tab shows it, or you can
// set it manually from the database's "Internal Database URL").
if (!process.env.DATABASE_URL) {
  console.warn('WARNING: DATABASE_URL is not set. Set it in your environment (.env locally, or Render\'s Environment tab) to a PostgreSQL connection string.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Render's managed Postgres requires SSL for external connections.
  // Internal connections (same Render region) also accept this safely.
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost')
    ? false
    : { rejectUnauthorized: false }
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS students (
      id SERIAL PRIMARY KEY,
      roll TEXT NOT NULL,
      registration TEXT DEFAULT '',
      name TEXT DEFAULT '',
      father_name TEXT DEFAULT '',
      exam_year TEXT DEFAULT '',
      board TEXT DEFAULT 'Bangladesh Technical Education Board',
      group_name TEXT DEFAULT '',
      gpa REAL,
      status TEXT,
      gpa1 TEXT,
      gpa2 TEXT,
      gpa3 TEXT,
      ref_subjects TEXT DEFAULT '',
      institute TEXT DEFAULT '',
      source_file TEXT DEFAULT '',
      imported_at TEXT DEFAULT '',
      UNIQUE(roll, registration)
    );
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_students_roll ON students(roll);`);
}

// Run once when this module is first loaded. server.js awaits initDone
// before accepting requests (see server.js changes).
const initDone = init().catch(err => {
  console.error('Database initialization failed:', err);
  process.exit(1);
});

/**
 * Bulk insert/update student records inside a single transaction.
 * Rows are chunked to keep each SQL statement a reasonable size.
 */
async function upsertRecords(records, sourceFile) {
  if (!records.length) return 0;

  const now = new Date().toISOString();
  const CHUNK_SIZE = 500;
  let inserted = 0;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (let i = 0; i < records.length; i += CHUNK_SIZE) {
      const chunk = records.slice(i, i + CHUNK_SIZE);

      const values = [];
      const rowPlaceholders = [];

      chunk.forEach((r) => {
        const nums = [r.gpa1, r.gpa2, r.gpa3]
          .filter(x => x && x !== 'ref')
          .map(Number)
          .filter(Number.isFinite);
        const overall = nums.length
          ? Number((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2))
          : null;

        // Column order: roll, registration, name, exam_year, board, gpa,
        // status, gpa1, gpa2, gpa3, ref_subjects, institute, source_file, imported_at
        const rowValues = [
          r.roll,
          '',                                        // registration
          '',                                        // name
          r.examYear || '',
          'Bangladesh Technical Education Board',
          overall,
          r.status || '',
          r.gpa1 || '',
          r.gpa2 || '',
          r.gpa3 || '',
          (r.refSubjects || []).join('; '),
          r.institute || '',
          sourceFile,
          now
        ];

        const startIdx = values.length;
        rowValues.forEach(v => values.push(v));
        const placeholders = rowValues.map((_, j) => `$${startIdx + j + 1}`);
        rowPlaceholders.push(`(${placeholders.join(', ')})`);
      });

      const sql = `
        INSERT INTO students
          (roll, registration, name, exam_year, board, gpa, status, gpa1, gpa2, gpa3, ref_subjects, institute, source_file, imported_at)
        VALUES ${rowPlaceholders.join(', ')}
        ON CONFLICT (roll, registration) DO UPDATE SET
          exam_year = EXCLUDED.exam_year,
          board = EXCLUDED.board,
          gpa = EXCLUDED.gpa,
          status = EXCLUDED.status,
          gpa1 = EXCLUDED.gpa1,
          gpa2 = EXCLUDED.gpa2,
          gpa3 = EXCLUDED.gpa3,
          ref_subjects = EXCLUDED.ref_subjects,
          institute = EXCLUDED.institute,
          source_file = EXCLUDED.source_file,
          imported_at = EXCLUDED.imported_at
      `;

      await client.query(sql, values);
      inserted += chunk.length;
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return inserted;
}

async function findByRoll(roll) {
  const res = await pool.query(
    `SELECT * FROM students WHERE roll = $1 ORDER BY id DESC LIMIT 1`,
    [String(roll).trim()]
  );
  return res.rows[0] || null;
}

async function count() {
  const res = await pool.query(`SELECT COUNT(*) AS count FROM students`);
  return Number(res.rows[0].count);
}

module.exports = { upsertRecords, findByRoll, count, initDone };
