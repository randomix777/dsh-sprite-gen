/**
 * Configuration manager for dsh-godot-sprite
 * 
 * Supports multiple image generation providers with custom configuration.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = path.join(__dirname, '..', 'config');
const CONFIG_FILE = path.join(CONFIG_DIR, 'settings.json');

/** Supported image generation providers */
export const IMAGE_PROVIDERS = {
  // Free providers
  gemini_flash: {
    name: 'Google Gemini Flash',
    description: 'Free tier with generous limits (20 req/min)',
    baseUrl: 'https://generativelanguage.googleapis.com',
    model: 'gemini-2.0-flash-exp',
    requiresApiKey: true,
    freeTier: true,
    maxImages: 60,
    rateLimit: '20 requests per minute'
  },
  stable_diffusion: {
    name: 'Stable Diffusion (free)',
    description: 'Free public API (100 images/day)',
    baseUrl: 'https://stable-diffusionapi.com/api/v5',
    model: 'sdxl',
    requiresApiKey: true,
    freeTier: true,
    maxImages: 100,
    rateLimit: '10 requests per minute'
  },
  
  // Paid providers
  openai: {
    name: 'OpenAI DALL-E 3',
    description: 'High quality images ($0.04-0.08/image)',
    baseUrl: 'https://api.openai.com/v1',
    model: 'dall-e-3',
    requiresApiKey: true,
    freeTier: false,
    cost: '$0.04/$0.08 per image'
  },
  seedream: {
    name: 'Seedream (Volcengine)',
    description: 'Chinese AI image generation',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    model: 'doubao-seedream-4-3-256k',
    requiresApiKey: true,
    freeTier: false,
    cost: 'API credits required'
  },
  agnes: {
    name: 'Agnes AI',
    description: 'High quality artistic images',
    baseUrl: 'https://apihub.agnes-ai.com/v1',
    model: 'agnes-image-2.1-flash',
    requiresApiKey: true,
    freeTier: false,
    cost: 'Subscription required'
  },
  
  // Custom provider
  custom: {
    name: 'Custom (OpenAI Compatible)',
    description: 'Any OpenAI-compatible API',
    baseUrl: '',
    model: '',
    requiresApiKey: true,
    freeTier: false
  }
};

/** Default configuration */
const DEFAULT_CONFIG = {
  defaultProvider: 'gemini_flash',
  providers: {},
  spriteSheet: {
    defaultGridCols: 4,
    defaultGridRows: 4,
    defaultCropMode: 'auto',
    defaultSpacing: 0,
    defaultCellWidth: 32,
    defaultCellHeight: 32,
    outputDir: './output'
  },
  credentials: {
    gemini_flash: { apiKey: '' },
    stable_diffusion: { apiKey: '' },
    openai: { apiKey: '' },
    seedream: { apiKey: '' },
    agnes: { apiKey: '' },
    custom: { apiKey: '', baseUrl: '', model: '' }
  }
};

/**
 * Load configuration
 */
export function loadConfig() {
  try {
    if (existsSync(CONFIG_FILE)) {
      const data = readFileSync(CONFIG_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('[godot-sprite] Failed to load config:', err.message);
  }
  return { ...DEFAULT_CONFIG };
}

/**
 * Save configuration
 */
export function saveConfig(config) {
  try {
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Get provider configuration
 */
export function getProviderConfig(provider) {
  const config = loadConfig();
  const providerConfig = IMAGE_PROVIDERS[provider];
  if (!providerConfig) return null;
  
  const cred = config.credentials?.[provider] || {};
  return {
    ...providerConfig,
    ...cred,
    apiKey: cred.apiKey || cred.api_key || '',
    baseUrl: cred.baseUrl || cred.base_url || providerConfig.baseUrl || '',
    model: cred.model || providerConfig.model || ''
  };
}

/**
 * Set provider configuration
 */
export function setProviderConfig(provider, settings) {
  const config = loadConfig();
  if (!config.credentials) config.credentials = {};
  if (!config.credentials[provider]) config.credentials[provider] = {};
  
  Object.assign(config.credentials[provider], settings);
  return saveConfig(config);
}

/**
 * Get all providers
 */
export function listProviders() {
  return Object.entries(IMAGE_PROVIDERS).map(([id, config]) => ({
    id,
    name: config.name,
    description: config.description,
    requiresApiKey: config.requiresApiKey,
    freeTier: config.freeTier || false
  }));
}

/**
 * Validate configuration
 */
export function validateConfig(config) {
  const errors = [];
  
  if (!config.defaultProvider || !IMAGE_PROVIDERS[config.defaultProvider]) {
    errors.push('Invalid default provider');
  }
  
  // Check API keys for required providers
  for (const [provider, settings] of Object.entries(config.credentials || {})) {
    const providerConfig = IMAGE_PROVIDERS[provider];
    if (providerConfig?.requiresApiKey && !settings?.apiKey) {
      errors.push(`Missing API key for ${providerConfig.name}`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Get current configuration summary
 */
export function getConfigSummary() {
  const config = loadConfig();
  const providers = listProviders();
  
  return {
    defaultProvider: config.defaultProvider,
    providers: providers.map(p => ({
      ...p,
      configured: !!config.credentials?.[p.id]?.apiKey
    }))
  };
}

