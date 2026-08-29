/**
 * Animation sequence generation — multi-frame sprite sheets with reference consistency.
 */
import { getProviderConfig } from './config.js';
import { generateImage } from './image_gen.js';
import { ANIMATION_SEQUENCES } from './prompts.js';
import { saveGeneratedImage } from './utils.js';

/**
 * Generate an animation sequence from a reference image.
 * @param {object} args
 * @param {string} args.sequence — key from ANIMATION_SEQUENCES
 * @param {string} args.reference_image_path — path to reference character image
 * @param {string} [args.provider] — AI provider (default: config default)
 * @param {string} [args.output_path] — output path
 * @param {object} [ctx] — DSH context
 */
export async function generateAnimationSequence(args, ctx) {
  const {
    sequence,
    reference_image_path,
    provider,
    output_path,
  } = args;

  if (!sequence) return { success: false, error: 'sequence is required' };
  if (!reference_image_path) return { success: false, error: 'reference_image_path is required' };

  const seqDef = ANIMATION_SEQUENCES[sequence];
  if (!seqDef) return { success: false, error: `Unknown sequence: ${sequence}. Available: ${Object.keys(ANIMATION_SEQUENCES).join(', ')}` };

  // Check if reference image exists
  const fs = await import('fs');
  const path = await import('path');
  const absRef = path.resolve(reference_image_path);
  if (!fs.existsSync(absRef)) return { success: false, error: `Reference image not found: ${reference_image_path}` };

  // Build prompt with reference image info
  const prompt = seqDef.prompt(absRef);

  // Determine provider
  const cfg = await import('./config.js');
  const config = cfg.loadConfig();
  const providerId = provider || config.defaultProvider || 'agnes';

  // Get provider config
  const providerConfig = getProviderConfig(providerId);
  if (!providerConfig) return { success: false, error: `Unknown provider: ${providerId}` };
  if (providerConfig.requiresApiKey && !providerConfig.apiKey) {
    return { success: false, error: `API key required for ${providerConfig.name}`, hint: 'Use godot_sprite_config tool to set up your API key' };
  }

  try {
    const genArgs = {
      provider: providerId,
      prompt,
      width: seqDef.frames <= 4 ? 1024 : 2048,
      height: seqDef.frames <= 4 ? 1024 : 1024,
      num_images: 1,
    };

    const gen = await generateImage(genArgs, ctx);
    if (!gen.success) return gen;
    if (!gen.images || gen.images.length === 0) return { success: false, error: 'No images generated' };

    const outPath = output_path || `./output/${sequence}_anim.png`;
    const absPath = saveGeneratedImage(gen.images[0].data, gen.images[0].mimeType, outPath);

    return {
      success: true,
      output_path: tmpPath,
      sequence,
      frames: seqDef.frames,
      provider: providerId,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * List all available animation sequences.
 */
export function listAnimationSequences() {
  return Object.entries(ANIMATION_SEQUENCES).map(([key, def]) => ({
    id: key,
    name: def.name,
    frames: def.frames,
  }));
}
