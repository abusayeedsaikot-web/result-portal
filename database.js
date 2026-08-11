const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(
  path.join(__dirname, 'results.db')
);

db.exec(`
  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    roll TEXT NOT NULL,
    registration TEXT DEFAULT '',
    name TEXT DEFAULT '',
    father_name TEXT DEFAULT '',
    exam_year TEXT DEFAULT '',
    board TEXT DEFAULT 'Bangladesh Technical Education Board',
    group_name TEXT DEFAULT '',
    gpa REAL,
    status TEXT DEFAULT '',
    gpa1 TEXT DEFAULT '',
    gpa2 TEXT DEFAULT '',
    gpa3 TEXT DEFAULT '',
    ref_subjects TEXT DEFAULT '',
    institute TEXT DEFAULT '',
    source_file TEXT DEFAULT '',
    imported_at TEXT DEFAULT '',
    UNIQUE(roll, registration)
  );

  CREATE INDEX IF NOT EXISTS idx_students_roll
  ON students(roll);
`);

const cols = new Set(
  db.prepare('PRAGMA table_info(students)')
    .all()
    .map(x => x.name)
);

const newColumns = {
  gpa1: 'ALTER TABLE students ADD COLUMN gpa1 TEXT',
  gpa2: 'ALTER TABLE students ADD COLUMN gpa2 TEXT',
  gpa3: 'ALTER TABLE students ADD COLUMN gpa3 TEXT',
  ref_subjects:
    "ALTER TABLE students ADD COLUMN ref_subjects TEXT DEFAULT ''",
  institute:
    "ALTER TABLE students ADD COLUMN institute TEXT DEFAULT ''",
  source_file:
    "ALTER TABLE students ADD COLUMN source_file TEXT DEFAULT ''",
  imported_at:
    "ALTER TABLE students ADD COLUMN imported_at TEXT DEFAULT ''"
};

for (const [name, sql] of Object.entries(newColumns)) {
  if (!cols.has(name)) {
    db.exec(sql);
  }
}

function upsertRecords(records, sourceFile) {
  const stmt = db.prepare(`
    INSERT INTO students
    (
      roll,
      registration,
      name,
      exam_year,
      board,
      gpa,
      status,
      gpa1,
      gpa2,
      gpa3,
      ref_subjects,
      institute,
      source_file,
      imported_at
    )
    VALUES (?, '', '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)

    ON CONFLICT(roll, registration)
    DO UPDATE SET
      exam_year = excluded.exam_year,
      board = excluded.board,
      gpa = excluded.gpa,
      status = excluded.status,
      gpa1 = excluded.gpa1,
      gpa2 = excluded.gpa2,
      gpa3 = excluded.gpa3,
      ref_subjects = excluded.ref_subjects,
      institute = excluded.institute,
      source_file = excluded.source_file,
      imported_at = excluded.imported_at
  `);

  const now = new Date().toISOString();
  let n = 0;

  db.exec('BEGIN');

  try {
    for (const r of records) {
      const nums = [r.gpa1, r.gpa2, r.gpa3]
        .filter(x => x && x !== 'ref')
        .map(Number)
        .filter(Number.isFinite);

      const overall = nums.length
        ? Number(
            (
              nums.reduce((a, b) => a + b, 0) /
              nums.length
            ).toFixed(2)
          )
        : null;

      stmt.run(
        String(r.roll || ''),
        r.examYear || '',
        'Bangladesh Technical Education Board',
        overall,
        r.status || '',
        r.gpa1 || '',
        r.gpa2 || '',
        r.gpa3 || '',
        (r.refSubjects || []).join(', '),
        r.institute || '',
        sourceFile || '',
        now
      );

      n++;
    }

    db.exec('COMMIT');
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {}

    throw err;
  }

  return n;
}

function findByRoll(roll) {
  return db
    .prepare(`
      SELECT *
      FROM students
      WHERE roll = ?
      ORDER BY id DESC
      LIMIT 1
    `)
    .get(String(roll).trim());
}

function count() {
  return db
    .prepare('SELECT COUNT(*) AS count FROM students')
    .get().count;
}

module.exports = {
  upsertRecords,
  findByRoll,
  count
};