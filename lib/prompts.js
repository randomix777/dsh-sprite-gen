/**
 * Prompt templates for sprite generation.
 * Consolidated from agnes-sprite-gen/prompts.py and sprite-sheet-creator prompts.
 */

// ─── Character Prompts ───────────────────────────────────────────────────────

export const CHARACTER_PROMPTS = {
  // Side-scroller
  walk: `Create a 4-frame pixel art walk cycle sprite sheet of this character.
Arrange the 4 frames in a 2x2 grid on white background. The character is walking to the right.
Frame 1 (top-left): Right leg forward, left leg back — stride position.
Frame 2 (top-right): Legs close together, passing/crossing — transition.
Frame 3 (bottom-left): Left leg forward, right leg back — opposite stride.
Frame 4 (bottom-right): Legs close together, passing/crossing — transition back.
Use detailed 32-bit pixel art style with proper shading and highlights. Same character design in all frames. Character facing right.`,

  jump: `Create a 4-frame pixel art jump animation sprite sheet of this character.
Arrange the 4 frames in a 2x2 grid on white background. The character is jumping.
Frame 1 (top-left): Crouch/anticipation — character slightly crouched, knees bent, preparing to jump.
Frame 2 (top-right): Rising — character in air, legs tucked up, arms up, ascending.
Frame 3 (bottom-left): Apex/peak — character at highest point of jump, body stretched or tucked.
Frame 4 (bottom-right): Landing — character landing, slight crouch to absorb impact.
Use detailed 32-bit pixel art style. Same character design in all frames. Character facing right.`,

  attack: `Create a 4-frame pixel art attack animation sprite sheet of this character.
Arrange the 4 frames in a 2x2 grid on white background. The character is performing an attack that fits their design.
Frame 1 (top-left): Wind-up/anticipation — preparing to attack, pulling back weapon or gathering energy.
Frame 2 (top-right): Attack in motion — the strike or spell being unleashed.
Frame 3 (bottom-left): Impact/peak — maximum extension of attack, full power.
Frame 4 (bottom-right): Recovery — returning to ready stance.
Use detailed 32-bit pixel art style. Same character design in all frames. Make the attack visually dynamic.`,

  idle: `Create a 4-frame pixel art idle/breathing animation sprite sheet of this character.
Arrange the 4 frames in a 2x2 grid on white background. The character is standing still with subtle idle animation.
Frame 1 (top-left): Neutral standing pose — relaxed stance.
Frame 2 (top-right): Slight inhale — chest/body rises subtly.
Frame 3 (bottom-left): Full breath — slight upward posture.
Frame 4 (bottom-right): Exhale — returning to neutral, slight settle.
Keep movements subtle. Same character design in all frames. Character facing right.`,

  // Isometric / Top-down RPG
  'walk-down': `Create a 4-frame pixel art walk cycle walking DOWNWARD (toward camera) in top-down isometric RPG perspective (3/4 overhead view).
Arrange the 4 frames in a 2x2 grid on white background. The character is walking toward the viewer.
Frame 1 (top-left): Left foot forward stride, arms swinging naturally.
Frame 2 (top-right): Feet together, passing/transition pose.
Frame 3 (bottom-left): Right foot forward stride, arms swinging naturally.
Frame 4 (bottom-right): Feet together, passing/transition back.
We see the character's front/face from a top-down 3/4 view. Detailed 32-bit pixel art style. Same character in all frames.`,

  'walk-up': `Create a 4-frame pixel art walk cycle walking UPWARD (away from camera) in top-down isometric RPG perspective (3/4 overhead view).
Arrange the 4 frames in a 2x2 grid on white background. The character is walking away from the viewer.
ALL 4 frames must show the character's BACK from EXACTLY the same angle. Only leg and arm positions differ for the walk cycle.
Frame 1 (top-left): Left foot forward — BACK VIEW. Frame 2 (top-right): Feet together — BACK VIEW.
Frame 3 (bottom-left): Right foot forward — BACK VIEW. Frame 4 (bottom-right): Feet together — BACK VIEW.
Detailed 32-bit pixel art style. Same character in all frames.`,

  'walk-side': `Create a 4-frame pixel art walk cycle walking to the RIGHT in top-down isometric RPG perspective (3/4 overhead view).
Arrange the 4 frames in a 2x2 grid on white background. Character faces RIGHT.
Frame 1 (top-left): Right leg forward, left leg back — stride position. Frame 2 (top-right): Legs close together — transition.
Frame 3 (bottom-left): Left leg forward, right leg back — opposite stride. Frame 4 (bottom-right): Legs close together — transition back.
Detailed 32-bit pixel art style. Same character design in all frames.`,

  'attack-down': `Create a 4-frame pixel art ATTACK animation walking DOWNWARD (toward camera) in top-down isometric RPG perspective.
Arrange the 4 frames in a 2x2 grid on white background. Character faces toward the viewer.
Frame 1 (top-left): Wind-up/anticipation — preparing to strike. Frame 2 (top-right): Attack in motion — strike unleashed downward.
Frame 3 (bottom-left): Impact/peak — maximum extension. Frame 4 (bottom-right): Recovery — returning to ready stance.
Detailed 32-bit pixel art style. Same character design in all frames.`,

  'attack-up': `Create a 4-frame pixel art ATTACK animation walking UPWARD (away from camera) in top-down isometric RPG perspective.
Show the attack from BEHIND, using the same attack type as the reference.
Arrange the 4 frames in a 2x2 grid on white background.
Frame 1 (top-left): Wind-up/anticipation — same motion seen from behind. Frame 2 (top-right): Attack unleashed upward.
Frame 3 (bottom-left): Impact/peak — same attack type. Frame 4 (bottom-right): Recovery.
Detailed 32-bit pixel art style. MUST use the same attack style as reference.`,

  'attack-side': `Create a 4-frame pixel art ATTACK animation to the SIDE (right) in top-down isometric RPG perspective.
Show the character's SIDE PROFILE facing RIGHT performing the same attack as the reference.
Arrange the 4 frames in a 2x2 grid on white background.
Frame 1 (top-left): Wind-up from side view, facing right. Frame 2 (top-right): Strike unleashed to the right.
Frame 3 (bottom-left): Impact/peak. Frame 4 (bottom-right): Recovery.
Detailed 32-bit pixel art style. MUST use the same attack style as reference.`,

  'idle-iso': `Create a 4-frame pixel art idle/breathing animation in top-down isometric RPG perspective.
The character faces toward the camera (south/down). Arrange the 4 frames in a 2x2 grid on white background.
Frame 1 (top-left): Neutral standing pose — relaxed stance. Frame 2 (top-right): Slight inhale — body rises subtly.
Frame 3 (bottom-left): Full breath — slight upward posture. Frame 4 (bottom-right): Exhale — returning to neutral.
Keep movements subtle. Same character design in all frames.`,
};

