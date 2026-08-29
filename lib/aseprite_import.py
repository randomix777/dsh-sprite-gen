"""
Aseprite file importer — converts .aseprite files to sprite sheets or individual frames.

Usage:
    python aseprite_import.py <input.aseprite> [--output ./output/] [--split] [--frames 16]
"""
import sys
import json
import base64
import zipfile
from pathlib import Path
from PIL import Image
import io


def aseprite_import(args):
    input_path = args.get('image_path', '')
    output_dir = args.get('output_dir', './output')
    split = args.get('split', False)
    target_frames = args.get('frames', None)
    cell_size = args.get('cell_size', 32)

    if not input_path.endswith('.aseprite'):
        return {'success': False, 'error': f'Not an .aseprite file: {input_path}'}

    if not Path(input_path).exists():
        return {'success': False, 'error': f'File not found: {input_path}'}

    try:
        with zipfile.ZipFile(input_path, 'r') as zf:
            # Read metadata
            meta_path = None
            for name in zf.namelist():
                if name == 'aseprite.json':
                    meta_path = name
                    break

            meta = {}
            if meta_path:
                with zf.open(meta_path) as f:
                    meta = json.loads(f.read().decode('utf-8'))

            # Extract frames
            layers = meta.get('layers', [])
            tags = meta.get('tags', [])
            frame_count = meta.get('frameCount', len(layers))

            # Collect frame images
            frame_images = []
            for tag in tags:
                start = tag.get('from', 0)
                end = tag.get('to', start)
                tag_name = tag.get('name', f'tag_{start}')
                tag_frames = []
                for i in range(start, end + 1):
                    # Find frame file - look for frames/*.png or similar
                    frame_files = [n for n in zf.namelist() if f'frames/{i}' in n or f'/frames/{i}.' in n]
                    if not frame_files:
                        # Try alternate pattern
                        frame_files = [n for n in zf.namelist() if f'frames.{i}' in n]
                    if frame_files:
                        with zf.open(frame_files[0]) as f:
                            img = Image.open(io.BytesIO(f.read())).convert('RGBA')
                            tag_frames.append((img, tag_name, i))
                frame_images.append({'tag': tag_name, 'frames': tag_frames})

            # If no tags, extract all frames as one sheet
            if not frame_images:
                frame_files = sorted([n for n in zf.namelist() if 'frames' in n.lower()])
                for ff in frame_files:
                    with zf.open(ff) as f:
                        img = Image.open(io.BytesIO(f.read())).convert('RGBA')
                        frame_images.append({'tag': 'default', 'frames': [(img, 'default', 0)]})

            out = Path(output_dir)
            out.mkdir(parents=True, exist_ok=True)

            results = []
            for tag_info in frame_images:
                tag_name = tag_info['tag']
                frames = tag_info['frames']
                if not frames:
                    continue

                first_img = frames[0][0]
                img_w, img_h = first_img.size

                if split:
                    # Save individual frames
                    frame_files = []
                    for frame_num, (img, tn, fn) in enumerate(frames):
                        fname = out / f'{tag_name}_{frame_num:02d}.png'
                        img.save(fname, 'PNG')
                        frame_files.append(str(fname))
                    results.append({
                        'tag': tag_name,
                        'frame_count': len(frames),
                        'size': [img_w, img_h],
                        'files': frame_files
                    })
                else:
                    # Arrange in grid and save as sheet
                    n = len(frames)
                    cols = int(n ** 0.5)
                    if cols * cols < n:
                        cols += 1
                    rows = (n + cols - 1) // cols

                    sheet_w = img_w * cols
                    sheet_h = img_h * rows
                    sheet = Image.new('RGBA', (sheet_w, sheet_h), (0, 0, 0, 0))

                    for idx, (img, tn, fn) in enumerate(frames):
                        r = idx // cols
                        c = idx % cols
                        sheet.paste(img, (c * img_w, r * img_h))

                    fname = out / f'{tag_name}_sheet.png'
                    sheet.save(fname, 'PNG')
                    results.append({
                        'tag': tag_name,
                        'frame_count': n,
                        'sheet_size': [sheet_w, sheet_h],
                        'cell_size': [img_w, img_h],
                        'file': str(fname)
                    })

            return {
                'success': True,
                'output_dir': str(out),
                'meta': meta,
                'results': results
            }

    except Exception as e:
        return {'success': False, 'error': str(e)}


if __name__ == '__main__':
    encoded = sys.argv[1]
    args = json.loads(base64.b64decode(encoded).decode())
    result = aseprite_import(args)
    print(json.dumps(result))
