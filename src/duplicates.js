import { CsvError, parse } from 'csv-parse/sync';

const MAX_ROWS = 500;
const MAX_CSV_BYTES = 256 * 1024;

function countLineBreaks(text) {
  return text.match(/\r\n|[\r\n]/g)?.length ?? 0;
}

function readRecords(bytes) {
  try {
    return parse(bytes, {
      bom: true,
      info: true,
      record_delimiter: ['\r\n', '\n', '\r'],
      relax_column_count: true,
      skip_empty_lines: true,
      to: MAX_ROWS + 2,
    });
  } catch (error) {
    if (!(error instanceof CsvError)) throw error;
    throw new Error('Malformed CSV. Check field separators and quotation marks.', { cause: error });
  }
}

export function findDuplicateEmails(csv) {
  if (typeof csv !== 'string' || !csv.trim()) {
    throw new Error('Provide a non-empty CSV with an email column.');
  }
  if (Buffer.byteLength(csv) > MAX_CSV_BYTES) {
    throw new Error('The CSV must be at most 256 KiB.');
  }

  const bytes = Buffer.from(csv);
  const [header, ...rows] = readRecords(bytes);
  const headers = header?.record.map((field) => field.trim().toLowerCase()) ?? [];
  const emailIndex = headers.indexOf('email');
  if (emailIndex < 0 || emailIndex !== headers.lastIndexOf('email')) {
    throw new Error('The CSV must contain exactly one email column.');
  }
  if (rows.length > MAX_ROWS) {
    throw new Error('The CSV must contain at most 500 data rows.');
  }

  let offset = header.info.bytes;
  let line = 1 + countLineBreaks(bytes.subarray(0, offset).toString());
  let missingEmails = 0;
  const linesByEmail = new Map();

  for (const { record, info } of rows) {
    // Count physical lines from parser byte offsets, including blank lines
    // between records and line breaks inside quoted multiline fields.
    const recordText = bytes.subarray(offset, info.bytes).toString();
    const leadingLineBreaks = recordText.match(/^[\r\n]*/)[0];
    const startLine = line + countLineBreaks(leadingLineBreaks);
    offset = info.bytes;
    line += countLineBreaks(recordText);

    if (record.length !== headers.length) {
      throw new Error(`CSV record starting on line ${startLine} has ${record.length} fields. Expected ${headers.length}.`);
    }

    const email = record[emailIndex].trim().toLowerCase();
    if (!email) {
      missingEmails += 1;
      continue;
    }

    const previousLines = linesByEmail.get(email);
    if (previousLines) {
      previousLines.push(startLine);
    } else {
      linesByEmail.set(email, [startLine]);
    }
  }

  const duplicates = [];
  let duplicateRows = 0;
  for (const [email, lines] of linesByEmail) {
    if (lines.length > 1) {
      duplicates.push({ email, lines });
      duplicateRows += lines.length - 1;
    }
  }

  return { rowsScanned: rows.length, missingEmails, duplicates, duplicateRows };
}
