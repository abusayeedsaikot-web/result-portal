const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const dbPath = path.join(__dirname, 'results.db');
const db = new DatabaseSync(dbPath);

// ==================================================
// CREATE TABLE
// ==================================================

db.exec(`
  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    roll TEXT NOT NULL,
    registration TEXT DEFAULT '',
    name TEXT DEFAULT '',

    exam_year TEXT DEFAULT '',
    board TEXT DEFAULT '',
    group_name TEXT DEFAULT '',

    semester TEXT NOT NULL,

    gpa REAL,
    status TEXT DEFAULT '',

    gpa1 TEXT DEFAULT '',
    gpa2 TEXT DEFAULT '',
    gpa3 TEXT DEFAULT '',
    gpa4 TEXT DEFAULT '',
    gpa5 TEXT DEFAULT '',
    gpa6 TEXT DEFAULT '',
    gpa7 TEXT DEFAULT '',

    ref_subjects TEXT DEFAULT '',
    institute TEXT DEFAULT '',

    publish_date TEXT DEFAULT '',

    source_file TEXT DEFAULT '',
    imported_at TEXT DEFAULT '',

    UNIQUE(roll, registration, semester)
  )
`);

// ==================================================
// ADD MISSING COLUMNS TO OLD DATABASE
// ==================================================

const columns = db
  .prepare(`PRAGMA table_info(students)`)
  .all()
  .map(row => row.name);

const requiredColumns = {
  gpa4: "TEXT DEFAULT ''",
  gpa5: "TEXT DEFAULT ''",
  gpa6: "TEXT DEFAULT ''",
  gpa7: "TEXT DEFAULT ''",
  publish_date: "TEXT DEFAULT ''"
};

for (const [column, definition] of Object.entries(requiredColumns)) {
  if (!columns.includes(column)) {
    console.log(`Adding column: ${column}`);

    db.exec(`
      ALTER TABLE students
      ADD COLUMN ${column} ${definition}
    `);
  }
}

// ==================================================
// INDEXES
// ==================================================

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_students_roll
  ON students(roll);

  CREATE INDEX IF NOT EXISTS idx_students_semester
  ON students(semester);

  CREATE INDEX IF NOT EXISTS idx_students_roll_semester
  ON students(roll, semester);
`);

// ==================================================
// UPSERT RECORDS
// ==================================================

function upsertRecords(
  records,
  sourceFile,
  semester,
  publishDate = ''
) {
  if (!semester) {
    throw new Error('Semester is required.');
  }

  semester = String(semester).trim();
  publishDate = String(publishDate || '').trim();

  const statement = db.prepare(`
    INSERT INTO students (
      roll,
      registration,
      name,
      exam_year,
      board,
      group_name,
      semester,
      gpa,
      status,
      gpa1,
      gpa2,
      gpa3,
      gpa4,
      gpa5,
      gpa6,
      gpa7,
      ref_subjects,
      institute,
      publish_date,
      source_file,
      imported_at
    )
    VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )

    ON CONFLICT(roll, registration, semester)
    DO UPDATE SET
      name = excluded.name,
      exam_year = excluded.exam_year,
      board = excluded.board,
      group_name = excluded.group_name,
      gpa = excluded.gpa,
      status = excluded.status,

      gpa1 = excluded.gpa1,
      gpa2 = excluded.gpa2,
      gpa3 = excluded.gpa3,
      gpa4 = excluded.gpa4,
      gpa5 = excluded.gpa5,
      gpa6 = excluded.gpa6,
      gpa7 = excluded.gpa7,

      ref_subjects = excluded.ref_subjects,
      institute = excluded.institute,
      publish_date = excluded.publish_date,

      source_file = excluded.source_file,
      imported_at = excluded.imported_at
  `);

  const importedAt = new Date().toISOString();

  let total = 0;

  db.exec('BEGIN');

  try {
    for (const record of records) {
      const roll = String(record.roll || '').trim();

      if (!roll) {
        continue;
      }

      const registration =
        String(record.registration || '').trim();

      const refSubjects =
        Array.isArray(record.refSubjects)
          ? record.refSubjects.join(', ')
          : String(record.refSubjects || '');

      statement.run(
        roll,
        registration,
        record.name || '',
        record.examYear || '',
        'Bangladesh Technical Education Board',
        record.groupName || '',
        semester,

        record.gpa ?? null,
        record.status || '',

        record.gpa1 || '',
        record.gpa2 || '',
        record.gpa3 || '',
        record.gpa4 || '',
        record.gpa5 || '',
        record.gpa6 || '',
        record.gpa7 || '',

        refSubjects,
        record.institute || '',

        publishDate,

        sourceFile || '',
        importedAt
      );

      total++;
    }

    db.exec('COMMIT');

  } catch (error) {

    try {
      db.exec('ROLLBACK');
    } catch {}

    throw error;
  }

  return total;
}

// ==================================================
// FIND BY ROLL
// ==================================================

function findByRoll(roll) {
  return db
    .prepare(`
      SELECT
        id,
        roll,
        registration,
        name,
        exam_year,
        board,
        group_name,
        semester,
        gpa,
        status,

        gpa1,
        gpa2,
        gpa3,
        gpa4,
        gpa5,
        gpa6,
        gpa7,

        ref_subjects,
        institute,
        publish_date,
        source_file,
        imported_at

      FROM students

      WHERE roll = ?

      ORDER BY
        CAST(semester AS INTEGER) ASC,
        id ASC
    `)
    .all(String(roll).trim());
}

// ==================================================
// COUNT
// ==================================================

function count() {
  const result = db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM students
    `)
    .get();

  return result.count;
}

// ==================================================
// EXPORT
// ==================================================

module.exports = {
  upsertRecords,
  findByRoll,
  count
};