"""Build an allowlisted source zip, excluding local rooms, secrets and dependencies."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
output = root.parent / 'deedquest-deploy.zip'
root_files = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.json',
              'vite.config.ts', 'vercel.json', 'index.html', '.env.example', '.gitignore',
              '.vercelignore', 'README.md', 'QUICKSTART.md', 'VS-CODE.md', 'CAPACITY.md', 'QA.md', 'CLOUDFLARE.md', 'HOSTING-ADS.md', 'VERCEL-PLAYTEST.md', 'DISCORD.md', 'wrangler.jsonc', '.dev.vars.example']
paths = [root / name for name in root_files]
for directory in ['api', 'server', 'src', 'tests', 'worker']:
    paths.extend(path for path in (root / directory).rglob('*') if path.is_file() and path.name != 'styles.css')
paths.extend((root / 'public' / 'flags').glob('*'))
paths.append(root / 'public' / 'favicon.svg')
if (root / 'public' / 'ads.txt').is_file(): paths.append(root / 'public' / 'ads.txt')
paths.extend(root / 'public' / 'maps' / f'{name}.svg' for name in ['ember', 'neon', 'frost', 'dunes', 'astral', 'india'])
paths.extend(root / 'scripts' / name for name in ['generate-art.mjs', 'fetch-flags.py', 'live-smoke.mjs', 'india-bots-smoke.mjs', 'package-release.py'])
assert all(path.is_file() for path in paths), 'An expected release file is missing.'
assert len(paths) == len(set(paths)), 'Duplicate release paths.'
with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
    for path in sorted(paths):
        relative = path.relative_to(root)
        assert not any(part in ['qa', '.local-data', 'node_modules', 'dist', '.git'] for part in relative.parts)
        assert not path.name.startswith('.env') or path.name == '.env.example'
        archive.write(path, 'deedquest/' + relative.as_posix())
with ZipFile(output) as archive:
    assert archive.testzip() is None
    assert 'deedquest/api/room.ts' in archive.namelist()
    assert 'deedquest/VS-CODE.md' in archive.namelist()
print(f'Packaged {len(paths)} files: {output} ({output.stat().st_size:,} bytes)')
