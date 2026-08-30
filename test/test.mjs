/**
 * dsh-sprite-gen test suite — Node.js (built-in test runner)
 *
 * Run:  node --test test/
 * Or:   npm test
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { existsSync, mkdirSync, readFileSync, unlinkSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, 'fixtures');
const OUTPUT = path.join(__dirname, 'output');
const TMP = path.join(OUTPUT, 'tmp');

mkdirSync(TMP, { recursive: true });

// ---------------------------------------------------------------------------
// Module-loading smoke tests
// ---------------------------------------------------------------------------

describe('Module loading (ESM)', () => {
  for (const mod of [
    '../lib/utils.js',
    '../lib/config.js',
    '../lib/safe_write.js',
    '../lib/analysis.js',
    '../lib/image_gen.js',
    '../lib/sprite_edit.js',
    '../lib/index.js',
  ]) {
    it(`import ${mod}`, async () => {
      const m = await import(mod);
      assert(m, `${mod} must export something`);
    });
  }
});

// ---------------------------------------------------------------------------
// Safe-write tests
// ---------------------------------------------------------------------------

describe('safe_write', async () => {
  const { safeWrite, safeWriteText } = await import('../lib/safe_write.js');

  it('writes a file to disk', () => {
    const out = path.join(TMP, 'safe_write_test.txt');
    const r = safeWrite(Buffer.from('hello world'), out);
    assert.strictEqual(r.success, true);
    assert.strictEqual(existsSync(out), true);
    assert.strictEqual(readFileSync(out, 'utf8'), 'hello world');
    unlinkSync(out);
  });

  it('refuses to overwrite when overwrite=false (default)', () => {
    const out = path.join(TMP, 'no_overwrite.txt');
    safeWrite(Buffer.from('first'), out);
    const r = safeWrite(Buffer.from('second'), out);
    assert.strictEqual(r.success, false);
    assert.ok(r.error.includes('overwrite=false'));
    unlinkSync(out);
  });

  it('overwrites when overwrite=true', () => {
    const out = path.join(TMP, 'overwrite.txt');
    safeWrite(Buffer.from('first'), out);
    const r = safeWrite(Buffer.from('second'), out, { overwrite: true });
    assert.strictEqual(r.success, true);
    assert.strictEqual(readFileSync(out, 'utf8'), 'second');
    unlinkSync(out);
  });

  it('dry_run=true does not write', () => {
    const out = path.join(TMP, 'dryrun.txt');
    const r = safeWrite(Buffer.from('data'), out, { dry_run: true });
    assert.strictEqual(r.success, true);
    assert.strictEqual(r.dry_run, true);
    assert.strictEqual(existsSync(out), false);
  });

  it('validation callback can reject', () => {
    const out = path.join(TMP, 'validated.txt');
    const r = safeWrite(Buffer.from('good'), out, {
      validate: (data) => {
        if (data.toString() !== 'good') return { valid: false, error: 'bad data' };
        return { valid: true };
      }
    });
    assert.strictEqual(r.success, true);

    const r2 = safeWrite(Buffer.from('bad'), out, { overwrite: true,
      validate: (data) => ({ valid: false, error: 'intentionally rejected' }) });
    assert.strictEqual(r2.success, false);
    assert.strictEqual(r2.error.includes('validation failed'), true);
    try { unlinkSync(out); } catch {}
  });

  it('backup creates timestamped backup when overwriting', () => {
    const out = path.join(TMP, 'backup_test.txt');
    safeWrite(Buffer.from('original'), out);
    const r = safeWrite(Buffer.from('replacement'), out, { overwrite: true, backup: true });
    assert.strictEqual(r.success, true);
    assert.ok(r.backup_path !== null);
    assert.ok(r.backup_path.includes('backup'));
    assert.strictEqual(readFileSync(out, 'utf8'), 'replacement');
    assert.strictEqual(readFileSync(r.backup_path, 'utf8'), 'original');
    unlinkSync(out);
    try { unlinkSync(r.backup_path); } catch {}
  });
});

// ---------------------------------------------------------------------------
// Python analysis smoke test
// ---------------------------------------------------------------------------

describe('Python analysis (lib/analysis.py)', { concurrency: false }, () => {
  it('returns valid JSON and correct structure', async () => {
    const { analyzeImage } = await import('../lib/analysis.js');
    const result = await analyzeImage({
      image_path: path.join(FIXTURES, 'valid_asset.png'),
    });
    assert.strictEqual(result.success, true);
    assert.ok('passed' in result);
    assert.ok('severity' in result);
    assert.ok('warnings' in result);
    assert.ok('failures' in result);
    assert.ok('recommended_action' in result);
    assert.ok(Array.isArray(result.frames));
    assert.ok('image_size' in result);
  });

  it('flags checkerboard background as P0 failure', async () => {
    const { analyzeImage } = await import('../lib/analysis.js');
    const result = await analyzeImage({
      image_path: path.join(FIXTURES, 'checkerboard_grey_character.png'),
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.passed, false);
    assert.ok(result.severity === 'P0');
    assert.ok(result.failures.some(f => f.toLowerCase().includes('checkerboard')));
  });

  it('flags black/white checkerboard as P0 failure', async () => {
    const { analyzeImage } = await import('../lib/analysis.js');
    const result = await analyzeImage({
      image_path: path.join(FIXTURES, 'checkerboard_bw_weapon.png'),
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.passed, false);
    assert.ok(result.failures.some(f => f.toLowerCase().includes('checkerboard')));
  });

  it('valid_asset.png passes QC', async () => {
    const { analyzeImage } = await import('../lib/analysis.js');
    const result = await analyzeImage({
      image_path: path.join(FIXTURES, 'valid_asset.png'),
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.passed, true);
  });

  it('empty_image.png fails (low colour diversity P0)', async () => {
    const { analyzeImage } = await import('../lib/analysis.js');
    const result = await analyzeImage({
      image_path: path.join(FIXTURES, 'empty_image.png'),
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.passed, false);
    assert.ok(result.failures.some(f => f.toLowerCase().includes('colour') || f.toLowerCase().includes('blank')));
  });

  it('isolated_fragments.png triggers small-fragment warning', async () => {
    const { analyzeImage } = await import('../lib/analysis.js');
    const result = await analyzeImage({
      image_path: path.join(FIXTURES, 'isolated_fragments.png'),
    });
    assert.strictEqual(result.success, true);
    assert.ok(result.warnings.some(w => w.toLowerCase().includes('fragment')));
  });

  it('subject_at_edge.png flags border contact', async () => {
    const { analyzeImage } = await import('../lib/analysis.js');
    const result = await analyzeImage({
      image_path: path.join(FIXTURES, 'subject_at_edge.png'),
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.passed, false);
    assert.ok(result.failures.some(f => f.toLowerCase().includes('border')));
  });

  it('non_divisible_sheet.png warns about grid alignment', async () => {
    const { analyzeImage } = await import('../lib/analysis.js');
    const result = await analyzeImage({
      image_path: path.join(FIXTURES, 'non_divisible_sheet.png'),
      grid_cols: 8,
      grid_rows: 8,
      cell_size: 64,
    });
    assert.strictEqual(result.success, true);
    assert.ok(result.grid_validation.warnings.length > 0);
    assert.ok(result.grid_validation.warnings.some(w => w.includes('not divisible')));
  });

  it('sparse_effect_sheet.png can use explicit regions', async () => {
    const { analyzeImage } = await import('../lib/analysis.js');
    const regions = [
      { name: 'cell_0_0', x: 0, y: 0, w: 64, h: 64 },
      { name: 'cell_1_1', x: 64, y: 64, w: 64, h: 64 },
      { name: 'cell_2_2', x: 128, y: 128, w: 64, h: 64 },
    ];
    const result = await analyzeImage({
      image_path: path.join(FIXTURES, 'sparse_effect_sheet.png'),
      regions,
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.frames.length, 3);
    assert.strictEqual(result.frames[0].region, 'cell_0_0');
  });

  it('checkerboard score drops or removed_pixels significant after cutout', async () => {
    const { analyzeImage } = await import('../lib/analysis.js');
    const before = await analyzeImage({
      image_path: path.join(FIXTURES, 'checkerboard_grey_character.png'),
    });
    const beforeScore = before.frames[0]?.checkerboard_score ?? 0;

    const outPath = path.join(TMP, 'cutout_checkerboard_grey.png');
    const cutResult = await runPythonCutout({
      image_path: path.join(FIXTURES, 'checkerboard_grey_character.png'),
      output_path: outPath,
      mode: 'checkerboard',
    });
    assert.strictEqual(cutResult.success, true);
    assert.ok(cutResult.info?.removed_pixels > 1000,
      `should have removed checkerboard pixels, got ${cutResult.info?.removed_pixels}`);

    const after = await analyzeImage({ image_path: outPath });
    const afterScore = after.frames[0]?.checkerboard_score ?? 0;
    const removed = cutResult.info?.removed_pixels ?? 0;

    assert.ok(afterScore < beforeScore || removed > 1000,
      `checkerboard should be reduced or pixels removed: before=${beforeScore}, after=${afterScore}, removed=${removed}`);
    unlinkSync(outPath);
    try { unlinkSync(outPath.replace('.png', '.mask.png')); } catch {}
  });
});

// ---------------------------------------------------------------------------
// Python cutout tests
// ---------------------------------------------------------------------------

describe('Python cutout (lib/cutout.py)', { concurrency: false }, () => {
  it('solid mode removes background on solid_bg_character', async () => {
    const outPath = path.join(TMP, 'cutout_solid_char.png');
    const result = await runPythonCutout({
      image_path: path.join(FIXTURES, 'solid_bg_character.png'),
      output_path: outPath,
      mode: 'solid',
      lab_threshold: 20.0,
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.mode, 'solid');
    assert.ok(existsSync(outPath));
    assert.ok(result.validation.corners_ok, 'corners should be transparent');
    unlinkSync(outPath);
    try { unlinkSync(outPath.replace('.png', '.mask.png')); } catch {}
  });

  it('checkerboard mode detects alternating pattern', async () => {
    const outPath = path.join(TMP, 'cutout_checkerboard.png');
    const result = await runPythonCutout({
      image_path: path.join(FIXTURES, 'checkerboard_grey_character.png'),
      output_path: outPath,
      mode: 'checkerboard',
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.mode, 'checkerboard');
    assert.ok(result.info.removed_pixels > 1000, 'should have removed pixels');
    unlinkSync(outPath);
    try { unlinkSync(outPath.replace('.png', '.mask.png')); } catch {}
  });

  it('auto mode picks checkerboard for alternating bg', async () => {
    const outPath = path.join(TMP, 'cutout_auto.png');
    const result = await runPythonCutout({
      image_path: path.join(FIXTURES, 'checkerboard_bw_weapon.png'),
      output_path: outPath,
      mode: 'auto',
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.mode, 'auto');
    assert.ok(result.info.auto_decision !== undefined);
    unlinkSync(outPath);
    try { unlinkSync(outPath.replace('.png', '.mask.png')); } catch {}
  });

  it('mask_only mode outputs greyscale mask', async () => {
    const outPath = path.join(TMP, 'cutout_mask.png');
    const result = await runPythonCutout({
      image_path: path.join(FIXTURES, 'solid_bg_character.png'),
      output_path: outPath,
      mode: 'mask_only',
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.mode, 'mask_only');
    assert.ok(existsSync(outPath));
    unlinkSync(outPath);
  });

  it('cutout does not delete metal_weapon white highlights', async () => {
    const { analyzeImage } = await import('../lib/analysis.js');
    const outPath = path.join(TMP, 'cutout_metal.png');
    const result = await runPythonCutout({
      image_path: path.join(FIXTURES, 'metal_weapon.png'),
      output_path: outPath,
      mode: 'solid',
      lab_threshold: 20.0,
    });
    assert.strictEqual(result.success, true);
    const qc = await analyzeImage({ image_path: outPath });
    const fragScore = qc.frames[0]?.alpha_fringe_score ?? 0;
    assert.ok(fragScore < 0.5, `fringe score should be low (not over-cleaned): ${fragScore}`);
    unlinkSync(outPath);
    try { unlinkSync(outPath.replace('.png', '.mask.png')); } catch {}
  });

  it('overwrite=false refuses to overwrite existing file', async () => {
    const outPath = path.join(TMP, 'no_overwrite_cutout.png');
    await runPythonCutout({
      image_path: path.join(FIXTURES, 'solid_bg_character.png'),
      output_path: outPath,
      mode: 'solid',
    });
    // Now try again with overwrite=false (default)
    const { safeWrite } = await import('../lib/safe_write.js');
    const swResult = safeWrite(Buffer.alloc(1), outPath, { overwrite: false, dry_run: true });
    assert.strictEqual(swResult.success, false);
    assert.ok(swResult.error.includes('overwrite=false'));
    unlinkSync(outPath);
  });
});

// ---------------------------------------------------------------------------
// sprite_edit module tests
// ---------------------------------------------------------------------------

describe('sprite_edit.js', async () => {
  const { editSprite, IMAGE_EDIT_PROVIDERS } = await import('../lib/sprite_edit.js');

  it('IMAGE_EDIT_PROVIDERS is a Set of supported providers', () => {
    assert.ok(IMAGE_EDIT_PROVIDERS instanceof Set);
    assert.ok(IMAGE_EDIT_PROVIDERS.has('gemini_flash'));
    assert.ok(IMAGE_EDIT_PROVIDERS.has('stable_diffusion'));
    assert.ok(IMAGE_EDIT_PROVIDERS.has('agnes'));
    assert.ok(IMAGE_EDIT_PROVIDERS.has('comfy'));
  });

  it('fails with unsupported provider', async () => {
    const r = await editSprite({
      image_path: path.join(FIXTURES, 'valid_asset.png'),
      prompt: 'add a hat',
      provider: 'nonexistent_provider',
    });
    assert.strictEqual(r.success, false);
    assert.ok(r.error.includes('does not support image editing'));
  });

  it('fails when image_path does not exist', async () => {
    const r = await editSprite({
      image_path: path.join(FIXTURES, 'nonexistent_file.png'),
      prompt: 'add a hat',
    });
    assert.strictEqual(r.success, false);
    assert.ok(r.error.includes('not found'));
  });

  it('fails when neither image_path nor session_id provided', async () => {
    const r = await editSprite({ prompt: 'add a hat' });
    assert.strictEqual(r.success, false);
    assert.ok(r.error.includes('image_path') || r.error.includes('session_id'));
  });
});

// ---------------------------------------------------------------------------
// process_sprites.py single-entry test
// ---------------------------------------------------------------------------

describe('process_sprites.py single main entry', { concurrency: false }, () => {
  it('only outputs one JSON object per invocation', async () => {
    const outPath = path.join(TMP, 'process_sprites_one_output.png');
    const encoded = Buffer.from(JSON.stringify({
      command: 'cutout',
      image_path: path.join(FIXTURES, 'solid_bg_character.png'),
      output_path: outPath,
      mode: 'solid',
    })).toString('base64');
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(execFile);
    const pythonBin = process.env.PYTHON_BIN || 'python';
    const { stdout } = await execFileAsync(pythonBin, [
      path.join(__dirname, '..', 'lib', 'process_sprites.py'),
      encoded,
    ]);
    const lines = stdout.trim().split('\n').filter(l => l.trim());
    assert.strictEqual(lines.length, 1, `Expected 1 JSON line, got ${lines.length}: ${stdout}`);
    const parsed = JSON.parse(lines[0]);
    assert.strictEqual(parsed.success, true);
    try { unlinkSync(outPath); } catch {}
    try { unlinkSync(outPath.replace('.png', '.mask.png')); } catch {}
  });
});

// ---------------------------------------------------------------------------
// Fixture file existence
// ---------------------------------------------------------------------------

describe('Test fixtures exist', () => {
  const manifestPath = path.join(FIXTURES, 'manifest.json');
  let manifest;

  before(() => {
    const data = readFileSync(manifestPath, 'utf8');
    manifest = JSON.parse(data);
  });

  for (const fixture of (manifest?.fixtures || [])) {
    it(`fixture: ${fixture.name}`, () => {
      const fp = path.join(FIXTURES, fixture.name);
      assert.strictEqual(existsSync(fp), true, `${fixture.name} should exist`);
    });
  }
});

// ---------------------------------------------------------------------------
// Helper: run Python cutout via Node child_process
// ---------------------------------------------------------------------------

async function runPythonCutout(args) {
  const { execFile } = await import('child_process');
  const { promisify } = await import('util');
  const execFileAsync = promisify(execFile);
  const encoded = Buffer.from(JSON.stringify(args)).toString('base64');
  const pythonBin = process.env.PYTHON_BIN || 'python';
  const libDir = path.join(__dirname, '..', 'lib');
  const { stdout } = await execFileAsync(pythonBin, ['cutout.py', encoded], { cwd: libDir });
  return JSON.parse(stdout.trim());
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

after(() => {
  try {
    for (const f of readdirSync(TMP)) {
      try { unlinkSync(path.join(TMP, f)); } catch {}
    }
  } catch {}
});
