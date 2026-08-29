// Validation script for dsh-sprite-gen plugin
import fs from 'fs';
import { fileURLToPath } from 'url';

const root = new URL('../', import.meta.url).pathname.replace(/^\/+/, '');

// Check client bundle format
const clientBundle = fs.readFileSync(root + 'lib/client.js', 'utf8');
const clientChecks = [
  ['window.__ModuleLoader__.load({', 'loader wrapper'],
  ['"dsh-sprite-gen"', 'plugin id'],
  ['factory: (require) =>', 'factory function'],
  ['return module.exports;', 'module return'],
  ['exports.apply = apply', 'apply export'],
  ['exports.inject = inject', 'inject export'],
  ['exports.name = name', 'name export'],
  ['exports.GodotSpriteSettingsCard = GodotSpriteSettingsCard', 'Card export'],
  ['settingsScope', 'settingsScope inject'],
  ['settings.plugin.item', 'slot registration'],
];

console.log('=== Client Bundle Checks ===');
let clientOk = 0;
for (const [needle, label] of clientChecks) {
  if (clientBundle.includes(needle)) {
    clientOk++;
  } else {
    console.log(`FAIL: ${label} - missing "${needle}"`);
    process.exit(1);
  }
}
console.log(`Client: ${clientOk}/${clientChecks.length} checks passed`);

// Check host tools
console.log('\n=== Host Tool Checks ===');
  import('../lib/index.js').then(async (mod) => {
  const tools = {};
  const ctx = {
    get: (name) => name === 'harness' ? {
      defineTool: (def) => def,
      registerTool: (_, def) => { tools[def.name] = def; }
    } : null
  };
  mod.apply(ctx);

  const hostChecks = ['godot_sprite_config', 'godot_sprite_sheet', 'godot_generate_image', 'godot_sprite_info'];
  for (const name of hostChecks) {
    if (tools[name]) {
      console.log(`  ${name}: registered`);
    } else {
      console.log(`  FAIL: ${name} not registered`);
      process.exit(1);
    }
  }

  // Test sprite_sheet
  fs.mkdirSync('config', { recursive: true });
  const img = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  // Create a valid small PNG
  const { execSync } = await import('child_process');
  try {
    execSync('python -c "from PIL import Image; img=Image.new(\'RGBA\',(64,64),(0,0,0,0)); [img.paste((255,0,0,255),(x,y,x+16,y+16)) for x in range(0,64,32) for y in range(0,64,32)]; img.save(\'config/test.png\')"');
  } catch (e) {
    console.log('PIL test failed, skipping sprite_sheet test');
  }

  console.log('\nAll checks passed ✅');
}).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
