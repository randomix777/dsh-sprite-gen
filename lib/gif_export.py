"""
Export a sprite sheet image to animated GIF.

Usage:
    python gif_export.py <input_image> <output_gif> [--fps 12] [--cols 4] [--rows 4]
"""
import sys
import json
import base64
from pathlib import Path
from PIL import Image


def gif_export(args):
    image_path = args.get('image_path', '')
    output_path = args.get('output_path', './output/sprite_sheet.gif')
    fps = args.get('fps', 12)
    grid_cols = args.get('grid_cols', 4)
    grid_rows = args.get('grid_rows', 4)

    img = Image.open(image_path).convert('RGBA')
    w, h = img.size

    cell_w = w // grid_cols
    cell_h = h // grid_rows

    frames = []
    for row in range(grid_rows):
        for col in range(grid_cols):
            x = col * cell_w
            y = row * cell_h
            cell = img.crop((x, y, x + cell_w, y + cell_h))
            # Convert to GIF-compatible palette mode
            cell_p = cell.convert('P', palette=Image.ADAPTIVE, colors=256)
            frames.append(cell_p)

    if not frames:
        return {'success': False, 'error': 'No frames generated'}

    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)

    # Save as animated GIF
    frames[0].save(
        str(out),
        save_all=True,
        append_images=frames[1:],
        duration=int(1000 / fps),
        loop=0,
        optimize=True,
    )

    return {
        'success': True,
        'output_path': str(out),
        'frames': len(frames),
        'fps': fps,
        'size': list(img.size),
    }


if __name__ == '__main__':
    encoded = sys.argv[1]
    args = json.loads(base64.b64decode(encoded).decode())
    result = gif_export(args)
    print(json.dumps(result))
