/**
 * Character identity management for sprite generation consistency.
 * Stores persistent character descriptions, reference image paths, and seeds.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHARACTERS_DIR = path.join(__dirname, '..', 'config', 'characters');
const CHARACTERS_FILE = path.join(CHARACTERS_DIR, 'index.json');

/**
 * Load all saved character identities
 */
export function loadCharacters() {
  try {
    if (existsSync(CHARACTERS_FILE)) {
      return JSON.parse(readFileSync(CHARACTERS_FILE, 'utf8'));
    }
  } catch (_) {}
  return { characters: {}, version: 1 };
}

/**
 * Save all character identities
 */
export function saveCharacters(data) {
  try {
    mkdirSync(CHARACTERS_DIR, { recursive: true });
    writeFileSync(CHARACTERS_FILE, JSON.stringify(data, null, 2), 'utf8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Create or update a character identity
 */
export function createOrUpdateCharacter(id, args) {
  const data = loadCharacters();

  if (!data.characters[id]) {
    data.characters[id] = {
      id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  data.characters[id].updated_at = new Date().toISOString();

  if (args.name) data.characters[id].name = args.name;
  if (args.description) data.characters[id].description = args.description;
  if (args.reference_image) data.characters[id].reference_image = args.reference_image;
  if (typeof args.seed === 'number') data.characters[id].seed = args.seed;
  if (args.style) data.characters[id].style = args.style;
  if (typeof args.generation_count === 'number') data.characters[id].generation_count = args.generation_count;

  data.characters[id].generation_count = (data.characters[id].generation_count || 0) + 1;

  const result = saveCharacters(data);
  if (result.success) {
    return { success: true, character: data.characters[id] };
  }
  return result;
}

/**
 * Get a character identity by ID
 */
export function getCharacter(id) {
  const data = loadCharacters();
  return data.characters[id] || null;
}

/**
 * Delete a character identity
 */
export function deleteCharacter(id) {
  const data = loadCharacters();
  if (!data.characters[id]) return { success: false, error: 'Character not found' };
  delete data.characters[id];
  const result = saveCharacters(data);
  return result.success ? { success: true } : result;
}

/**
 * List all character identities
 */
export function listCharacters() {
  const data = loadCharacters();
  return Object.values(data.characters).map(c => ({
    id: c.id,
    name: c.name,
    style: c.style,
    has_reference: !!c.reference_image,
    generation_count: c.generation_count || 0,
    updated_at: c.updated_at,
  }));
}

/**
 * Build a character prompt that includes identity info for consistency
 */
export function buildCharacterPrompt(characterId, basePrompt, extraContext) {
  const char = getCharacter(characterId);
  if (!char) return basePrompt;

  const parts = [basePrompt];

  if (char.description) {
    parts.push(`\n\nCHARACTER IDENTITY:\n${char.description}`);
  }

  if (extraContext) {
    parts.push(`\n\nCONTEXT: ${extraContext}`);
  }

  return parts.join('\n');
}

/**
 * Convert a local image path to a data URL for API conditioning
 * This is used to pass reference images to Gemini Flash and Stable Diffusion
 */
export async function pathToDataUrl(imagePath) {
  const fs = await import('fs');
  const absPath = path.resolve(imagePath);
  if (!fs.existsSync(absPath)) return null;

  const buffer = fs.readFileSync(absPath);
  const ext = path.extname(absPath).toLowerCase().replace('.', '');
  const mimeType = ext === 'jpg' ? 'image/jpeg' : ext === 'png' ? 'image/png' : 'image/webp';

  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

/**
 * Generate a consistent seed for a character + variation combo
 */
export function getCharacterSeed(characterId, variation = 0) {
  const char = getCharacter(characterId);
  if (!char || !char.seed) {
    return Math.floor(Math.random() * 2 ** 31);
  }
  return (char.seed + variation * 7) % (2 ** 31);
}
