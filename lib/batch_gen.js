/**
 * Batch generation — generate multiple assets in sequence.
 */
import { generateImage } from './image_gen.js';
import { runPythonScript } from './utils.js';

/**
 * Batch generate sprite sheets for multiple prompts.
 * @param {object} args
 * @param {Array<{prompt:string, output_path:string, width?:number, height?:number, grid_cols?:number, grid_rows?:number}>} args.items
 * @param {string} [args.provider]
 * @param {object} [ctx]
 */
export async function batchGenerate(args, ctx) {
  const { items, provider } = args;
  if (!Array.isArray(items) || items.length === 0) return { success: false, error: 'items array is required' };

  const cfg = await import('./config.js');
  const config = cfg.loadConfig();
  const providerId = provider || config.defaultProvider || 'agnes';

  const results = [];
  let errors = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      const gen = await generateImage({
        provider: providerId,
        prompt: item.prompt,
        width: item.width ?? 1024,
        height: item.height ?? 1024,
        num_images: 1,
      }, ctx);

      if (!gen.success || !gen.images || gen.images.length === 0) {
        errors++;
        results.push({ index: i, success: false, error: gen.error || 'No images generated', prompt: item.prompt });
        continue;
      }

      const outputPath = item.output_path || `./output/batch_${i}.png`;
      const fs = await import('fs');
      const path = await import('path');
      const absPath = path.resolve(outputPath);
      fs.mkdirSync(path.dirname(absPath), { recursive: true });
      const buffer = Buffer.from(gen.images[0].data, 'base64');
      fs.writeFileSync(absPath, buffer);

      results.push({ index: i, success: true, output_path: absPath, prompt: item.prompt });
    } catch (err) {
      errors++;
      results.push({ index: i, success: false, error: err.message, prompt: item.prompt });
    }
  }

  return {
    success: errors === 0,
    total: items.length,
    succeeded: items.length - errors,
    failed: errors,
    results,
  };
}

/**
 * Batch process existing images through the sprite sheet pipeline.
 * @param {object} args
 * @param {Array<{image_path:string, output_path:string, grid_cols?:number, grid_rows?:number, crop_mode?:string}>} args.items
 */
export async function batchProcess(args) {
  const { items } = args;
  if (!Array.isArray(items) || items.length === 0) return { success: false, error: 'items array is required' };

  const results = [];
  let errors = 0;

  for (let i = 0; i < items.length; i++) {
    try {
      const result = await runPythonScript({
        image_path: items[i].image_path,
        grid_cols: items[i].grid_cols ?? 4,
        grid_rows: items[i].grid_rows ?? 4,
        crop_mode: items[i].crop_mode ?? 'auto',
        output_path: items[i].output_path,
      });
      results.push({ index: i, success: result.success, ...result });
    } catch (err) {
      errors++;
      results.push({ index: i, success: false, error: err.message });
    }
  }

  return {
    success: errors === 0,
    total: items.length,
    succeeded: items.length - errors,
    failed: errors,
    results,
  };
}
