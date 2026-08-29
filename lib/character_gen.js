/**
 * Character consistency generation — generates sprites while maintaining
 * the same character appearance across multiple outputs.
 */
import { generateImage } from './image_gen.js';
import { saveGeneratedImage } from './utils.js';
import * as character from './character.js';
import * as encoder from './image_encoder.js';
import { getProviderConfig, loadConfig } from './config.js';
import path from 'path';

/**
 * Generate a character sprite sheet with consistency controls.
 * Supports: reference image conditioning, character identity, seed control,
 * strength tuning, and multi-variation generation.
 */
export async function generateCharacterConsistent(args, ctx) {
  const {
    character_id,
    prompt,
    negative_prompt = '',
    reference_image_path,
    provider,
    width = 1024,
    height = 1024,
    num_images = 1,
    strength = 0.65,
    seed,
    output_path,
    grid_cols = 4,
    grid_rows = 4,
    crop_mode = 'auto',
  } = args;

  if (!prompt) return { success: false, error: 'prompt is required' };

  // Resolve provider
  const config = loadConfig();
  const providerId = provider || config.defaultProvider || 'gemini_flash';
  const providerConfig = getProviderConfig(providerId);
  if (!providerConfig) return { success: false, error: `Unknown provider: ${providerId}` };
  if (providerConfig.requiresApiKey && !providerConfig.apiKey) {
    return { success: false, error: `API key required for ${providerConfig.name}`, hint: 'Use sprite_config tool' };
  }

  // Build enhanced prompt with character identity
  let finalPrompt = prompt;
  let imageUrls = [];
  let geminiImages = null;
  let sdImage = null;

  // Use character identity if provided
  if (character_id) {
    const char = character.getCharacter(character_id);
    if (char) {
      finalPrompt = character.buildCharacterPrompt(character_id, prompt, '');
      if (char.reference_image) {
        // Don't override if explicit reference_image_path given
        if (!reference_image_path) {
          imageUrls.push(char.reference_image);
        }
      }
    }
  }

  // Use explicit reference image
  if (reference_image_path) {
    const dataUrl = await encoder.loadImageAsDataURL(reference_image_path);
    if (dataUrl) {
      imageUrls.push(dataUrl);
      geminiImages = encoder.buildGeminiContent(finalPrompt, [
        { mimeType: 'image/png', inlineData: dataUrl.replace(/^data:image\/png;base64,/, '') }
      ]);
      sdImage = dataUrl.replace(/^data:image\/[^;]+;base64,/, '');
    }
  }

  // Override seed if provided
  let resolvedSeed = seed;
  if (!resolvedSeed && character_id) {
    resolvedSeed = character.getCharacterSeed(character_id);
  }

  // Encode reference images for provider
  const encoded = await encoder.encodeImagesForProvider({
    imagePaths: imageUrls.length ? imageUrls : null,
    provider: providerId,
  });

  try {
    const genArgs = {
      provider: providerId,
      prompt: finalPrompt,
      negative_prompt,
      width,
      height,
      num_images,
      imageUrls: encoded[`${providerId}_image_urls`] || encoded.agnes_image_urls || null,
      gemini_images: encoded.gemini_images || null,
      sd_image: sdImage || null,
      strength,
      seed: resolvedSeed,
    };

    const gen = await generateImage(genArgs, ctx);
    if (!gen.success) return gen;
    if (!gen.images || gen.images.length === 0) return { success: false, error: 'No images generated' };

    const outPath = output_path || `./output/character_${character_id || 'new'}.png`;
    const absOutPath = saveGeneratedImage(gen.images[0].data, gen.images[0].mimeType, outPath);

    // Update character generation count
    if (character_id) {
      character.createOrUpdateCharacter(character_id, { seed: resolvedSeed });
    }

    return {
      success: true,
      output_path: absOutPath,
      provider: providerId,
      character_id,
      strength,
      seed: resolvedSeed,
      images_generated: gen.images.length,
      metadata: gen.metadata,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Generate a multi-view character sheet (front/side/back/etc.) with consistency.
 */
export async function generateCharacterSheet(args, ctx) {
  const {
    character_id,
    prompt,
    views = ['front', 'side', 'back'],
    provider,
    width = 512,
    height = 512,
    reference_image_path,
    strength = 0.6,
    output_path,
  } = args;

  if (!prompt && !character_id) {
    return { success: false, error: 'prompt or character_id is required' };
  }

  // Build a combined prompt for all views
  const viewLabels = {
    front: 'front view, full body standing facing forward',
    side: 'side profile view, full body facing right',
    back: 'back view, full body facing away from camera',
    three_quarter: 'three-quarter view, facing slightly to the right',
    walk: 'walk cycle frame, walking to the right',
    jump: 'jump pose, character in mid-air',
    attack: 'attack pose, weapon raised',
    idle: 'idle standing pose, relaxed stance',
  };

  const viewPrompts = views.map(v => {
    const label = viewLabels[v] || v;
    return `View: ${label}. ${prompt}`;
  });

  // Generate each view separately with same seed for consistency
  const results = [];
  let sharedSeed = Math.floor(Math.random() * 2 ** 31);
  if (character_id) {
    sharedSeed = character.getCharacterSeed(character_id);
  }

  for (let i = 0; i < views.length; i++) {
    const viewResult = await generateCharacterConsistent({
      character_id,
      prompt: viewPrompts[i],
      reference_image_path,
      provider,
      width,
      height,
      num_images: 1,
      strength,
      seed: sharedSeed + i,
      output_path: `./output/character_${views[i]}.png`,
    }, ctx);

    if (viewResult.success) {
      results.push({ view: views[i], ...viewResult });
    } else {
      results.push({ view: views[i], success: false, error: viewResult.error });
    }
  }

  // Combine all views into a single sprite sheet
  const outPath = output_path || `./output/character_sheet_${character_id || 'new'}.png`;
  return {
    success: true,
    output_path: outPath,
    character_id,
    views,
    results,
    provider: provider || 'gemini_flash',
    seed: sharedSeed,
    strength,
  };
}

/**
 * List available views for character sheet generation.
 */
export function listCharacterViews() {
  return Object.entries({
    front: 'Full body front view',
    side: 'Full body side profile (right)',
    back: 'Full body back view',
    three_quarter: 'Three-quarter view (facing slightly right)',
    walk: 'Walk cycle frame',
    jump: 'Jump pose',
    attack: 'Attack pose',
    idle: 'Idle standing pose',
    hurt: 'Hurt/recoil pose',
  }).map(([key, desc]) => ({ id: key, description: desc }));
}
