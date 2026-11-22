# Ollama CSV Duplicate Finder

A local CSV audit that uses Ollama tool calling. Qwen selects one read-only tool. The tool finds duplicate addresses and their physical CSV line numbers, then Ollama returns a structured finding from the counts.

Built with AI assistance as a small portfolio project for local agent workflows. The example contains fictional records with reserved `example.com` addresses.

## Run the demo

Use Node.js 22.13 or later and a local [Ollama installation](https://ollama.com/download). Start Ollama on its default loopback address. To disable Ollama cloud features, start its server with `OLLAMA_NO_CLOUD=1`. This demo uses a model downloaded to your machine.

```sh
ollama pull qwen3:1.7b
npm ci
npm test
npm run demo
```

To audit another UTF-8 CSV, use `node src/cli.js path/to/file.csv`. Add `--json` for a machine-readable report. `OLLAMA_BASE_URL` can point to a different local port.

## How it works

1. The CLI reads the selected CSV locally. Ollama receives a fixed request and one tool schema.
2. The app validates the tool name and arguments. The tool lowercases and trims addresses, groups duplicates and returns the source lines. Empty addresses are counted separately.
3. The app sends only aggregate counts back to Ollama. It compares the structured finding with the tool’s counts before displaying the report. File contents, email addresses and row numbers stay in the Node process.

The input needs an `email` header and can contain up to 500 data rows and 256 KiB. Quoted and multiline fields are supported. The audit checks exact matches after normalization and reports them without editing the CSV.

## Example

The provided CSV contains six data rows, one empty address and two duplicate groups. The report identifies `ada@example.com` on lines 2 and 4 and `noah@example.com` on lines 3 and 6.

The [verified JSON output](examples/verified-result.json) is from a CPU-only Windows run with Ollama 0.40.17, Qwen3 1.7B, and cloud features disabled. Run `npm run demo -- --json` to reproduce it.

[Ollama tool-calling documentation](https://docs.ollama.com/capabilities/tool-calling)
