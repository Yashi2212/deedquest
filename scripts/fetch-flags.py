"""Vendor the required flag-icons SVGs and license, without executing package code."""
import io, json, pathlib, re, tarfile, urllib.request
root = pathlib.Path(__file__).resolve().parent.parent
source = (root / 'src/game/maps.ts').read_text(encoding='utf-8')
codes = sorted(set(re.findall(r"place\('[^']*(?:’[^']*)?',\s*'([a-z]{2})'", source)))
metadata = json.load(urllib.request.urlopen('https://registry.npmjs.org/flag-icons/latest', timeout=30))
archive = urllib.request.urlopen(metadata['dist']['tarball'], timeout=60).read()
target = root / 'public/flags'
target.mkdir(parents=True, exist_ok=True)
with tarfile.open(fileobj=io.BytesIO(archive), mode='r:gz') as package:
    for code in codes:
        contents = package.extractfile(f'package/flags/4x3/{code}.svg').read()
        (target / f'{code}.svg').write_bytes(contents)
    license_file = next(member for member in package.getnames() if member.lower() in ('package/license', 'package/license.txt'))
    (target / 'LICENSE.txt').write_bytes(package.extractfile(license_file).read())
(target / 'CREDITS.md').write_text(f'Country flags: flag-icons {metadata["version"]}\nSource: https://github.com/lipis/flag-icons\nLicense: MIT (see LICENSE.txt).\nVendored from the official npm registry.\n', encoding='utf-8')
print(f'Bundled {len(codes)} country flags from flag-icons {metadata["version"]}.')
