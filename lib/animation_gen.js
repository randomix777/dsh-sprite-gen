/**
 * Animation sequence generation — multi-frame sprite sheets with reference consistency.
 */
import { getProviderConfig } from './config.js';
import { generateImage } from './image_gen.js';
import { ANIMATION_SEQUENCES } from './prompts.js';
import { saveGeneratedImage } from './utils.js';
import { loadImageAsDataURL } from './image_encoder.js';
import * as character from './character.js';
import path from 'path';
import { existsSync, readFileSync } from 'fs';

/**
 * Generate an animation sequence from a reference image.
 * @param {object} args
 * @param {string} args.sequence — key from ANIMATION_SEQUENCES
 * @param {string} args.reference_image_path — path to reference character image
 * @param {string} [args.provider] — AI provider (default: config default)
 * @param {string} [args.output_path] — output path
 * @param {number} [args.strength] — reference image influence (0-1, default 0.65)
 * @param {string} [args.character_id] — character identity ID for persistence
 * @param {number} [args.seed] — fixed seed for reproducibility
 */
export async function generateAnimationSequence(args, ctx) {
  const {
    sequence,
    reference_image_path,
    provider,
    output_path,
    strength,
    character_id,
    seed,
  } = args;

  if (!sequence) return { success: false, error: 'sequence is required' };
  if (!reference_image_path) return { success: false, error: 'reference_image_path is required' };

  const seqDef = ANIMATION_SEQUENCES[sequence];
  if (!seqDef) return { success: false, error: `Unknown sequence: ${sequence}. Available: ${Object.keys(ANIMATION_SEQUENCES).join(', ')}` };

  const fs = await import('fs');
  const absRef = path.resolve(reference_image_path);
  if (!fs.existsSync(absRef)) return { success: false, error: `Reference image not found: ${reference_image_path}` };

  // Load character identity if provided
  let finalPrompt = seqDef.prompt(absRef);
  let resolvedSeed = seed;

  if (character_id) {
    const char = character.getCharacter(character_id);
    if (char) {
      finalPrompt = character.buildCharacterPrompt(character_id, finalPrompt, `Animation sequence: ${seqDef.name}, ${seqDef.frames} frames`);
      if (char.reference_image && char.reference_image !== reference_image_path) {
        // Use character's stored reference image if different from passed one
      }
      if (!resolvedSeed && char.seed) {
        resolvedSeed = char.seed;
      }
    }
  }

  // Determine provider
  const cfg = await import('./config.js');
  const config = cfg.loadConfig();
  const providerId = provider || config.defaultProvider || 'agnes';

  const providerConfig = getProviderConfig(providerId);
  if (!providerConfig) return { success: false, error: `Unknown provider: ${providerId}` };
  if (providerConfig.requiresApiKey && !providerConfig.apiKey) {
    return { success: false, error: `API key required for ${providerConfig.name}`, hint: 'Use sprite_config tool to set up your API key' };
  }

  // Encode reference image for the provider
  const dataUrl = await loadImageAsDataURL(absRef);
  let imageUrls = null;
  let geminiImages = null;
  let sdImage = null;

  if (dataUrl) {
    const mimeType = dataUrl.match(/^data:(image\/[^;]+);base64,/)?.[1] || 'image/png';
    const base64Data = dataUrl.replace(/^data:[^;]+;base64,/, '');

    if (providerId === 'gemini_flash') {
      geminiImages = [{ mimeType, inlineData: base64Data }];
    } else if (providerId === 'stable_diffusion') {
      sdImage = base64Data;
    } else if (providerId === 'agnes') {
      imageUrls = [dataUrl];
    }
  }

  try {
    const genArgs = {
      provider: providerId,
      prompt: finalPrompt,
      width: seqDef.frames <= 4 ? 1024 : 2048,
      height: seqDef.frames <= 4 ? 1024 : 1024,
      num_images: 1,
      imageUrls,
      gemini_images: geminiImages,
      sd_image: sdImage,
      strength: strength ?? 0.65,
      seed: resolvedSeed,
    };

    const gen = await generateImage(genArgs, ctx);
    if (!gen.success) return gen;
    if (!gen.images || gen.images.length === 0) return { success: false, error: 'No images generated' };

    const outPath = output_path || `./output/${sequence}_anim.png`;
    const absPath = saveGeneratedImage(gen.images[0].data, gen.images[0].mimeType, outPath);

    // Update character identity
    if (character_id) {
      character.createOrUpdateCharacter(character_id, { seed: resolvedSeed });
    }

    return {
      success: true,
      output_path: absPath,
      sequence,
      frames: seqDef.frames,
      provider: providerId,
      strength: strength ?? 0.65,
      seed: resolvedSeed,
      has_reference: !!absRef,
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
