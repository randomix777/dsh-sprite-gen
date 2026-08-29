/**
 * Host-side settings namespace registration for dsh-sprite-gen.
 *
 * Bridges the DSH settings service (when available) to the plugin's
 * file-backed configuration (`config/settings.json`). When `@deepseek-ai/dsh-settings`
 * is not installed (it is an optional peer dependency) this module is a no-op and the
 * plugin keeps working purely through file-backed config and the sprite__config tool.
 */

import {
  loadConfig,
  saveConfig
} from './config.js';

export const SPRITE_NAMESPACE = 'sprite-gen';

/** Bridging options carried through to the settings scope. */
export function registerSettingsSection(ctx) {
  try {
    const dshSettings = ctx.get('@deepseek-ai/dsh-settings');
    if (!dshSettings) return false;

    // Provide a sparse write bridge into the file-backed config so that the
    // browser settings card persists through the same store the tools read.
    const bridge = {
      read: () => {
        const config = loadConfig();
        return {
          defaultProvider: config.defaultProvider,
          spriteSheet: config.spriteSheet || {},
          credentials: config.credentials || {}
        };
      },
      write: (patch) => {
        saveConfig({ ...loadConfig(), ...patch });
      }
    };

    // Try the canonical DSH registration surface if present, else fall back to
    // a guarded settings.service.update call. Both are optional.
    let scope;
    if (typeof dshSettings.register === 'function') {
      // Minimal opaque schema resolver: accept whatever shape the page writes.
      const opaque = { parse: (v) => v ?? {} };
      scope = dshSettings.register(SPRITE_NAMESPACE, opaque, {
        setSource: (current) => {
          // setSource receives the current value; persist it through our file store.
          bridge.write(current === undefined ? {} : current);
          return current ?? bridge.read();
        },
        onChange: () => {}
      });
    // Seed the source with the current file-backed value if the scope exposes setSource.
    // This bridges the DSH settings document to our file store for persistence.
    if (scope && typeof scope === 'function') {
        // no-op
      }
    } else if (dshSettings.service && typeof dshSettings.service.register === 'function') {
      scope = dshSettings.service.register(SPRITE_NAMESPACE, { parse: (v) => v ?? {} });
    }

    console.log(`[sprite-gen] Settings namespace '${SPRITE_NAMESPACE}' registered`);
    return true;
  } catch (err) {
    console.warn('[sprite-gen] Could not register DSH settings namespace:', err.message);
    return false;
  }
}
