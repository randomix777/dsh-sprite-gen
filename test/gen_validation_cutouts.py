"""Generate cutout masks + previews for CodeChronoBullet validation assets."""
import subprocess, base64, json, os

PLUGIN_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(PLUGIN_ROOT, 'output', 'validation')
os.makedirs(OUT_DIR, exist_ok=True)

ASSETS = [
    ('enemy_scout',  'D:/Projects/CodeChronoBullet/assets/sprites/enemies/enemy_scout.png',     'auto'),
    ('shotgun_pump', 'D:/Projects/CodeChronoBullet/assets/weapons/shotgun_pump.png',             'auto'),
    ('muzzle_flash', 'D:/Projects/CodeChronoBullet/assets/effects/muzzle_flash.png',             'auto'),
]

for name, image_path, mode in ASSETS:
    print(f'\n--- {name} ---')
    for out_type in ['cutout_mask', 'cutout_preview']:
        out_name = f'{name}_{out_type}.png'
        args = {
            'image_path': image_path,
            'mode': mode,
            'output_path': os.path.join(OUT_DIR, out_name),
            'output_type': out_type,
        }
        b64 = base64.b64encode(json.dumps(args).encode()).decode()
        r = subprocess.run(['python', 'lib/cutout.py', b64], capture_output=True, text=True, cwd=PLUGIN_ROOT)
        if r.stdout.strip():
            try:
                d = json.loads(r.stdout)
                print(f'  {out_type}: success={d.get("success")} output={d.get("output_path","")}')
            except Exception:
                print(f'  {out_type}: stdout={r.stdout[:200]}')
        if r.stderr:
            print(f'  stderr: {r.stderr[:200]}')
