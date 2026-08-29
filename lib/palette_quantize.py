"""
Palette quantization for pixel art sprite sheets.
Supports retro game palettes: GameBoy, NES, GBA, GameGear, etc.

Usage:
    python palette_quantize.py <input.png> <output.png> [--palette gameboy] [--dither FloydSteinberg]
"""
import sys
import json
import base64
from pathlib import Path
from PIL import Image, ImageQuantize, ImagePalette
import numpy as np

# Retro palettes: name -> list of (R, G, B) tuples
PALETTES = {
    "gameboy": [
        (239, 239, 239),  # lightest
        (137, 153, 130),  # light
        (58, 79, 60),     # dark
        (13, 22, 17),     # darkest
    ],
    "nes": [
        # Classic NES 54-color subset (commonly used)
        (0, 0, 0), (92, 0, 0), (145, 0, 15), (176, 0, 60),
        (184, 0, 0), (212, 4, 0), (235, 49, 0), (248, 97, 0),
        (240, 146, 0), (229, 189, 1), (185, 212, 0), (125, 225, 0),
        (75, 228, 0), (10, 207, 24), (0, 180, 58), (0, 144, 97),
        (0, 114, 134), (0, 84, 172), (0, 55, 200), (18, 0, 225),
        (57, 0, 221), (96, 0, 196), (130, 0, 155), (157, 0, 99),
        (166, 0, 0), (200, 23, 0), (228, 69, 0), (245, 122, 0),
        (250, 174, 0), (248, 225, 36), (198, 245, 0), (116, 238, 13),
        (0, 235, 77), (0, 225, 135), (0, 207, 182), (0, 166, 230),
        (0, 97, 248), (52, 47, 248), (119, 17, 238), (166, 0, 189),
        (208, 0, 135), (240, 0, 68), (250, 107, 156), (248, 160, 208),
        (229, 218, 245), (177, 238, 248), (123, 242, 245), (68, 244, 229),
    ],
    "gb_color": [
        (117, 195, 45), (75, 140, 33), (42, 88, 24), (21, 48, 13),
    ],
    "gamegear": [
        (0, 0, 0), (128, 128, 128), (255, 255, 255),
        (255, 0, 0), (0, 255, 0), (0, 0, 255),
        (255, 255, 0), (255, 0, 255), (0, 255, 255),
    ],
    "gba": [
        (0, 0, 0), (64, 64, 64), (128, 128, 128), (192, 192, 192),
        (255, 255, 255), (255, 0, 0), (0, 255, 0), (0, 0, 255),
        (255, 255, 0), (255, 0, 255), (0, 255, 255), (128, 0, 0),
        (0, 128, 0), (0, 0, 128), (128, 128, 0), (128, 0, 128),
        (0, 128, 128), (200, 200, 200), (100, 100, 100),
    ],
    "pico8": [
        (0, 0, 0), (136, 153, 168), (102, 119, 136), (204, 119, 34),
        (221, 136, 51), (102, 68, 0), (17, 17, 17), (187, 187, 187),
        (153, 153, 153), (255, 170, 102), (255, 204, 153), (119, 85, 17),
        (34, 34, 34), (221, 221, 221), (187, 187, 187), (255, 229, 204),
        (255, 255, 255), (85, 34, 0), (0, 34, 34), (119, 51, 17),
        (51, 119, 119), (153, 0, 34), (0, 85, 85), (136, 17, 17),
        (0, 102, 68), (85, 0, 51), (0, 51, 85), (68, 0, 85),
        (34, 0, 17), (17, 0, 17), (255, 255, 255), (221, 221, 221),
    ],
    "sega_sgs": [
        (0, 0, 0), (51, 51, 51), (102, 102, 102), (153, 153, 153),
        (204, 204, 204), (255, 255, 255), (255, 0, 0), (0, 255, 0),
        (0, 0, 255), (255, 255, 0), (255, 0, 255), (0, 255, 255),
    ],
}

