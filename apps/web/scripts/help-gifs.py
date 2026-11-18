"""Makes the Help walkthrough GIFs from the pictures taken by scripts/help-shots.mjs.

    python3 scripts/help-gifs.py

For each guide picture with markers, the GIF shows the page, then each step in turn: the rest of
the page dimmed, a box around the step's target, and the step text in a bar at the bottom.
Needs Pillow (pip install pillow). Sets "gif": true in lib/help-shots.json for each GIF made.
"""
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public/help/guides'
MANIFEST = ROOT / 'lib/help-shots.json'
WIDTH = 760
MIN_STEPS = 3  # A walkthrough for one or two steps adds nothing over the picture.


def font(size, bold=False):
    for name in (['DejaVuSans-Bold.ttf'] if bold else ['DejaVuSans.ttf']):
        for d in ('/usr/share/fonts/truetype/dejavu', '/usr/share/fonts/dejavu', '/Library/Fonts'):
            p = Path(d) / name
            if p.exists():
                return ImageFont.truetype(str(p), size)
    return ImageFont.load_default()


def steps_text():
    """Step texts per guide id, read from lib/help-guides.ts with Node (which strips the types)."""
    code = "import(process.argv[1]).then((m) => console.log(JSON.stringify(Object.fromEntries(m.GUIDES.map((g) => [g.id, g.steps.map((s) => s.text)])))))"
    out = subprocess.run(['node', '--experimental-strip-types', '--no-warnings', '-e', code, str(ROOT / 'lib/help-guides.ts')], capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def wrap(draw, text, f, width):
    words, lines, line = text.split(), [], ''
    for w in words:
        t = (line + ' ' + w).strip()
        if draw.textlength(t, font=f) <= width:
            line = t
        else:
            lines.append(line)
            line = w
    if line:
        lines.append(line)
    return lines[:3]


def main():
    manifest = json.loads(MANIFEST.read_text())
    texts = steps_text()
    only = sys.argv[1:]
    f, fb = font(15), font(15, True)
    for gid, shot in manifest.items():
        if only and gid not in only:
            continue
        src = OUT / f'{gid}.jpg'
        if not src.exists() or len(shot['markers']) < MIN_STEPS:
            shot['gif'] = False
            (OUT / f'{gid}.gif').unlink(missing_ok=True)
            continue
        base = Image.open(src).convert('RGB')
        scale = WIDTH / base.width
        base = base.resize((WIDTH, round(base.height * scale)), Image.LANCZOS)
        # Tall pictures are cropped around each step so the GIF stays a sensible size.
        view_h = min(base.height, round(WIDTH * 0.66))
        bar = 74
        frames, durations = [], []

        def crop_for(cy):
            top = max(0, min(base.height - view_h, round(cy - view_h / 2)))
            return base.crop((0, top, WIDTH, top + view_h)), top

        first, _ = crop_for(0)
        intro = Image.new('RGB', (WIDTH, view_h + bar), 'white')
        intro.paste(first, (0, 0))
        d = ImageDraw.Draw(intro)
        d.rectangle((0, view_h, WIDTH, view_h + bar), fill='#111827')
        d.text((16, view_h + 26), f'{len(shot["markers"])} steps · watch each one', font=fb, fill='white')
        frames.append(intro)
        durations.append(1400)
        steps = texts.get(gid, [])
        for m in shot['markers']:
            x0, y0 = m['x'] / 100 * base.width, m['y'] / 100 * base.height
            x1, y1 = x0 + m['w'] / 100 * base.width, y0 + m['h'] / 100 * base.height
            view, top = crop_for((y0 + y1) / 2)
            dim = Image.blend(view, Image.new('RGB', view.size, 'black'), 0.45)
            box = (round(x0), round(y0 - top), round(x1), round(y1 - top))
            dim.paste(view.crop(box), box[:2])
            frame = Image.new('RGB', (WIDTH, view_h + bar), 'white')
            frame.paste(dim, (0, 0))
            d = ImageDraw.Draw(frame)
            d.rounded_rectangle(box, radius=6, outline='#e11d48', width=4)
            cx, cy = max(14, box[0]), max(14, box[1])
            d.ellipse((cx - 14, cy - 14, cx + 14, cy + 14), fill='#e11d48', outline='white', width=2)
            n = str(m['step'])
            d.text((cx - d.textlength(n, font=fb) / 2, cy - 10), n, font=fb, fill='white')
            d.rectangle((0, view_h, WIDTH, view_h + bar), fill='#111827')
            text = steps[m['step'] - 1] if m['step'] - 1 < len(steps) else ''
            for i, line in enumerate(wrap(d, f'{m["step"]}. {text}', f, WIDTH - 32)):
                d.text((16, view_h + 8 + i * 19), line, font=f, fill='white')
            frames.append(frame)
            durations.append(2600)
        pal = [fr.convert('P', palette=Image.ADAPTIVE, colors=48) for fr in frames]
        pal[0].save(OUT / f'{gid}.gif', save_all=True, append_images=pal[1:], duration=durations, loop=0, optimize=True)
        shot['gif'] = True
        print(f'✓ {gid}.gif {len(frames)} frames, {(OUT / f"{gid}.gif").stat().st_size // 1024} KB')
    MANIFEST.write_text(json.dumps(manifest, indent=1) + '\n')


if __name__ == '__main__':
    main()
