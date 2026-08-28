import json
import sys
import base64
from PIL import Image
import os

def auto_crop(img, threshold=1):
    """Crop transparent edges from an image."""
    if img.mode != 'RGBA':
        img = img.convert('RGBA')
    bbox = img.getbbox()
    if bbox is None:
        return img.crop((0, 0, img.width, img.height))
    return img.crop(bbox)

def generate_sprite_sheet(args):
    # Normalize paths (handle Windows backslashes)
    for key in ['image_path', 'output_path']:
        if key in args:
            args[key] = args[key].replace('\\', '/')
    
    input_path = args.get('image_path', '')
    grid_cols = args.get('grid_cols', 4)
    grid_rows = args.get('grid_rows', 4)
    crop_mode = args.get('crop_mode', 'auto')
    spacing = args.get('spacing', 0)
    cell_width = args.get('cell_width', 32)
    cell_height = args.get('cell_height', 32)
    transparent_threshold = args.get('transparent_threshold', 1)
    output_path = args.get('output_path', './output/sprite_sheet.png')
    padding = args.get('padding', 0)
    
    # Open input image
    img = Image.open(input_path)
    if img.mode != 'RGBA':
        img = img.convert('RGBA')
    
    src_w, src_h = img.size
    
    if crop_mode == 'auto':
        cell_w = src_w // grid_cols
        cell_h = src_h // grid_rows
        
        cropped_cells = []
        for row in range(grid_rows):
            for col in range(grid_cols):
                x = col * cell_w
                y = row * cell_h
                cell = img.crop((x, y, x + cell_w, y + cell_h))
                cell = auto_crop(cell, transparent_threshold)
                if padding > 0:
                    new_cell = Image.new('RGBA', (cell.width + padding*2, cell.height + padding*2), (0, 0, 0, 0))
                    new_cell.paste(cell, (padding, padding))
                    cell = new_cell
                cropped_cells.append(cell)
        
        max_w = max(c.width for c in cropped_cells) if cropped_cells else cell_w
        max_h = max(c.height for c in cropped_cells) if cropped_cells else cell_h
        
        padded_cells = []
        for c in cropped_cells:
            if c.width < max_w or c.height < max_h:
                padded = Image.new('RGBA', (max_w, max_h), (0, 0, 0, 0))
                padded.paste(c, (0, 0))
                padded_cells.append(padded)
            else:
                padded_cells.append(c)
        
        output_w = max_w * grid_cols + spacing * (grid_cols - 1)
        output_h = max_h * grid_rows + spacing * (grid_rows - 1)
        result = Image.new('RGBA', (output_w, output_h), (0, 0, 0, 0))
        
        for idx, cell in enumerate(padded_cells):
            row = idx // grid_cols
            col = idx % grid_cols
            x = col * (max_w + spacing)
            y = row * (max_h + spacing)
            result.paste(cell, (x, y))
    
    elif crop_mode == 'fixed':
        total_w = cell_width * grid_cols + spacing * (grid_cols - 1)
        total_h = cell_height * grid_rows + spacing * (grid_rows - 1)
        result = Image.new('RGBA', (total_w, total_h), (0, 0, 0, 0))
        
        scale_w = cell_width / src_w
        scale_h = cell_height / src_h
        scale = min(scale_w, scale_h)
        new_w = int(src_w * scale)
        new_h = int(src_h * scale)
        scaled = img.resize((new_w, new_h), Image.LANCZOS)
        
        cx = (cell_width - new_w) // 2
        cy = (cell_height - new_h) // 2
        
        for row in range(grid_rows):
            for col in range(grid_cols):
                x = col * (cell_width + spacing) + cx
                y = row * (cell_height + spacing) + cy
                result.paste(scaled, (x, y))
    
    else:  # none
        cell_w = src_w // grid_cols
        cell_h = src_h // grid_rows
        
        output_w = cell_w * grid_cols + spacing * (grid_cols - 1)
        output_h = cell_h * grid_rows + spacing * (grid_rows - 1)
        result = Image.new('RGBA', (output_w, output_h), (0, 0, 0, 0))
        
        for row in range(grid_rows):
            for col in range(grid_cols):
                x = col * cell_w + col * spacing
                y = row * cell_h + row * spacing
                cell = img.crop((col * cell_w, row * cell_h,
                                 min((col + 1) * cell_w, src_w),
                                 min((row + 1) * cell_h, src_h)))
                result.paste(cell, (x, y))
    
    out_dir = os.path.dirname(output_path)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
    
    result.save(output_path, 'PNG')
    
    return {
        'success': True,
        'output_path': output_path,
        'output_size': list(result.size),
        'grid_cols': grid_cols,
        'grid_rows': grid_rows,
        'crop_mode': crop_mode
    }

if __name__ == '__main__':
    encoded = sys.argv[1]
    args = json.loads(base64.b64decode(encoded).decode())
    result = generate_sprite_sheet(args)
    print(json.dumps(result))
