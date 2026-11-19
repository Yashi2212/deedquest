import { readFileSync, writeFileSync } from 'node:fs';
let css = readFileSync('src/dark.css', 'utf8');
function color(hex) {
  let value = hex.slice(1); if (value.length === 3 || value.length === 4) value = [...value].map(c => c + c).join('');
  if (value.length !== 6 && value.length !== 8) return hex;
  const [r,g,b] = [0,2,4].map(i => parseInt(value.slice(i,i+2),16)/255); const max = Math.max(r,g,b), min = Math.min(r,g,b), d = max-min, l = (max+min)/2;
  if (!d) return hex;
  let h = max === r ? ((g-b)/d + (g < b ? 6 : 0)) : max === g ? (b-r)/d + 2 : (r-g)/d + 4; h *= 60;
  if (h < 238 || h > 330) return hex;
  const hue = l > .58 ? 179 : 201, s = l > .58 ? .26 : .26;
  const c = (1-Math.abs(2*l-1))*s, x = c*(1-Math.abs((hue/60)%2-1)), m=l-c/2;
  const rgb = hue <180 ? [0,c,x] : hue<240 ? [0,x,c] : [x,0,c];
  return '#'+rgb.map(n => Math.round((n+m)*255).toString(16).padStart(2,'0')).join('')+value.slice(6);
}
css = css.replace(/#[\da-fA-F]{8}\b|#[\da-fA-F]{6}\b|#[\da-fA-F]{4}\b|#[\da-fA-F]{3}\b/g,color);
writeFileSync('src/dark.css',css);
let app = readFileSync('src/App.tsx','utf8');
app = app.replaceAll('Five adventures.','Six adventures.').replaceAll('5 adventure maps','6 adventure maps').replaceAll('Five original boards','Six original boards').replaceAll('TWO SMALL. THREE BIG.','TWO SMALL. FOUR BIG.').replaceAll('3 big','4 big');
app = app.replace("Board, Brand, CopyButton", "Board, Brand, CountryFlag, CopyButton");
app = app.replace('<span className="asset-color" style={{ background: t.color || \'#789888\' }} />','<CountryFlag tile={t} /><span className="asset-color" style={{ background: t.color || \'#789888\' }} />');
app = app.replace('A world for <em>every mood.</em>', 'Real places.<br /><em>New adventures.</em>').replace('Choose one for your next game.', 'Including an all-India adventure.');
writeFileSync('src/App.tsx',app);
let panels = readFileSync('src/panels.tsx','utf8');
panels = panels.replace('<h3>{tile.name}</h3>{tile.price', '<h3 className="property-place-title"><CountryFlag tile={tile} />{tile.name}</h3>{tile.countryName && <p className="place-region">{tile.countryName}{tile.region ? ` · ${tile.region}` : ""}</p>}{tile.price');
panels = panels.replace('<i style={{ background: tile.color || map.accent }} /><span>{tile.name}', '<CountryFlag tile={tile} /><i style={{ background: tile.color || map.accent }} /><span>{tile.name}');
panels = panels.replace('<strong>{tile.name}</strong><span>{tile.price', '<strong className="property-place-title"><CountryFlag tile={tile} />{tile.name}</strong><span>{tile.countryName}{tile.region ? ` · ${tile.region} · ` : " · "}{tile.price');
writeFileSync('src/panels.tsx',panels);
