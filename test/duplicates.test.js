import assert from 'node:assert/strict';
import test from 'node:test';
import { findDuplicateEmails } from '../src/duplicates.js';

test('groups normalized emails in first-appearance order and counts only repeated rows', () => {
  const csv = [
    'name,email',
    'River, RIVER@example.test ',
    'Morgan,morgan@example.test',
    'Morgan 2,MORGAN@EXAMPLE.TEST',
    'River 2," river@example.test "',
    'Missing,',
    'Whitespace only,   ',
    'River 3,river@example.test',
    'Kai,kai@example.test',
  ].join('\n');

  assert.deepEqual(findDuplicateEmails(csv), {
    rowsScanned: 8,
    missingEmails: 2,
    duplicates: [
      { email: 'river@example.test', lines: [2, 5, 8] },
      { email: 'morgan@example.test', lines: [3, 4] },
    ],
    duplicateRows: 3,
  });
});

test('uses physical line numbers for quoted and blank lines with LF or CRLF', () => {
  for (const newline of ['\n', '\r\n']) {
    const csv = [
      '\uFEFF" Email ",name,notes',
      '',
      'jules@example.test,"Jules, Ü","speaker',
      'who invited ""friends"""',
      'JULES@example.test,Jules,follow-up',
    ].join(newline);

    assert.deepEqual(findDuplicateEmails(csv), {
      rowsScanned: 2,
      missingEmails: 0,
      duplicates: [{ email: 'jules@example.test', lines: [3, 5] }],
      duplicateRows: 1,
    });
  }
});

test('accepts a header with no records and rejects malformed input', () => {
  assert.deepEqual(findDuplicateEmails('email'), {
    rowsScanned: 0,
    missingEmails: 0,
    duplicates: [],
    duplicateRows: 0,
  });
  assert.throws(() => findDuplicateEmails('  \n'), /non-empty CSV/);
  assert.throws(() => findDuplicateEmails('name,contact\nAda,ada@example.test'), /one email column/);
  assert.throws(() => findDuplicateEmails('Email, email'), /one email column/);
  assert.throws(() => findDuplicateEmails('email,name\n"ada@example.test,Ada'), /Malformed CSV/);
  assert.throws(() => findDuplicateEmails('email,name\n\nada@example.test'), /line 3 has 1 fields/);
});

test('enforces row and UTF-8 byte limits', () => {
  const rows = Array.from({ length: 500 }, (_, i) => `lead${i}@example.test`);
  assert.equal(findDuplicateEmails(['email', ...rows].join('\n')).rowsScanned, 500);
  assert.throws(() => findDuplicateEmails(['email', ...rows, 'extra@example.test'].join('\n')), /500 data rows/);
  assert.throws(() => findDuplicateEmails(`email\n${'é'.repeat(128 * 1024)}`), /256 KiB/);
});
