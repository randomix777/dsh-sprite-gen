/**
 * Shared utilities — avoids circular dependencies between index.js and sub-modules.
 */
import { writeFileSync } from 'fs';
import path from 'path';

/**
 * Save generated image data (base64) to disk and return the absolute path.
 */
export function saveGeneratedImage(data, mimeType, outputPath) {
  const abs = path.resolve(outputPath);
  const buffer = Buffer.from(data, 'base64');
  writeFileSync(abs, buffer);
  return abs;
}
