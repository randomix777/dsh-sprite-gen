"""
Video to sprite sheet — extracts frames from video and arranges them into sprite sheets.

Requires: ffmpeg on PATH

Usage:
    python video2dsprite.py <input.mp4> --fps 12 --grid-cols 4 --grid-rows 4
"""
import sys
import json
import base64
import shutil
import subprocess
from pathlib import Path
from PIL import Image
import numpy as np


def video_to_sprite(args):
    input_path = args.get('image_path', '')
    output_path = args.get('output_path', './output/video_sprite.png')
    output_gif = args.get('output_gif')
    fps = args.get('fps', 12)
    frame_counts = args.get('frame_counts', [8, 16])
    grid_cols = args.get('grid_cols', 4)
    grid_rows = args.get('grid_rows', 4)
    cell_size = args.get('cell_size', 64)
    chroma_key = args.get('chroma_key', [255, 0, 255])  # magenta

    if not input_path:
        return {'success': False, 'error': 'image_path (video file) is required'}

    src = Path(input_path)
    if not src.exists():
        return {'success': False, 'error': f'File not found: {input_path}'}

    ffmpeg = shutil.which('ffmpeg')
    if not ffmpeg:
        return {'success': False, 'error': 'ffmpeg not found on PATH. Install ffmpeg first.'}

    tmp_dir = src.parent / '.video_frames_tmp'
    tmp_dir.mkdir(exist_ok=True)

    try:
        # Extract frames
        frame_pattern = str(tmp_dir / 'frame_%04d.png')
        cmd = [ffmpeg, '-y', '-i', str(src), '-vf', f'fps={fps}', frame_pattern]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode != 0:
            return {'success': False, 'error': f'ffmpeg failed: {proc.stderr[:200]}'}

        frame_files = sorted(tmp_dir.glob('frame_*.png'))
        if not frame_files:
            return {'success': False, 'error': 'No frames extracted from video'}

        def chroma_key_rgba(img, key_rgb, threshold=55):
            arr = np.array(img.convert('RGBA'))
            rgb = arr[:, :, :3].astype(np.float32)
            key = np.array(key_rgb, dtype=np.float32)
            dist = np.sqrt(((rgb - key) ** 2).sum(axis=2))
            alpha = np.where(dist <= threshold, 0, arr[:, :, 3]).astype(np.uint8)
            result = arr.copy()
            result[:, :, 3] = alpha
            return Image.fromarray(result, 'RGBA')

        def arrange_frames(frames, cols, rows):
            if not frames:
                return None
            w, h = frames[0].size
            sheet = Image.new('RGBA', (w * cols, h * rows), (0, 0, 0, 0))
            for i, f in enumerate(frames[:cols * rows]):
                r, c = divmod(i, cols)
                sheet.paste(f, (c * w, r * h))
            return sheet

        # Generate sprite sheets at different frame densities
        results = []
        for n in frame_counts:
            if n > len(frame_files):
                continue
            indices = list(range(0, len(frame_files), max(1, len(frame_files) // n)))
            indices = indices[:n]
            selected = [Image.open(f).convert('RGBA') for f in [frame_files[i] for i in indices]]

            # Apply chroma key if video uses magenta background
            selected = [chroma_key_rgba(f, chroma_key) for f in selected]

            c = grid_cols
            r = grid_rows
            sheet = arrange_frames(selected, c, r)
            if sheet:
                out_path = Path(output_path).parent / f'video_sprite_{n}f.png'
                sheet.save(str(out_path), 'PNG')
                results.append({
                    'frame_count': n,
                    'output_path': str(out_path),
                    'size': sheet.size
                })

        # Generate GIF
        gif_result = None
        if output_gif or True:  # Always generate GIF
            gif_frames = []
            for f in frame_files:
                img = Image.open(f).convert('RGBA')
                img = chroma_key_rgba(img, chroma_key)
                img_p = img.convert('P', palette=Image.ADAPTIVE, colors=256)
                gif_frames.append(img_p)

            gif_path = Path(output_path).parent / 'video_sprite.gif'
            if gif_frames:
                gif_frames[0].save(
                    str(gif_path),
                    save_all=True,
                    append_images=gif_frames[1:],
                    duration=int(1000 / fps),
                    loop=0,
                    optimize=True
                )
                gif_result = {'path': str(gif_path), 'frames': len(gif_frames)}

        return {
            'success': True,
            'total_frames': len(frame_files),
            'fps': fps,
            'sprite_sheets': results,
            'gif': gif_result
        }

    finally:
        # Cleanup temp
        shutil.rmtree(tmp_dir, ignore_errors=True)


if __name__ == '__main__':
    encoded = sys.argv[1]
    args = json.loads(base64.b64decode(encoded).decode())
    result = video_to_sprite(args)
    print(json.dumps(result))
