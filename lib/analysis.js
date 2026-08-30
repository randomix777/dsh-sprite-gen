/**
 * Node.js wrapper for the Python QC analysis module.
 *
 * Always dynamically imports the Python script — never use require() (ESM).
 * Returns a structured report: pass / warnings / failures / severity / recommended_action.
 */

import { runPythonScript } from './utils.js';

const COMMAND = 'analyze';

/**
 * Run QC analysis on a sprite image.
 * @param {object} args
 * @param {string} args.image_path        - Required
 * @param {number} [args.grid_cols=0]
 * @param {number} [args.grid_rows=0]
 * @param {number} [args.cell_size=32]
 * @param {Array<{name,x,y,w,h}>} [args.regions]  - Explicit region list
 * @returns {Promise<{success,passed,severity,severity_counts,warnings,failures,
 *                   recommended_action,image_size,channels,frames,grid_validation}>}
 */
export async function analyzeImage(args) {
  if (!args || !args.image_path) {
    return { success: false, error: 'image_path is required' };
  }

  const payload = {
    command: COMMAND,
    image_path: args.image_path,
    grid_cols: args.grid_cols ?? 0,
    grid_rows: args.grid_rows ?? 0,
    cell_size: args.cell_size ?? 32,
    regions: args.regions ?? null,
  };

  const result = await runPythonScript(payload);
  if (!result.success) {
    return {
      success: true,
      passed: false,
      severity: 'P0',
      severity_counts: { P0: 1, P1: 0, P2: 0 },
      warnings: [],
      failures: [result.error || 'analysis failed'],
      recommended_action: 'FAIL — analysis could not run',
      image_size: null,
      channels: 0,
      frames: [],
      grid_validation: { warnings: [], failures: [] },
    };
  }
  return result;
}
