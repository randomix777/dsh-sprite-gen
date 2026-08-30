import subprocess, base64, json, os
ITEMS = [
  ('enemy_scout.png', 'D:/Projects/CodeChronoBullet/assets/sprites/enemies/enemy_scout.png'),
  ('shotgun_pump.png', 'D:/Projects/CodeChronoBullet/assets/weapons/shotgun_pump.png'),
  ('muzzle_flash.png', 'D:/Projects/CodeChronoBullet/assets/effects/muzzle_flash.png'),
  ('sprite_sheet.png', 'D:/Projects/CodeChronoBullet/assets/sprites/effects/sprite_sheet.png'),
]
for n, p in ITEMS:
    args = {'image_path': p, 'grid_cols': 0, 'grid_rows': 0}
    b64 = base64.b64encode(json.dumps(args).encode()).decode()
    r = subprocess.run(['python', 'lib/analysis.py', b64], capture_output=True, text=True, cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    try:
        d = json.loads(r.stdout) if r.stdout.strip() else {}
    except Exception:
        print(f"=== {n} === PARSE ERROR: {r.stdout[:200]}")
        continue
    print(f"=== {n} ===")
    print(f"  passed={d.get('passed')}  severity={d.get('severity')}")
    fr = d.get('frames', [{}])[0]
    print(f"  checkerboard={fr.get('checkerboard_score',0):.2f}  border_ratio={fr.get('border_ratio',0):.2f}  trans={fr.get('transparent_ratio',0):.2%}")
    print(f"  failures: {d.get('failures', [])}")
    print()
