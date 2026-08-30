/**
 * sprite_edit — send an image to an AI provider for inpainting / editing.
 *
 * Supports:
 *   - session_id  (provider reads from active MCP session)
 *   - image_path (provider reads from local file, no session needed)
 *
 * Provider capabilities are checked; if the provider cannot handle images
 * the tool fails explicitly rather than silently falling back to text-only.
 */

import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateImage } from './image_gen.js';
import { runPythonScript } from './utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Attempt to detect whether a provider supports image input.
 * Returns the list of providers known to support image-based editing.
 */
export const IMAGE_EDIT_PROVIDERS = new Set([
  'gemini_flash',
  'stable_diffusion',
  'agnes',
  'comfy',
]);

/**
 * Send a base64 image to a provider for editing/inpainting.
 *
 * @param {object} args
 * @param {string} args.prompt                  - Edit instruction
 * @param {string} [args.image_path]            - Local image path (preferred over session)
 * @param {string} [args.session_id]            - MCP session ID for provider-based image
 * @param {string} [args.provider]              - AI provider (default: gemini_flash)
 * @param {string} [args.output_path]           - Output PNG path
 * @param {number} [args.width=1024]
 * @param {number} [args.height=1024]
 * @param {boolean} [args.preserve_pose=true]
 * @param {boolean} [args.preserve_canvas=true]
 * @param {boolean} [args.preserve_subject=true]
 * @param {boolean} [args.transparent_background=false]
 * @param {boolean} [args.postprocess=true]     - Run cutout after generation
 * @param {boolean} [args.qc=true]              - Run QC before saving
 * @param {object} [args.ctx]                   - Harness ctx (for generateImage)
 * @returns {Promise<{success, output_path, provider, qc, postprocess, error}>}
 */
export async function editSprite(args, ctx = null) {
  const provider = args.provider || 'gemini_flash';

  if (!IMAGE_EDIT_PROVIDERS.has(provider)) {
    return {
      success: false,
      error: `Provider "${provider}" does not support image editing. ` +
             `Supported providers: ${[...IMAGE_EDIT_PROVIDERS].join(', ')}. ` +
             `Do not fall back to text-only generation.`
    };
  }

  let imageData = null;
  let mimeType = 'image/png';
  let resolvedPath = null;

  if (args.image_path) {
    resolvedPath = path.resolve(args.image_path);
    if (!existsSync(resolvedPath)) {
      return { success: false, error: `image_path not found: ${resolvedPath}` };
    }
    const buffer = readFileSync(resolvedPath);
    imageData = buffer.toString('base64');
    mimeType = resolvedPath.endsWith('.jpg') || resolvedPath.endsWith('.jpeg')
      ? 'image/jpeg' : 'image/png';
  } else if (args.session_id) {
    return {
      success: false,
      error: 'session_id editing requires MCP context; ' +
             'pass image_path for local file editing instead.'
    };
  } else {
    return {
      success: false,
      error: 'Must provide image_path or session_id for sprite_edit.'
    };
  }

  if (!imageData) {
    return {
      success: false,
      error: `Could not read image data from ${resolvedPath || args.image_path}`
    };
  }

  const images = [{ data: imageData, mimeType }];
  const width = args.width ?? 1024;
  const height = args.height ?? 1024;

  const styleHint = args.transparent_background
    ? ', transparent background, PNG with alpha channel'
    : '';
  const poseHint = args.preserve_pose !== false ? ', preserve the subject pose and composition' : '';
  const canvasHint = args.preserve_canvas !== false ? ', keep original canvas size and framing' : '';
  const subjectHint = args.preserve_subject !== false ? ', preserve the character/object identity' : '';

  const enhancedPrompt = `${args.prompt}${styleHint}${poseHint}${canvasHint}${subjectHint}`;

  const genArgs = {
    prompt: enhancedPrompt,
    provider,
    width,
    height,
    num_images: 1,
    negative_prompt: args.negative_prompt || 'blurry, low quality, artifacts, wrong anatomy',
  };

  if (imageData) {
    genArgs.gemini_images = [{ inlineData: imageData, mimeType }];
    genArgs.imageUrls = [`data:${mimeType};base64,${imageData}`];
    genArgs.sd_image = imageData;
  }

  const gen = await generateImage(genArgs, ctx);

  if (!gen.success) {
    return { success: false, error: gen.error || 'generation failed' };
  }

  const rawData = gen.images?.[0]?.data;
  const rawMime = gen.images?.[0]?.mimeType;
  if (!rawData) {
    return { success: false, error: 'No image returned from provider' };
  }

  const outputPath = args.output_path || './output/edited.png';
  const absOutput = path.resolve(outputPath);
  const tmpDir = path.dirname(absOutput);
  const tmpFile = path.join(tmpDir, `.tmp.edit.${Date.now()}.png`);

  const { mkdirSync, writeFileSync, renameSync } = await import('fs');
  mkdirSync(tmpDir, { recursive: true });
  writeFileSync(tmpFile, Buffer.from(rawData, 'base64'));

  let finalPath = absOutput;
  const final = { success: true, output_path: absOutput, provider, qc: null, postprocess: null };

  if (args.qc !== false) {
    const { analyzeImage } = await import('./analysis.js');
    const qcResult = await analyzeImage({ image_path: tmpFile });
    final.qc = qcResult;

    if (!qcResult.passed && qcResult.severity === 'P0') {
      return {
        success: false,
        output_path: tmpFile,
        candidate_path: tmpFile,
        error: `QC failed (${qcResult.severity}): ${qcResult.failures?.join('; ') || 'see qc result'}. ` +
               `Not writing to final path. Candidate saved at: ${tmpFile}`
      };
    }
  }

  if (args.postprocess !== false) {
    const cutResult = await runPythonScript({
      command: 'cutout',
      image_path: tmpFile,
      output_path: tmpFile,
      mode: 'auto',
      feather_radius: 1,
      decontaminate_edges: true,
    });
    final.postprocess = cutResult;

    if (!cutResult.success) {
      return {
        success: false,
        output_path: tmpFile,
        error: `postprocess cutout failed: ${cutResult.error}`
      };
    }
  }

  renameSync(tmpFile, absOutput);
  return final;
}
