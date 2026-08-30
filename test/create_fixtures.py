"""
Create test fixtures for sprite-gen QC and cutout tests.

All fixtures are written to:
    D:/Projects/plugins/dsh-sprite-gen/test/fixtures/

Fixture list:
  1. solid_bg_character.png     - character on solid grey background
  2. checkerboard_grey_character.png - character on grey/white checkerboard
  3. checkerboard_bw_weapon.png  - weapon on black/white checkerboard
  4. metal_weapon.png           - metallic weapon with white highlights
  5. character_eye_clothes.png  - character with white eyes + light clothing
  6. valid_asset.png            - already-clean transparent asset
  7. empty_image.png            - fully transparent
  8. isolated_fragments.png      - multiple small isolated blobs
  9. subject_at_edge.png         - content touching all four borders
  10. non_divisible_sheet.png    - 516x516 image (not divisible by cell_size 64)
  11. sparse_effect_sheet.png    - 9-region sparse effect atlas
"""

import json
import os
import sys
import numpy as np
from PIL import Image

OUT_DIR = os.path.join(os.path.dirname(__file__), 'fixtures')
os.makedirs(OUT_DIR, exist_ok=True)


def np_to_img(arr):
    if arr.dtype != np.uint8:
        arr = np.clip(arr, 0, 255).astype(np.uint8)
    if arr.ndim == 2:
        return Image.fromarray(arr, mode='L')
    if arr.ndim == 3 and arr.shape[2] == 3:
        return Image.fromarray(arr, mode='RGB')
    if arr.ndim == 3 and arr.shape[2] == 4:
        return Image.fromarray(arr, mode='RGBA')
    return Image.fromarray(arr)


def save(arr, name):
    path = os.path.join(OUT_DIR, name)
    np_to_img(arr).save(path)
    return path


def draw_circle(arr, cx, cy, r, rgb, alpha=255):
    h, w = arr.shape[:2]
    y, x = np.ogrid[:h, :w]
    mask = (x - cx) ** 2 + (y - cy) ** 2 <= r ** 2
    if arr.shape[2] == 4:
        arr[mask, 0] = rgb[0]
        arr[mask, 1] = rgb[1]
        arr[mask, 2] = rgb[2]
        arr[mask, 3] = alpha
    else:
        arr[mask, 0] = rgb[0]
        arr[mask, 1] = rgb[1]
        arr[mask, 2] = rgb[2]


