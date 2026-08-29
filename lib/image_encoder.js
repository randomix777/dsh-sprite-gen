/**
 * Image encoder for passing local images to AI generation APIs.
 * Supports: base64 data URLs (Gemini), image_urls (Agnes), raw base64 (SD).
 */
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Read and encode an image file to base64 data URL.
 */
export async function loadImageAsDataURL(imagePath) {
  if (!imagePath) return null;
  const fs = await import('fs');
  const abs = path.resolve(__dirname, '..', imagePath.startsWith('/') ? imagePath.slice(1) : imagePath);
  if (!fs.existsSync(abs)) return null;

  const buffer = fs.readFileSync(abs);
  const ext = path.extname(abs).toLowerCase().replace('.', '');
  const mimeType = ext === 'jpg' ? 'image/jpeg' : ext === 'png' ? 'image/png' : 'image/webp';
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

/**
 * Convert one or more image paths to the format expected by each provider.
 *
 * @param {object} options
 * @param {string|string[]} options.imagePaths - Local image path(s)
 * @param {string} options.provider - Provider id
 * @returns {object} Encoded data specific to the provider
 */
export async function encodeImagesForProvider(options) {
  const { imagePaths, provider } = options;
  if (!imagePaths) return {};

  const paths = Array.isArray(imagePaths) ? imagePaths : [imagePaths];
  const results = [];

  for (const p of paths) {
    const dataUrl = await loadImageAsDataURL(p);
    if (dataUrl) results.push(dataUrl);
  }

  if (results.length === 0) return {};

  switch (provider) {
    case 'gemini_flash':
      // Gemini uses inlineData parts with mimeType and data
      return {
        gemini_images: results.map(url => {
          const [, mimeType, base64Data] = url.match(/^data:([^;]+);base64,(.+)$/) || [];
          return { mimeType, inlineData: base64Data };
        }).filter(Boolean),
      };

    case 'stable_diffusion':
      // SD API expects base64 image without data: prefix
      return {
        sd_images: results.map(url => url.replace(/^data:[^;]+;base64,/, '')),
      };

    case 'agnes':
      // Agnes expects public URLs — we store base64 locally and upload via data URL
      // For now, return as data URLs; the caller should upload to a temp host or use local path
      return {
        agnes_image_urls: results, // Agnes accepts data URLs in some endpoints
      };

    default:
      return { generic_urls: results };
  }
}

/**
 * Build Gemini Flash multimodal content parts with reference images.
 */
export function buildGeminiContent(prompt, imageParts) {
  const parts = [{ text: prompt }];
  for (const img of imageParts) {
    parts.push({ inlineData: { mimeType: img.mimeType, data: img.inlineData } });
  }
  return [{ contents: [{ parts }] }];
}

/**
 * Build Stable Diffusion img2img body with reference images.
 * SD API v5 expects image as base64 for img2img.
 */
export function buildSDRequestBody(prompt, imageBase64, options = {}) {
  const body = {
    prompt,
    negative_prompt: options.negative_prompt || '',
    width: options.width || 1024,
    height: options.height || 1024,
    steps: options.steps || 25,
    guidance_scale: options.guidance_scale ?? 7.5,
  };
  if (imageBase64) {
    body.image = imageBase64; // base64 without data: prefix
    body.strength = options.strength ?? 0.65; // 0.65 = moderate consistency
  }
  return body;
}
