/**
 * Weapon & equipment layer generation.
 */
import { getProviderConfig } from './config.js';
import { generateImage } from './image_gen.js';
import { WEAPON_PROMPTS } from './prompts.js';
import { saveGeneratedImage } from './utils.js';

/**
 * Generate a weapon/equipment sprite.
 * @param {object} args
 * @param {string} args.weapon — key from WEAPON_PROMPTS
 * @param {string} [args.provider]
 * @param {string} [args.output_path]
 * @param {number} [args.width] — default 128
 * @param {number} [args.height] — default 128
 * @param {object} [ctx]
 */
export async function generateWeapon(args, ctx) {
  const {
    weapon,
    provider,
    output_path,
    width = 128,
    height = 128,
  } = args;

  if (!weapon) return { success: false, error: 'weapon is required' };
  const promptText = WEAPON_PROMPTS[weapon];
  if (!promptText) return { success: false, error: `Unknown weapon: ${weapon}. Available: ${Object.keys(WEAPON_PROMPTS).join(', ')}` };

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

    const outPath = output_path || `./output/weapons/${weapon}.png`;
    const fs = await import('fs');
    const path = await import('path');
    const absPath = path.resolve(outPath);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    saveGeneratedImage(gen.images[0].data, gen.images[0].mimeType, absPath);

    return { success: true, output_path: absPath, weapon, provider: providerId };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * List all available weapons/equipment.
 */
export function listWeapons() {
  return Object.keys(WEAPON_PROMPTS).map((key) => ({
    id: key,
    description: WEAPON_PROMPTS[key].split('\n')[0],
  }));
}