// Aspect ratios for each sprite type
export const SPRITE_ASPECT_RATIOS = {
  walk: '1:1', jump: '1:1', attack: '21:9', idle: '1:1',
  'walk-down': '1:1', 'walk-up': '1:1', 'walk-side': '1:1',
  'attack-down': '9:16', 'attack-up': '9:16', 'attack-side': '16:9',
  'idle-iso': '1:1',
};

// ─── Parallax Background Prompts ─────────────────────────────────────────────

export const PARALLAX_PROMPTS = {
  layer1: (characterPrompt) =>
    `Create the SKY/BACKDROP layer for a side-scrolling pixel art game parallax background for a character: "${characterPrompt}".
This is the FURTHEST layer — only sky and very distant elements (distant mountains, clouds, horizon).
Style: Pixel art, 32-bit retro game aesthetic. Wide panoramic scene, aspect ratio 21:9.`,

  layer2: `Create the MIDDLE layer of a 3-layer parallax background for a side-scrolling pixel art game.
I've sent you images of: 1) the character, 2) the background/sky layer already created.
Create the character's ICONIC location from their story — home village, famous landmarks, signature battlegrounds.
Elements should fill the frame from middle down to bottom.
IMPORTANT: Use a transparent background (checkerboard pattern) so this layer can overlay the others.`,

  layer3: `Create the FOREGROUND layer of a 3-layer parallax background for a side-scrolling pixel art game.
I've sent you images of: 1) the character, 2) the background/sky layer, 3) the middle layer.
Create the closest foreground elements (ground, grass, rocks, platforms) that complete the scene.
IMPORTANT: Use a transparent background (checkerboard pattern) so this layer can overlay the others.`,
};