def checkerboard_pattern(h, w, color1=(214, 214, 214), color2=(255, 255, 255), tile_size=8):
    arr = np.zeros((h, w, 4), dtype=np.uint8)
    arr[:, :, 3] = 255
    for y in range(h):
        for x in range(w):
            t = (y // tile_size + x // tile_size) % 2
            arr[y, x, :3] = color1 if t == 0 else color2
    return arr


def solid_bg(h, w, bg_color=(128, 128, 128)):
    arr = np.zeros((h, w, 4), dtype=np.uint8)
    arr[:, :, :3] = bg_color
    arr[:, :, 3] = 255
    return arr


print('Creating fixtures...')

# 1. solid_bg_character — character on solid grey, with transparent border padding
arr = solid_bg(256, 256, (128, 128, 128))
pad = 30
draw_circle(arr, 128, 80 + pad, 30, (200, 150, 100))   # head
draw_circle(arr, 128, 150 + pad, 40, (180, 130, 90))  # torso
draw_circle(arr, 105, 190 + pad, 20, (160, 110, 80))  # left leg
draw_circle(arr, 151, 190 + pad, 20, (160, 110, 80))  # right leg
# transparent border around edges
arr[:, :10, :] = 0
arr[:, -10:, :] = 0
arr[:10, :, :] = 0
arr[-10:, :, :] = 0
save(arr, 'solid_bg_character.png')
print('  1. solid_bg_character.png')

# 2. checkerboard_grey_character — on checkerboard with transparent corners
arr = checkerboard_pattern(256, 256, (214, 214, 214), (255, 255, 255))
draw_circle(arr, 128, 80, 30, (200, 150, 100))
draw_circle(arr, 128, 150, 40, (180, 130, 90))
draw_circle(arr, 105, 190, 20, (160, 110, 80))
draw_circle(arr, 151, 190, 20, (160, 110, 80))
arr[:, :15, :] = 0
arr[:, -15:, :] = 0
arr[:15, :, :] = 0
arr[-15:, :, :] = 0
save(arr, 'checkerboard_grey_character.png')
print('  2. checkerboard_grey_character.png')

# 3. checkerboard_bw_weapon — on black/white checkerboard with transparent corners
arr = checkerboard_pattern(256, 256, (0, 0, 0), (255, 255, 255))
draw_circle(arr, 128, 128, 15, (120, 80, 50))
draw_circle(arr, 128, 80, 10, (80, 80, 80))
draw_circle(arr, 128, 50, 8, (200, 200, 200))
for i in range(30):
    draw_circle(arr, 128, 55 + i, 5, (180, 180, 180))
arr[:, :15, :] = 0
arr[:, -15:, :] = 0
arr[:15, :, :] = 0
arr[-15:, :, :] = 0
save(arr, 'checkerboard_bw_weapon.png')
print('  3. checkerboard_bw_weapon.png')

# 4. metal_weapon — with transparent border
arr = solid_bg(128, 128, (100, 100, 100))
draw_circle(arr, 64, 64, 8, (180, 140, 100))
draw_circle(arr, 64, 35, 6, (220, 220, 240))
draw_circle(arr, 64, 20, 4, (255, 255, 255))
arr[:, :8, :] = 0
arr[:, -8:, :] = 0
arr[:8, :, :] = 0
arr[-8:, :, :] = 0
save(arr, 'metal_weapon.png')
print('  4. metal_weapon.png')

# 5. character_eye_clothes — with transparent border
arr = solid_bg(128, 128, (100, 100, 100))
draw_circle(arr, 64, 40, 20, (220, 180, 140))
draw_circle(arr, 58, 35, 5, (255, 255, 255))
draw_circle(arr, 70, 35, 5, (255, 255, 255))
draw_circle(arr, 64, 80, 25, (220, 230, 240))
arr[:, :10, :] = 0
arr[:, -10:, :] = 0
arr[:10, :, :] = 0
arr[-10:, :, :] = 0
save(arr, 'character_eye_clothes.png')
print('  5. character_eye_clothes.png')

# 6. valid_asset — clean transparent character (corners fully transparent)
# Use multiple distinct colours so colour_diversity is reasonable
arr = np.zeros((128, 128, 4), dtype=np.uint8)
draw_circle(arr, 64, 40, 18, (200, 150, 100))           # head (skin)
draw_circle(arr, 60, 36, 4, (50, 30, 20))                # left eye
draw_circle(arr, 68, 36, 4, (50, 30, 20))                # right eye
draw_circle(arr, 64, 50, 4, (200, 80, 80))               # mouth
draw_circle(arr, 64, 75, 22, (180, 130, 90))             # torso
draw_circle(arr, 64, 80, 8, (200, 200, 200))             # chest detail
draw_circle(arr, 50, 100, 8, (180, 130, 90))             # left leg
draw_circle(arr, 78, 100, 8, (180, 130, 90))             # right leg
save(arr, 'valid_asset.png')
print('  6. valid_asset.png')

# 7. empty_image — fully transparent
arr = np.zeros((64, 64, 4), dtype=np.uint8)
save(arr, 'empty_image.png')
print('  7. empty_image.png')

# 8. isolated_fragments — main large blob + 8 small isolated fragments
arr = np.zeros((256, 256, 4), dtype=np.uint8)
draw_circle(arr, 128, 128, 55, (200, 150, 100))           # main body (r=55, area~9503px)
# 8 isolated small circles far from main body — all same color but disconnected
for rx, ry, rr in [(20, 20, 7), (20, 235, 7), (235, 20, 7), (235, 235, 7),
                    (20, 128, 7), (235, 128, 7), (128, 20, 7), (128, 235, 7)]:
    draw_circle(arr, rx, ry, rr, (200, 150, 100))            # each r=7, area~154px < 655 threshold
save(arr, 'isolated_fragments.png')
print('  8. isolated_fragments.png')

# 9. subject_at_edge — fill entire image with content, no border padding
arr = solid_bg(128, 128, (200, 150, 100))
save(arr, 'subject_at_edge.png')
print('  9. subject_at_edge.png')

# 10. non_divisible_sheet — 516x516 (not divisible by 64) with transparent corners
arr = checkerboard_pattern(516, 516, (214, 214, 214), (255, 255, 255))
arr[:, :20, :] = 0
arr[:, -20:, :] = 0
arr[:20, :, :] = 0
arr[-20:, :, :] = 0
draw_circle(arr, 258, 200, 50, (200, 150, 100))
draw_circle(arr, 258, 350, 50, (180, 130, 90))
save(arr, 'non_divisible_sheet.png')
print(' 10. non_divisible_sheet.png')

# 11. sparse_effect_sheet — 9 cells at 64px, sparse placement
arr = np.zeros((192, 192, 4), dtype=np.uint8)
positions = [(1, 1), (3, 2), (5, 3), (1, 4), (5, 0), (2, 5), (4, 4), (0, 2), (3, 1)]
for row, col in positions:
    draw_circle(arr, col * 64 + 32, row * 64 + 32, 20, (100, 200, 255))
save(arr, 'sparse_effect_sheet.png')
print(' 11. sparse_effect_sheet.png')

# Write manifest
manifest = {
    'fixtures': [
        {'name': 'solid_bg_character.png', 'desc': 'character on solid grey bg'},
        {'name': 'checkerboard_grey_character.png', 'desc': 'character on grey/white checkerboard'},
        {'name': 'checkerboard_bw_weapon.png', 'desc': 'weapon on black/white checkerboard'},
        {'name': 'metal_weapon.png', 'desc': 'metallic weapon with white highlights'},
        {'name': 'character_eye_clothes.png', 'desc': 'character with white eyes + light clothes'},
        {'name': 'valid_asset.png', 'desc': 'clean transparent asset (corners transparent)'},
        {'name': 'empty_image.png', 'desc': 'fully transparent empty image'},
        {'name': 'isolated_fragments.png', 'desc': 'main blob + many small isolated fragments'},
        {'name': 'subject_at_edge.png', 'desc': 'content touching all four borders'},
        {'name': 'non_divisible_sheet.png', 'desc': '516x516 not divisible by 64 (grid test)'},
        {'name': 'sparse_effect_sheet.png', 'desc': '9 cells sparse effect atlas'},
    ]
}
with open(os.path.join(OUT_DIR, 'manifest.json'), 'w') as f:
    json.dump(manifest, f, indent=2)

print(f'\nAll fixtures created in {OUT_DIR}')
