/**
 * Shared utilities — avoids circular dependencies between index.js and sub-modules.
 */
import { writeFileSync, existsSync } from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PYTHON_SCRIPT = path.join(__dirname, 'process_sprites.py');
const execFileAsync = promisify(execFile);

/**
 * Save generated image data (base64) to disk and return the absolute path.
 */
export function saveGeneratedImage(data, mimeType, outputPath) {
  const abs = path.resolve(outputPath);
  const buffer = Buffer.from(data, 'base64');
  writeFileSync(abs, buffer);
  return abs;
}

/**
 * Run a Python processing command via process_sprites.py.
 * Args are base64-encoded and passed as the first CLI argument.
 */
export async function runPythonScript(args) {
  const encoded = Buffer.from(JSON.stringify(args)).toString('base64');
  const pythonBin = process.env.PYTHON_BIN || 'python';
  try {
    const [stdout, stderr] = await Promise.all([
      execFileAsync(pythonBin, [PYTHON_SCRIPT, encoded], {
        cwd: path.join(__dirname, '..'),
        timeout: 120000,
        maxBuffer: 10 * 1024 * 1024,
      }),
    ]);
    return JSON.parse(stdout.trim());
  } catch (err) {
    const msg = err.stderr?.trim() || err.message || 'Python execution failed';
    return { success: false, error: msg };
  }
}