// ─── Animation Sequence Prompts ──────────────────────────────────────────────

export const ANIMATION_SEQUENCES = {
  player_idle: {
    name: 'Player Idle',
    frames: 4,
    prompt: (refImage) =>
      `Generate a 4-frame pixel art IDLE animation sequence of the character shown in the reference image.
Each frame shows a subtle breathing/idle movement. Maintain exact character appearance across all frames.
Output a single image with 4 frames arranged horizontally (1×4 grid) on white background.
Detailed 32-bit pixel art style, consistent character design.`,
  },
  player_run: {
    name: 'Player Run',
    frames: 6,
    prompt: (refImage) =>
      `Generate a 6-frame pixel art RUN/WALK CYCLE animation sequence of the character shown in the reference image.
Each frame shows a different phase of the running motion. Maintain exact character appearance across all frames.
Output a single image with 6 frames arranged in a 2×3 grid (2 rows, 3 columns) on white background.
Detailed 32-bit pixel art style, consistent character design.`,
  },
  player_jump: {
    name: 'Player Jump',
    frames: 2,
    prompt: (refImage) =>
      `Generate a 2-frame pixel art JUMP animation sequence of the character shown in the reference image.
Frame 1: Character in air, legs tucked up, ascending. Frame 2: Landing, slight crouch to absorb impact.
Maintain exact character appearance. Output as a single image with 2 frames side-by-side on white background.
Detailed 32-bit pixel art style.`,
  },
  player_shoot: {
    name: 'Player Shoot',
    frames: 3,
    prompt: (refImage) =>
      `Generate a 3-frame pixel art SHOOT animation sequence of the character shown in the reference image.
Frame 1: Wind-up/aiming. Frame 2: Firing — weapon/spell unleashed. Frame 3: Recovery.
Maintain exact character appearance. Output as a single image with 3 frames side-by-side on white background.
Detailed 32-bit pixel art style.`,
  },
  player_hurt: {
    name: 'Player Hurt',
    frames: 2,
    prompt: (refImage) =>
      `Generate a 2-frame pixel art HURT/RECOIL animation sequence of the character shown in the reference image.
Frame 1: Impact — character recoils from hit. Frame 2: Recovery — returning to neutral stance.
Maintain exact character appearance. Output as a single image with 2 frames side-by-side on white background.
Detailed 32-bit pixel art style.`,
  },
  enemy_idle: {
    name: 'Enemy Idle',
    frames: 4,
    prompt: (refImage) =>
      `Generate a 4-frame pixel art IDLE animation sequence of an ENEMY character (aggressive posture, menacing).
Each frame shows subtle breathing/idle movement. Maintain exact character appearance across all frames.
Output a single image with 4 frames arranged horizontally (1×4 grid) on white background.
Detailed 32-bit pixel art style, consistent enemy design.`,
  },
  enemy_run: {
    name: 'Enemy Run',
    frames: 4,
    prompt: (refImage) =>
      `Generate a 4-frame pixel art RUN/WALK CYCLE animation sequence of an ENEMY character.
Each frame shows a different phase of running toward the player. Maintain exact character appearance.
Output as a single image with 4 frames in a 2×2 grid on white background.
Detailed 32-bit pixel art style.`,
  },
  enemy_attack: {
    name: 'Enemy Attack',
    frames: 4,
    prompt: (refImage) =>
      `Generate a 4-frame pixel art ATTACK animation sequence of an ENEMY character.
Frame 1 (top-left): Wind-up/anticipation. Frame 2 (top-right): Attack in motion.
Frame 3 (bottom-left): Impact/peak. Frame 4 (bottom-right): Recovery.
Output as a 2×2 grid on white background. Maintain exact character appearance.
Detailed 32-bit pixel art style.`,
  },
};

