import { open } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { auditWithOllama, createOllamaChat } from './ollama.js';

const maxCsvBytes = 256 * 1024;
const usage = 'Usage: node src/cli.js PATH.csv [--model qwen3:1.7b] [--json]';

async function readInput(path) {
  const file = await open(path, 'r');
  try {
    const info = await file.stat();
    if (!info.isFile()) throw new Error('Select a CSV file.');
    if (info.size > maxCsvBytes) throw new Error('The CSV exceeds 256 KiB.');
    const buffer = Buffer.alloc(maxCsvBytes + 1);
    let total = 0;
    while (total < buffer.length) {
      const { bytesRead } = await file.read(buffer, total, buffer.length - total);
      if (bytesRead === 0) break;
      total += bytesRead;
    }
    if (total > maxCsvBytes) throw new Error('The CSV exceeds 256 KiB.');
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, total));
  } finally {
    await file.close();
  }
}

function printReport(report) {
  const { model, tool, finding, rowsScanned, missingEmails, duplicateRows, duplicates } = report;
  console.log(`Ollama ${model} called ${tool}.`);
  console.log(finding === 'duplicates_found' ? 'Duplicate email addresses found.' : 'No duplicate email addresses found.');
  console.log(`Scanned ${rowsScanned} rows · ${missingEmails} empty · ${duplicates.length} duplicate groups · ${duplicateRows} repeated rows`);
  for (const { email, lines } of duplicates) console.log(`${email} · CSV lines ${lines.join(', ')}`);
}

async function main() {
  const { positionals, values } = parseArgs({
    options: {
      help: { type: 'boolean', short: 'h' },
      model: { type: 'string', default: 'qwen3:1.7b' },
      json: { type: 'boolean' },
    },
    allowPositionals: true,
  });
  if (values.help) return console.log(usage);
  if (positionals.length !== 1) throw new Error(usage);
  if (!values.model.trim() || values.model.endsWith('-cloud') || values.model.endsWith(':cloud')) {
    throw new Error('Choose a locally installed model, such as qwen3:1.7b.');
  }
  const csv = await readInput(positionals[0]);
  const chat = createOllamaChat(process.env.OLLAMA_BASE_URL);
  const report = await auditWithOllama({ csv, model: values.model, chat });
  if (values.json) console.log(JSON.stringify(report, null, 2));
  else printReport(report);
}

try {
  await main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
