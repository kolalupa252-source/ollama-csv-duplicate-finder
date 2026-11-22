import { findDuplicateEmails } from './duplicates.js';

const toolName = 'find_duplicate_emails';
const tools = [{
  type: 'function',
  function: {
    name: toolName,
    description: 'Scan the selected CSV for duplicate values in the email column and count the duplicate groups.',
    parameters: {
      type: 'object',
      properties: {
        column: { type: 'string', enum: ['email'], description: 'The CSV column to scan.' },
      },
      required: ['column'],
      additionalProperties: false,
    },
  },
}];

const verdictSchema = {
  type: 'object',
  properties: {
    finding: { type: 'string', enum: ['duplicates_found', 'no_duplicates'] },
  },
  required: ['finding'],
  additionalProperties: false,
};

export function createOllamaChat(baseUrl = 'http://127.0.0.1:11434') {
  const url = new URL(baseUrl);
  const isLoopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'http:' || !isLoopback || url.username || url.password
      || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('OLLAMA_BASE_URL must be a plain HTTP loopback address.');
  }
  const endpoint = new URL('/api/chat', url);

  return async (body) => {
    let response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        redirect: 'error',
        signal: AbortSignal.timeout(120_000),
      });
    } catch {
      throw new Error(`Cannot reach local Ollama at ${url.origin}. Check that Ollama is running and try again.`);
    }

    const result = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = typeof result?.error === 'string' ? ` ${result.error}` : '';
      throw new Error(`Ollama returned HTTP ${response.status}.${detail}`);
    }
    if (result?.message?.role !== 'assistant') throw new Error('Ollama did not return an assistant message.');
    return result.message;
  };
}

export async function auditWithOllama({ csv, model, chat = createOllamaChat() }) {
  const config = { model, stream: false, think: false, options: { temperature: 0, num_ctx: 2048 } };
  const messages = [
    { role: 'system', content: 'You are a CSV auditor. Use the available tool to inspect the selected file.' },
    { role: 'user', content: 'Run find_duplicate_emails on the email column in my selected CSV.' },
  ];

  const selection = await chat({ ...config, messages, tools });
  const calls = selection.tool_calls;
  if (!Array.isArray(calls) || calls.length !== 1) {
    throw new Error('The model must select the CSV duplicate tool exactly once. Try a tool-capable Ollama model.');
  }
  const call = calls[0]?.function;
  if (call?.name !== toolName || call.arguments?.column !== 'email'
      || Object.keys(call.arguments).length !== 1) {
    throw new Error('The model selected an unsupported tool or column.');
  }

  const report = findDuplicateEmails(csv);
  const { rowsScanned, missingEmails, duplicates, duplicateRows } = report;
  const stats = { rowsScanned, missingEmails, duplicateGroups: duplicates.length, duplicateRows };
  // The model only receives counts. Email values and exact line numbers remain in Node.
  const result = await chat({
    ...config,
    messages: [
      ...messages,
      selection,
      { role: 'tool', tool_name: toolName, content: JSON.stringify(stats) },
      { role: 'user', content: 'Return duplicates_found if duplicateGroups is greater than 0, otherwise no_duplicates.' },
    ],
    format: verdictSchema,
  });

  let finding;
  try {
    finding = JSON.parse(result.content).finding;
  } catch {
    throw new Error('Ollama did not return a structured finding.');
  }
  const expected = duplicates.length ? 'duplicates_found' : 'no_duplicates';
  if (finding !== expected) throw new Error('Ollama’s finding did not agree with the CSV audit.');

  return { model, tool: toolName, finding, ...report };
}