// ─── Effects Prompts ─────────────────────────────────────────────────────────

export const EFFECT_PROMPTS = {
  bullet_trail: `Generate a pixel art bullet projectile sprite. A small fast-moving bullet or bullet trail on transparent background.
Detailed 32-bit pixel art style. Square aspect ratio.`,
  bullet_impact: `Generate a pixel art bullet impact/hit effect sprite. Sparks, flash, or explosion fragment on transparent background.
Detailed 32-bit pixel art style. Square aspect ratio.`,
  fire_ball: `Generate a pixel art fire ball/projectile sprite. A glowing ball of fire on transparent background.
Detailed 32-bit pixel art style. Square aspect ratio.`,
  fire_explosion: `Generate a pixel art fire explosion effect sprite. Explosive fire burst on transparent background.
Detailed 32-bit pixel art style. Square aspect ratio.`,
  explosion: `Generate a pixel art explosion effect sprite. Fire and debris burst on transparent background.
Detailed 32-bit pixel art style. Square aspect ratio.`,
  smoke: `Generate a pixel art smoke/particle effect sprite. Wisp of smoke on transparent background.
Detailed 32-bit pixel art style. Square aspect ratio.`,
  spark: `Generate a pixel art spark effect sprite. Bright spark or energy fragment on transparent background.
Detailed 32-bit pixel art style. Square aspect ratio.`,
};

// ─── Weapon Prompts ──────────────────────────────────────────────────────────

export const WEAPON_PROMPTS = {
  assault_rifle: `Generate a pixel art assault rifle sprite (AK-47 style). Side profile view on transparent background.
Detailed 32-bit pixel art style with metallic sheen.`,
  pistol_9mm: `Generate a pixel art 9mm pistol sprite. Side profile view on transparent background.
Detailed 32-bit pixel art style with metallic sheen.`,
  pump_shotgun: `Generate a pixel art pump-action shotgun sprite. Side profile view on transparent background.
Detailed 32-bit pixel art style.`,
  bolt_action: `Generate a pixel art bolt-action rifle sprite (Kar98k style). Side profile view on transparent background.
Detailed 32-bit pixel art style.`,
  sword: `Generate a pixel art sword sprite. Side view on transparent background.
Detailed 32-bit pixel art style with metallic sheen.`,
  magic_staff: `Generate a pixel art magic staff/wand sprite. Side view on transparent background.
Detailed 32-bit pixel art style.`,
  helmet: `Generate a pixel art helmet sprite. Front/side view on transparent background.
Detailed 32-bit pixel art style.`,
  vest: `Generate a pixel art ballistic vest sprite. Front view on transparent background.
Detailed 32-bit pixel art style.`,
};

// ─── Cutout Validation Result Type ───────────────────────────────────────────

/**
 * @typedef {Object} CutoutValidation
 * @property {boolean} size_ok
 * @property {boolean} mode_ok
 * @property {boolean} corners_ok
 * @property {boolean} transparent_ratio_ok
 * @property {boolean} border_ok
 * @property {number[]} corner_alphas
 * @property {number} transparent_ratio
 * @property {number} border_ratio
 * @property {boolean} all_ok
 * @property {[number,number,number,number]} bbox
 */