DITHER_PATTERNS = {
    "none": None,
    "floyd-steinberg": "Floyd-Steinberg",
    "jarvis-judice-ninke": "Jarvis-Judice-Ninke",
    "stucki": "Stucki",
    "burkes": "Burkes",
    "atkinson": "Atkinson",
}


def palette_quantize(args):
    input_path = args.get('image_path', '')
    output_path = args.get('output_path', './output/palettized.png')
    palette_name = args.get('palette', 'gameboy')
    dither = args.get('dither', 'floyd-steinberg')
    colors = args.get('colors', 16)

    if not input_path:
        return {'success': False, 'error': 'image_path is required'}

    palette_name = palette_name.lower()

    # Build palette
    if palette_name in PALETTES:
        palette_colors = PALETTES[palette_name][:colors]
    else:
        # Try to parse custom palette from comma-separated RGB values
        try:
            palette_colors = [
                tuple(int(x) for x in c.split(','))
                for c in palette_name.split(';')
            ]
        except Exception:
            return {'success': False, 'error': f'Unknown palette: {palette_name}. Available: {list(PALETTES.keys())}'}

    img = Image.open(input_path).convert('RGBA')

    # Quantize to palette using nearest-color
    pal_rgb = [(min(255, max(0, int(r))), min(255, max(0, int(g))), min(255, max(0, int(b))))
               for r, g, b in palette_colors]
    flat_pal = [c for rgb in pal_rgb for c in rgb]
    # Add alpha channel (255 for opaque)
    flat_pal.extend([255] * len(pal_rgb))

    # Build palette index lookup
    pal_list = [tuple(c) for c in pal_rgb]

    # Convert and apply palette
    if dither and DITHER_PATTERNS.get(dither.lower()):
        # Dithered mode: use PIL's imagequant with our palette
        quantized = img.quantize(colors=len(pal_list), method=Image.Quantize.MEDIANCUT)
        quantized = quantized.convert('P', palette=Image.PALLETE)
        # Remap to our palette
        arr = np.array(img.convert('RGB'))
        result_arr = _remap_to_palette(arr, pal_list, dither=DITHER_PATTERNS[dither.lower()])
        result = Image.fromarray(result_arr, 'RGB').convert('RGBA')
    else:
        # Nearest-color mode
        arr = np.array(img.convert('RGB'))
        result_arr = _remap_to_palette(arr, pal_list, dither=None)
        result = Image.fromarray(result_arr, 'RGB').convert('RGBA')

    # Preserve original alpha
    if img.mode == 'RGBA':
        result = result.convert('RGBA')
        src_alpha = np.array(img)[:, :, 3]
        dst_alpha = np.array(result)[:, :, 3]
        dst_alpha[src_alpha < 128] = 0
        result = Image.fromarray(np.stack([np.array(result)[:, :, i] for i in range(4)], axis=-1), 'RGBA')

    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    result.save(str(out), 'PNG')

    return {
        'success': True,
        'output_path': str(out),
        'palette': palette_name,
        'colors': len(pal_list),
        'dither': dither,
        'size': result.size,
    }


def _remap_to_palette(arr_rgb, palette, dither=None):
    """Remap RGB array to nearest palette color, optionally with dithering."""
    h, w, _ = arr_rgb.shape
    result = np.zeros_like(arr_rgb)

    for y in range(h):
        for x in range(w):
            pixel = arr_rgb[y, x]
            # Find nearest palette color
            diffs = np.sqrt(((np.array(palette) - pixel) ** 2).sum(axis=1))
            idx = int(np.argmin(diffs))
            result[y, x] = palette[idx]

    return result.astype(np.uint8)


if __name__ == '__main__':
    encoded = sys.argv[1]
    args = json.loads(base64.b64decode(encoded).decode())
    result = palette_quantize(args)
    print(json.dumps(result))
