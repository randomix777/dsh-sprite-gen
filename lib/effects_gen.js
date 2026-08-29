/**
 * Effects generation — bullets, fire, particles, explosions.
 */
import { getProviderConfig } from './config.js';
import { generateImage } from './image_gen.js';
import { EFFECT_PROMPTS } from './prompts.js';
import { saveGeneratedImage } from './utils.js';

/**
 * Generate a sprite effect (bullet, fire, particle, etc.)
 * @param {object} args
 * @param {string} args.effect — key from EFFECT_PROMPTS
 * @param {string} [args.provider]
 * @param {string} [args.output_path]
 * @param {number} [args.width] — default 64
 * @param {number} [args.height] — default 64
 * @param {object} [ctx]
 */
export async function generateEffect(args, ctx) {
  const {
    effect,
    provider,
    output_path,
    width = 64,
    height = 64,
  } = args;

  if (!effect) return { success: false, error: 'effect is required' };
  const promptText = EFFECT_PROMPTS[effect];
  if (!promptText) return { success: false, error: `Unknown effect: ${effect}. Available: ${Object.keys(EFFECT_PROMPTS).join(', ')}` };

  const cfg = await import('./config.js');
  const config = cfg.loadConfig();
  const providerId = provider || config.defaultProvider || 'agnes';
  const providerConfig = getProviderConfig(providerId);
  if (!providerConfig) return { success: false, error: `Unknown provider: ${providerId}` };
  if (providerConfig.requiresApiKey && !providerConfig.apiKey) {
    return { success: false, error: `API key required for ${providerConfig.name}` };
  }

  try {
    const gen = await generateImage({
      provider: providerId,
      prompt: promptText,
      width,
      height,
      num_images: 1,
    }, ctx);
    if (!gen.success) return gen;
    if (!gen.images || gen.images.length === 0) return { success: false, error: 'No images generated' };

    const outPath = output_path || `./output/effects/${effect}.png`;
    const fs = await import('fs');
    const path = await import('path');
    const absPath = path.resolve(outPath);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    saveGeneratedImage(gen.images[0].data, gen.images[0].mimeType, absPath);

    return { success: true, output_path: absPath, effect, provider: providerId, size: [width, height] };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * List all available effects.
 */
export function listEffects() {
  return Object.keys(EFFECT_PROMPTS).map((key) => ({
    id: key,
    description: EFFECT_PROMPTS[key].split('\n')[0],
  }));
}
