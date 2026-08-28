/**
 * Host side of dsh-godot-sprite plugin
 */

import { existsSync, writeFileSync } from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

import {
  loadConfig,
  saveConfig,
  getProviderConfig,
  listProviders,
  getConfigSummary,
  IMAGE_PROVIDERS
} from './config.js';
import { generateImage } from './image_gen.js';
import { registerSettingsSection } from './settings.js';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PYTHON_SCRIPT = path.join(__dirname, 'process_sprites.py');

/**
 * Run the sprite sheet processing script with a base64-encoded JSON args payload.
 */
async function runPythonScript(args) {
  const encoded = Buffer.from(JSON.stringify(args)).toString('base64');
  const { stdout } = await execFileAsync('python', [PYTHON_SCRIPT, encoded], {
    cwd: process.cwd()
  });
  return JSON.parse(stdout);
}

/**
 * Save generated image data (base64) to disk and return the absolute path.
 */
function saveGeneratedImage(data, mimeType, outputPath) {
  const abs = path.resolve(outputPath);
  const buffer = Buffer.from(data, 'base64');
  writeFileSync(abs, buffer);
  return abs;
}

/**
 * Main plugin entry
 */
export function apply(ctx) {
  const harness = ctx.get('harness');

  if (!harness) {
    console.warn('[godot-sprite] harness service not available');
    return;
  }

  // Try to register settings section if dsh-settings is available
  registerSettingsSection(ctx);

  // Register configuration management tool (manages API keys and defaults)
  harness.registerTool(ctx, harness.defineTool({
    name: 'godot_sprite_config',
    description: 'Manage Godot sprite plugin configuration: view providers, set API keys, configure defaults.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'get', 'set', 'set_key', 'set_provider', 'get_default'],
          description: 'Configuration action'
        },
        provider: {
          type: 'string',
          description: 'Provider ID (for set/set_key/set_provider actions)'
        },
        api_key: {
          type: 'string',
          description: 'API key (for set/set_key actions)'
        },
        base_url: {
          type: 'string',
          description: 'Custom base URL (for custom provider)'
        },
        model: {
          type: 'string',
          description: 'Custom model (for custom provider)'
        },
        default_provider: {
          type: 'string',
          description: 'Default provider ID (for set_provider action)'
        },
        sprite_sheet: {
          type: 'object',
          description: 'Sprite sheet defaults (for set action)'
        },
        config: {
          type: 'object',
          description: 'Full configuration object (for set action)'
        }
      },
      required: ['action']
    },
    output: {
      schema: { type: 'object' },
      render: (_a, v) => [{
        type: 'text',
        text: v.success ? JSON.stringify(v.data, null, 2) : `Error: ${v.error}`
      }]
    },
    execute: async (args) => {
      const config = loadConfig();

      switch (args.action) {
        case 'list':
          return {
            success: true,
            data: {
              defaultProvider: config.defaultProvider,
              providers: listProviders().map(p => ({
                ...p,
                hasKey: !!config.credentials?.[p.id]?.apiKey
              })),
              spriteSheet: config.spriteSheet || {}
            }
          };

        case 'get':
          return { success: true, data: config };

        case 'get_default':
          return {
            success: true,
            data: {
              defaultProvider: config.defaultProvider,
              ...(config.spriteSheet || {})
            }
          };

        case 'set':
          if (args.config) {
            saveConfig({ ...config, ...args.config });
            return { success: true, data: getConfigSummary() };
          }
          if (args.sprite_sheet) {
            saveConfig({ ...config, spriteSheet: { ...config.spriteSheet, ...args.sprite_sheet } });
            return { success: true, data: getConfigSummary() };
          }
          if (args.default_provider) {
            if (!IMAGE_PROVIDERS[args.default_provider]) {
              return { error: `Unknown provider: ${args.default_provider}` };
            }
            saveConfig({ ...config, defaultProvider: args.default_provider });
            return { success: true, data: getConfigSummary() };
          }
          return { error: 'Missing provider or config' };

        case 'set_key': {
          if (!args.provider || !args.api_key) {
            return { error: 'Missing provider or api_key' };
          }
          if (!IMAGE_PROVIDERS[args.provider]) {
            return { error: `Unknown provider: ${args.provider}` };
          }
          const credentials = {
            ...(config.credentials || {}),
            [args.provider]: {
              apiKey: args.api_key,
              ...(args.base_url ? { baseUrl: args.base_url } : {}),
              ...(args.model ? { model: args.model } : {})
            }
          };
          saveConfig({ ...config, credentials });
          return { success: true, data: getConfigSummary() };
        }

        case 'set_provider': {
          if (!args.provider || !IMAGE_PROVIDERS[args.provider]) {
            return { error: `Invalid or unknown provider: ${args.provider}` };
          }
          saveConfig({ ...config, defaultProvider: args.provider });
          return { success: true, data: getConfigSummary() };
        }

        default:
          return { error: `Unknown action: ${args.action}` };
      }
    }
  }));

  // Register sprite sheet tool
  harness.registerTool(ctx, harness.defineTool({
    name: 'godot_sprite_sheet',
    description: 'Generate a Godot-compatible sprite sheet from an image. Supports auto-crop, grid arrangement, and transparent edge removal.',
    parameters: {
      type: 'object',
      properties: {
        image_path: { type: 'string', description: 'Input image path' },
        grid_cols: { type: 'integer', default: 4 },
        grid_rows: { type: 'integer', default: 4 },
        crop_mode: { type: 'string', enum: ['auto', 'fixed', 'none'], default: 'auto' },
        spacing: { type: 'integer', default: 0 },
        cell_width: { type: 'integer', default: 32 },
        cell_height: { type: 'integer', default: 32 },
        output_path: { type: 'string', default: './output/sprite_sheet.png' },
        padding: { type: 'integer', default: 0 }
      },
      required: ['image_path']
    },
    output: {
      schema: { type: 'object' },
      render: (_a, v) => [{
        type: 'text',
        text: v.success ? `Sprite sheet generated: ${v.output_path}` : `Error: ${v.error}`
      }]
    },
    execute: async (args) => {
      try {
        const result = await runPythonScript({
          image_path: args.image_path,
          grid_cols: args.grid_cols ?? 4,
          grid_rows: args.grid_rows ?? 4,
          crop_mode: args.crop_mode ?? 'auto',
          spacing: args.spacing ?? 0,
          cell_width: args.cell_width ?? 32,
          cell_height: args.cell_height ?? 32,
          output_path: args.output_path ?? './output/sprite_sheet.png',
          padding: args.padding ?? 0
        });
        return result;
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  }));

  // Register image generation + sprite sheet tool
  harness.registerTool(ctx, harness.defineTool({
    name: 'godot_generate_image',
    description: 'Generate an AI image and convert it to a Godot sprite sheet. Supports multiple providers.',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        provider: { type: 'string', default: 'gemini_flash' },
        negative_prompt: { type: 'string', default: '' },
        width: { type: 'integer', default: 1024 },
        height: { type: 'integer', default: 1024 },
        num_images: { type: 'integer', default: 1 },
        grid_cols: { type: 'integer', default: 4 },
        grid_rows: { type: 'integer', default: 4 },
        crop_mode: { type: 'string', enum: ['auto', 'fixed', 'none'], default: 'auto' },
        output_path: { type: 'string', default: './output/generated.png' }
      },
      required: ['prompt']
    },
    output: {
      schema: { type: 'object' },
      render: (_a, v) => [{
        type: 'text',
        text: v.success ? `Generated sprite sheet: ${v.output_path}` : `Error: ${v.error}`
      }]
    },
    execute: async (args) => {
      try {
        const gen = await generateImage(args, ctx);
        if (!gen.success) {
          return { success: false, ...gen };
        }

        if (!gen.images || gen.images.length === 0) {
          return { success: false, error: 'No images generated' };
        }

        // Save the first generated image to a temp file, then build the sprite sheet.
        const outPath = args.output_path || './output/generated.png';
        const tmpImagePath = path.join(__dirname, '..', 'config', '.generated_tmp.png');
        saveGeneratedImage(gen.images[0].data, gen.images[0].mimeType, tmpImagePath);

        const sheetResult = await runPythonScript({
          image_path: tmpImagePath,
          grid_cols: args.grid_cols ?? 4,
          grid_rows: args.grid_rows ?? 4,
          crop_mode: args.crop_mode ?? 'auto',
          spacing: 0,
          cell_width: args.width ?? 1024,
          cell_height: args.height ?? 1024,
          output_path: outPath,
          padding: 0
        });

        if (!sheetResult.success) {
          return sheetResult;
        }

        return {
          success: true,
          output_path: outPath,
          output_size: sheetResult.output_size,
          grid_cols: sheetResult.grid_cols,
          grid_rows: sheetResult.grid_rows,
          crop_mode: sheetResult.crop_mode
        };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  }));

  // Register info tool
  harness.registerTool(ctx, harness.defineTool({
    name: 'godot_sprite_info',
    description: 'View information about the Godot sprite plugin, including supported providers and current configuration.',
    parameters: {
      type: 'object',
      properties: {}
    },
    output: {
      schema: { type: 'object' },
      render: (_a, v) => [{
        type: 'text',
        text: v.success ? JSON.stringify(v.data, null, 2) : `Error: ${v.error}`
      }]
    },
    execute: async () => {
      const config = loadConfig();
      return {
        success: true,
        data: {
          name: 'dsh-godot-sprite',
          version: '2.0.0',
          defaultProvider: config.defaultProvider,
          providers: listProviders(),
          configured: getConfigSummary().providers.filter(p => p.configured).map(p => p.id)
        }
      };
    }
  }));

  console.log('[godot-sprite] Tools registered successfully');
}

export const name = 'godot-sprite';
export const inject = ['harness'];
