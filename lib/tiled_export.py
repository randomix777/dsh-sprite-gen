"""
Tiled JSON metadata exporter for sprite sheets.

Usage:
    python tiled_export.py <sprite_sheet.png> <output.json> [--cols 4] [--rows 4] [--frames "idle:0-3,jump:4-7"] [--cell-size 32]
"""
import sys
import json
import base64
from pathlib import Path
from PIL import Image


def tiled_export(args):
    image_path = args.get('image_path', '')
    output_path = args.get('output_path', './output/sprite_sheet.json')
    grid_cols = args.get('grid_cols', 4)
    grid_rows = args.get('grid_rows', 4)
    cell_size = args.get('cell_size', 32)
    padding = args.get('padding', 0)
    animations = args.get('animations', [])

    img = Image.open(image_path).convert('RGBA')
    w, h = img.size

    # Auto-detect cell size from image dimensions
    if cell_size <= 0:
        cell_w = w // grid_cols
        cell_h = h // grid_rows
    else:
        cell_w = cell_size
        cell_h = cell_size

    # Build frames
    frames = []
    idx = 0
    for row in range(grid_rows):
        for col in range(grid_cols):
            x = col * cell_w
            y = row * cell_h
            cell = img.crop((x, y, x + cell_w, y + cell_h))

            # Check if cell has content (non-transparent)
            alpha = cell.split()[3] if cell.mode == 'RGBA' else None
            has_content = alpha and min(alpha.getextrema()) < 255

            if has_content:
                frames.append({
                    "x": x,
                    "y": y,
                    "w": cell_w,
                    "h": cell_h,
                    "index": idx
                })
                idx += 1

    # Build animations if provided
    anim_data = []
    for anim in animations:
        name = anim.get('name', 'default')
        frame_indices = anim.get('frame_indices', [])
        fps = anim.get('fps', 12)

        # If frame_indices not provided, auto-assign sequential
        if not frame_indices:
            frame_indices = list(range(idx))

        anim_data.append({
            "name": name,
            "frames": [{"index": i, "duration": 1000.0 / fps} for i in frame_indices],
            "fps": fps,
            "loop": anim.get('loop', True)
        })

    # If no animations provided, create a default one
    if not anim_data and frames:
        anim_data.append({
            "name": "default",
            "frames": [{"index": i, "duration": 1000.0 / 12} for i in range(len(frames))],
            "fps": 12,
            "loop": True
        })

    result = {
        "version": 1,
        "tiled_version": "1.10",
        "type": "tileset",
        "name": Path(output_path).stem,
        "image": f"{Path(output_path).stem}.png",
        "imagewidth": w,
        "imageheight": h,
        "tilewidth": cell_w,
        "tileheight": cell_h,
        "columns": grid_cols,
        "margin": 0,
        "spacing": padding,
        "transparentcolor": "#00000000",
        "grid": {
            "orientation": "orthogonal",
            "width": cell_w,
            "height": cell_h
        },
        "tileoffset": {"x": 0, "y": 0},
        "animation": anim_data,
        "tiles": [
            {
                "id": i,
                "type": "sprite",
                "properties": {
                    "frame_index": f["index"]
                }
            }
            for i, f in enumerate(frames)
        ]
    }

    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, indent=2), encoding='utf-8')

    return {
        'success': True,
        'output_path': str(out),
        'cell_size': [cell_w, cell_h],
        'frames': len(frames),
        'animations': len(anim_data),
        'total_frames': sum(len(a['frames']) for a in anim_data)
    }


if __name__ == '__main__':
    encoded = sys.argv[1]
    args = json.loads(base64.b64decode(encoded).decode())
    result = tiled_export(args)
    print(json.dumps(result))
