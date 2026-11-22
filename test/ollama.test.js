import assert from 'node:assert/strict';
import test from 'node:test';
import { auditWithOllama, createOllamaChat } from '../src/ollama.js';

const csv = 'email\nada@example.com\nADA@example.com';
const selection = {
  role: 'assistant',
  content: '',
  tool_calls: [{ function: { name: 'find_duplicate_emails', arguments: { column: 'email' } } }],
};

test('uses the model-selected tool and sends only summary counts back to the model', async () => {
  const requests = [];
  const chat = async (request) => {
    requests.push(request);
    return requests.length === 1 ? selection : { content: '{"finding":"duplicates_found"}' };
  };

  const report = await auditWithOllama({ csv, model: 'test-model', chat });
  assert.equal(requests[0].tools[0].function.name, 'find_duplicate_emails');
  assert.deepEqual(report.duplicates, [{ email: 'ada@example.com', lines: [2, 3] }]);
  const toolResult = requests[1].messages.find(({ role }) => role === 'tool');
  assert.deepEqual(JSON.parse(toolResult.content), {
    rowsScanned: 2, missingEmails: 0, duplicateGroups: 1, duplicateRows: 1,
  });
  assert.doesNotMatch(JSON.stringify(requests), /ada@example\.com/i);
});

test('rejects unsupported tools and additional arguments', async () => {
  const invalid = { role: 'assistant', tool_calls: [{
    function: { name: 'find_duplicate_emails', arguments: { column: 'email', path: 'different.csv' } },
  }] };
  await assert.rejects(auditWithOllama({ csv, model: 'test-model', chat: async () => invalid }), /unsupported/);
});

test('rejects a verdict that disagrees with the deterministic counts', async () => {
  const chat = async ({ tools }) => tools ? selection : { content: '{"finding":"no_duplicates"}' };
  await assert.rejects(auditWithOllama({ csv, model: 'test-model', chat }), /did not agree/);
});

test('accepts loopback addresses and rejects external Ollama servers', () => {
  assert.equal(typeof createOllamaChat('http://[::1]:11434'), 'function');
  assert.throws(() => createOllamaChat('http://example.com:11434'), /loopback/);
});
