"""
Character anchor layout — repeat an accepted reference frame into a fixed
scale/root template for consistent multi-view generation.

Adapted from agent-sprite-forge's make_anchor_layout.py.
"""
import sys
import json
import base64
from pathlib import Path
from PIL import Image
import numpy as np


def build_anchor_layout(args):
    input_path = args.get('image_path', '')
    rows = args.get('rows', 2)
    cols = args.get('cols', 3)
    cell_width = args.get('cell_width', 512)
    cell_height = args.get('cell_height', 512)
    subject_height_ratio = args.get('subject_height_ratio', 0.66)
    subject_width_ratio = args.get('subject_width_ratio', 0.72)
    feet_ratio = args.get('feet_ratio', 0.82)
    threshold = args.get('threshold', 100)
    edge_threshold = args.get('edge_threshold', 10)
    output_path = args.get('output_path', './output/anchor_layout.png')

    if not input_path:
        return {'success': False, 'error': 'image_path is required'}

    if rows <= 0 or cols <= 0:
        return {'success': False, 'error': 'rows and cols must be positive'}
    if cell_width <= 0 or cell_height <= 0:
        return {'success': False, 'error': 'cell dimensions must be positive'}
    for name, value in {
        'subject_height_ratio': subject_height_ratio,
        'subject_width_ratio': subject_width_ratio,
        'feet_ratio': feet_ratio,
    }.items():
        if not 0 < value < 1:
            return {'success': False, 'error': f'{name} must be between 0 and 1'}

    src = Image.open(input_path).convert('RGBA')

    # Remove magenta background
    arr = np.array(src)
    r, g, b, a = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2], arr[:, :, 3]
    # Magenta = (255, 0, 255)
    magenta_dist = np.sqrt(((r - 255) ** 2 + (g - 0) ** 2 + (b - 255) ** 2))
    clean_mask = (magenta_dist > threshold) | (a > edge_threshold)
    cleaned = np.zeros_like(arr)
    cleaned[:, :, :3] = arr[:, :, :3]
    cleaned[:, :, 3] = np.where(clean_mask, 255, 0).astype(np.uint8)
    cleaned_img = Image.fromarray(cleaned, 'RGBA')

    bbox = cleaned_img.getbbox()
    if not bbox:
        return {'success': False, 'error': 'input has no visible subject after background removal'}

    subject = cleaned_img.crop(bbox)

    target_height = cell_height * subject_height_ratio
    target_width = cell_width * subject_width_ratio
    scale = min(target_height / subject.height, target_width / subject.width)
    out_width = max(1, int(round(subject.width * scale)))
    out_height = max(1, int(round(subject.height * scale)))
    subject = subject.resize((out_width, out_height), Image.Resampling.LANCZOS)

    canvas = Image.new('RGBA', (cols * cell_width, rows * cell_height), (255, 0, 255, 255))
    feet_y = int(round(cell_height * feet_ratio))
    paste_x_in_cell = (cell_width - out_width) // 2
    paste_y_in_cell = feet_y - out_height
    if paste_x_in_cell < 0 or paste_y_in_cell < 0:
        return {'success': False, 'error': 'subject ratios place the reference outside the cell'}

    for row in range(rows):
        for col in range(cols):
            canvas.alpha_composite(
                subject,
                (col * cell_width + paste_x_in_cell, row * cell_height + paste_y_in_cell),
            )

    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(str(out), 'PNG')

    return {
        'success': True,
        'output_path': str(out),
        'grid': {'rows': rows, 'cols': cols},
        'cell_size': [cell_width, cell_height],
        'subject_size': [out_width, out_height],
        'scale': round(scale, 4),
        'feet_y': feet_y,
        'paste_offset': [paste_x_in_cell, paste_y_in_cell],
    }


if __name__ == '__main__':
    encoded = sys.argv[1]
    args = json.loads(base64.b64decode(encoded).decode())
    result = build_anchor_layout(args)
    print(json.dumps(result))
