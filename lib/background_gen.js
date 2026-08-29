/**
 * Parallax background generation — 3-layer side-scroller backgrounds.
 */
import { getProviderConfig } from './config.js';
import { generateImage } from './image_gen.js';
import { PARALLAX_PROMPTS } from './prompts.js';

/**
 * Generate a 3-layer parallax background.
 * @param {object} args
 * @param {string} args.character_prompt — description of the character/world
 * @param {string} args.character_image_url — URL of character image (for layer 2/3 reference)
 * @param {string} [args.layer1_url] — existing layer 1 URL (for regeneration)
 * @param {string} [args.layer2_url] — existing layer 2 URL
 * @param {string} [args.provider]
 * @param {object} [ctx]
 */
export async function generateParallaxBackground(args, ctx) {
  const {
    character_prompt,
    character_image_url,
    layer1_url,
    layer2_url,
    provider,
  } = args;

  if (!character_prompt) return { success: false, error: 'character_prompt is required' };
  if (!character_image_url) return { success: false, error: 'character_image_url is required' };

  const cfg = await import('./config.js');
  const config = cfg.loadConfig();
  const providerId = provider || config.defaultProvider || 'agnes';
  const providerConfig = getProviderConfig(providerId);
  if (!providerConfig) return { success: false, error: `Unknown provider: ${providerId}` };
  if (providerConfig.requiresApiKey && !providerConfig.apiKey) {
    return { success: false, error: `API key required for ${providerConfig.name}` };
  }

  const generateLayer = async (prompt, imageUrls) => {
    const gen = await generateImage({
      provider: providerId,
      prompt,
      imageUrls,
      width: 1536,
      height: 640,
      num_images: 1,
    }, ctx);
    if (!gen.success || !gen.images?.length) return null;
    return gen.images[0];
  };

  try {
    // Layer 1: Sky/Backdrop
    const layer1Img = await generateLayer(
      PARALLAX_PROMPTS.layer1(character_prompt),
      [character_image_url]
    );
    if (!layer1Img) return { success: false, error: 'Failed to generate layer 1 (sky)' };

    // Layer 2: Midground
    const layer2Img = await generateLayer(
      PARALLAX_PROMPTS.layer2,
      [character_image_url, layer1Img.url]
    );
    if (!layer2Img) return { success: false, error: 'Failed to generate layer 2 (midground)' };

    // Layer 3: Foreground
    const layer3Img = await generateLayer(
      PARALLAX_PROMPTS.layer3,
      [character_image_url, layer1Img.url, layer2Img.url]
    );
    if (!layer3Img) return { success: false, error: 'Failed to generate layer 3 (foreground)' };

    return {
      success: true,
      layers: {
        layer1_url: layer1Img.url,
        layer2_url: layer2Img.url,
        layer3_url: layer3Img.url,
      },
      size: { width: 1536, height: 640 },
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Regenerate a single layer of an existing parallax background.
 */
export async function regenerateParallaxLayer(args, ctx) {
  const {
    character_prompt,
    character_image_url,
    layer1_url,
    layer2_url,
    layer3_url,
    regenerate_layer, // 1, 2, or 3
    provider,
  } = args;

  if (!regenerate_layer || regenerate_layer < 1 || regenerate_layer > 3) {
    return { success: false, error: 'regenerate_layer must be 1, 2, or 3' };
  }

  const cfg = await import('./config.js');
  const config = cfg.loadConfig();
  const providerId = provider || config.defaultProvider || 'agnes';
  const providerConfig = getProviderConfig(providerId);

  const results = { layer1_url, layer2_url, layer3_url };

  if (regenerate_layer === 1) {
    const gen = await generateImage({
      provider: providerId,
      prompt: PARALLAX_PROMPTS.layer1(character_prompt),
      imageUrls: [character_image_url],
      width: 1536, height: 640, num_images: 1,
    }, ctx);
    if (!gen.success || !gen.images?.length) return { success: false, error: 'Failed to regenerate layer 1' };
    results.layer1_url = gen.images[0].url;
  } else if (regenerate_layer === 2) {
    const gen = await generateImage({
      provider: providerId,
      prompt: PARALLAX_PROMPTS.layer2,
      imageUrls: [character_image_url, layer1_url],
      width: 1536, height: 640, num_images: 1,
    }, ctx);
    if (!gen.success || !gen.images?.length) return { success: false, error: 'Failed to regenerate layer 2' };
    results.layer2_url = gen.images[0].url;
  } else if (regenerate_layer === 3) {
    const gen = await generateImage({
      provider: providerId,
      prompt: PARALLAX_PROMPTS.layer3,
      imageUrls: [character_image_url, layer1_url, layer2_url],
      width: 1536, height: 640, num_images: 1,
    }, ctx);
    if (!gen.success || !gen.images?.length) return { success: false, error: 'Failed to regenerate layer 3' };
    results.layer3_url = gen.images[0].url;
  }

  return { success: true, layers: results };
}
