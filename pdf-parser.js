const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.mjs');

function clean(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractSubjects(value) {
  const matches = String(value || '').match(
    /\d{5}\s*\([TP]\)/gi
  );

  return matches
    ? matches.map(x => clean(x))
    : [];
}

function parsePageText(text, year) {
  const records = [];
  const t = clean(text);

  const recordRegex =
    /(\d{6})\s*\{([^{}]*)\}/g;

  for (const match of t.matchAll(recordRegex)) {
    const roll = match[1];
    const body = match[2];

    const result = {
      roll: roll,
      examYear: year,
      gpa1: '',
      gpa2: '',
      gpa3: '',
      gpa4: '',
      gpa5: '',
      gpa6: '',
      gpa7: '',
      refSubjects: [],
      status: '',
      gpa: null
    };

    for (let i = 1; i <= 7; i++) {
      const pattern = new RegExp(
        `gpa${i}\\s*:\\s*(ref|\\d+(?:\\.\\d+)?)`,
        'i'
      );

      const found = body.match(pattern);

      if (found) {
        result[`gpa${i}`] =
          found[1].toLowerCase() === 'ref'
            ? 'ref'
            : found[1];
      }
    }

    const refMatch = body.match(
      /ref_sub\s*:\s*(.*)$/i
    );

    if (refMatch) {
      result.refSubjects =
        extractSubjects(refMatch[1]);
    }

    const hasRef =
      [1, 2, 3, 4, 5, 6, 7]
        .some(i => result[`gpa${i}`] === 'ref');

    result.status =
      hasRef ? 'REFERRED' : 'PASS';

    const numericGpas =
      [1, 2, 3, 4, 5, 6, 7]
        .map(i => result[`gpa${i}`])
        .filter(
          value =>
            value !== '' &&
            value !== 'ref' &&
            Number.isFinite(Number(value))
        )
        .map(Number);

    if (numericGpas.length > 0) {
      result.gpa = Number(
        (
          numericGpas.reduce(
            (sum, value) => sum + value,
            0
          ) / numericGpas.length
        ).toFixed(2)
      );
    }

    records.push(result);
  }

  return records;
}

async function parsePdfBuffer(buffer, onProgress) {
  const task = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    isEvalSupported: false,
    verbosity: 0
  });

  const pdf = await task.promise;

  const all = new Map();
  let year = '';

  for (
    let pageNo = 1;
    pageNo <= pdf.numPages;
    pageNo++
  ) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();

    const text = content.items
      .map(item => item.str || '')
      .join(' ');

    if (!year) {
      const yearMatch = text.match(
        /DIPLOMA\s+IN\s+ENGINEERING[\s\S]*?(\d{4})/i
      );

      if (yearMatch) {
        year = yearMatch[1];
      }
    }

    const records =
      parsePageText(text, year);

    for (const record of records) {
      all.set(record.roll, record);
    }

    page.cleanup();

    if (onProgress) {
      await onProgress({
        page: pageNo,
        totalPages: pdf.numPages,
        records: all.size
      });
    }
  }

  if (!all.size) {
    throw new Error(
      'No recognizable result records were found in the PDF.'
    );
  }

  return {
    records: [...all.values()],
    pages: pdf.numPages
  };
}

module.exports = {
  parsePdfBuffer
};
