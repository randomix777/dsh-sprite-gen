/**
 * Safe file-writing utilities.
 *
 * All write operations:
 * - default overwrite=false (no silent overwrites)
 * - atomic: write to temp file first, then rename
 * - backup with timestamp when overwriting
 * - output path resolved to absolute
 * - parent dirs created automatically
 * - validation can reject before final move
 */

import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

function resolveSafe(userPath, mustBeUnderRoot = false) {
  const abs = path.resolve(userPath);
  if (mustBeUnderRoot) {
    const rel = path.relative(PROJECT_ROOT, abs);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error(`SAFE_WRITE: path "${userPath}" escapes project root`);
    }
  }
  return abs;
}

function ensureDir(filePath) {
  mkdirSync(path.dirname(filePath), { recursive: true });
}

function readFileOrEmpty(filePath) {
  try { return readFileSync(filePath); } catch { return null; }
}

function atomicWrite(tmpPath, finalPath) {
  if (existsSync(finalPath)) {
    const dir = path.dirname(finalPath);
    const base = path.basename(finalPath, path.extname(finalPath));
    const ext = path.extname(finalPath);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupPath = path.join(dir, `${base}.backup.${stamp}${ext}`);
    renameSync(finalPath, backupPath);
    return backupPath;
  }
  return null;
}

/**
 * Write binary data safely.
 * @param {Buffer} data
 * @param {string} userOutputPath
 * @param {object} opts
 * @param {boolean} [opts.overwrite=false]
 * @param {boolean} [opts.dry_run=false]
 * @param {boolean} [opts.backup=true]
 * @param {boolean} [opts.allow_project_escape=false]
 * @param {Function} [opts.validate]  fn(data) => {valid:bool, error?:string}
 * @returns {{success, input_path, candidate_path, final_path, backup_path, validation, dry_run}}
 */
export function safeWrite(data, userOutputPath, opts = {}) {
  const {
    overwrite = false,
    dry_run = false,
    backup = true,
    allow_project_escape = false,
    validate = null,
  } = opts;

  try {
    const absOutput = resolveSafe(userOutputPath, !allow_project_escape);

    if (!overwrite && existsSync(absOutput)) {
      return {
        success: false,
        input_path: absOutput,
        candidate_path: null,
        final_path: absOutput,
        backup_path: null,
        validation: null,
        dry_run,
        error: 'File exists and overwrite=false; refusing to replace',
      };
    }

    if (validate) {
      const v = validate(data);
      if (!v.valid) {
        return {
          success: false,
          input_path: absOutput,
          candidate_path: null,
          final_path: null,
          backup_path: null,
          validation: v,
          dry_run,
          error: `validation failed: ${v.error || 'unknown reason'}`,
        };
      }
    }

    if (dry_run) {
      return {
        success: true,
        input_path: absOutput,
        candidate_path: null,
        final_path: null,
        backup_path: null,
        validation: null,
        dry_run: true,
      };
    }

    ensureDir(absOutput);
    const tmpDir = path.dirname(absOutput);
    const tmpFile = path.join(tmpDir, `.tmp.${Date.now()}.${path.basename(absOutput)}`);

    writeFileSync(tmpFile, data);
    let backupPath = null;
    if (backup && existsSync(absOutput)) {
      backupPath = atomicWrite(tmpFile, absOutput);
    } else if (existsSync(absOutput)) {
      unlinkSync(absOutput);
    }
    renameSync(tmpFile, absOutput);

    return {
      success: true,
      input_path: absOutput,
      candidate_path: tmpFile,
      final_path: absOutput,
      backup_path: backupPath,
      validation: null,
      dry_run: false,
    };
  } catch (err) {
    return {
      success: false,
      input_path: userOutputPath,
      candidate_path: null,
      final_path: null,
      backup_path: null,
      validation: null,
      dry_run,
      error: err.message,
    };
  }
}

/**
 * Write text content safely (convenience wrapper).
 */
export function safeWriteText(text, outputPath, opts = {}) {
  return safeWrite(Buffer.from(text, 'utf8'), outputPath, opts);
}
