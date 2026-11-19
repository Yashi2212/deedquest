import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../public/', import.meta.url));
mkdirSync(`${root}maps`, { recursive: true });
const rect = (x,y,w,h,fill,extra='') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${extra}/>`;
const path = (d,fill,extra='') => `<path d="${d}" fill="${fill}" ${extra}/>`;
const line = (x1,y1,x2,y2,color,width=2) => `<path d="M${x1} ${y1}L${x2} ${y2}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`;
const circle=(x,y,r,fill,extra='')=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" ${extra}/>`;
function begin(accent){let s=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400"><defs><radialGradient id="halo"><stop stop-color="${accent}" stop-opacity=".18"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient><linearGradient id="water" x2="0" y2="1"><stop stop-color="#18393e"/><stop offset="1" stop-color="#0a1a25"/></linearGradient><filter id="glow"><feGaussianBlur stdDeviation="3"/></filter><linearGradient id="glass" x2="1" y2="1"><stop stop-color="${accent}" stop-opacity=".7"/><stop offset="1" stop-color="#0d3036"/></linearGradient></defs><ellipse cx="300" cy="220" rx="285" ry="180" fill="url(#halo)"/><ellipse cx="300" cy="315" rx="240" ry="43" fill="#050e15" opacity=".6"/>`;
for(let i=0;i<31;i++){const x=47+(i*83)%517,y=33+(i*37)%197;s+=circle(x,y,i%5===0?1.7:.8,i%3? '#769da2':accent,`opacity="${i%3===0?.7:.3}"`)}
s+=`<ellipse cx="300" cy="274" rx="258" ry="84" fill="none" stroke="${accent}" stroke-opacity=".18" stroke-dasharray="3 8"/><path d="M82 311Q310 394 518 285" fill="none" stroke="${accent}" stroke-width="2" stroke-opacity=".3"/>`;return s}
function platform(top='#233d40',front='#102b32'){return path('M89 270L300 174 519 270 302 363Z',front)+path('M89 258L300 162 519 258 302 350Z',top)+path('M89 258V270L302 363V350Z','#152c33')+path('M302 350V363L519 270V258Z','#0b252d')}
function palm(x,y,scale=1){return `<g transform="translate(${x} ${y}) scale(${scale})">${path('M0 0Q12 -35 3 -73','none','stroke="#ad8962" stroke-width="5"')}${path('M3 -72Q-22 -92 -43 -69Q-21 -82 3 -72Q27 -98 52 -74Q29 -84 3 -72Q-4 -104 -26 -99Q-10 -94 3 -72Q25 -101 33 -102Q37 -91 3 -72','#378c78')}</g>`}
function building(x,y,w,h,accent){let s=rect(x,y-h,w,h,'#213840')+path(`M${x+w} ${y-h}l16 -9v${h}l-16 9Z`,'#122a34')+path(`M${x} ${y-h}l16 -9h${w}l-16 9Z`,'#3c5960');for(let r=0;r<Math.floor((h-12)/15);r++)for(let c=0;c<Math.floor((w-8)/12);c++)s+=rect(x+7+c*12,y-h+9+r*15,5,7,(r+c)%4===0?'#b5dfc4':accent,`opacity="${(r+c)%3===0?.4:.85}"`);return s}
function peak(x,y,w,h){return path(`M${x-w/2} ${y}L${x} ${y-h}L${x+w/2} ${y}Z`,'#466a77')+path(`M${x} ${y-h}L${x+w/2} ${y}H${x-12}Z`,'#223e53')+path(`M${x-w*.19} ${y-h*.61}L${x} ${y-h}L${x+w*.19} ${y-h*.61}l-${w*.12} -${h*.09}l-${w*.11} ${h*.11}Z`,'#cbebe5')}
function arch(x,y,w,h,color){return path(`M${x} ${y}v-${h*.6}Q${x+w/2} ${y-h*1.5} ${x+w} ${y-h*.6}V${y}Z`,color)}
function dome(x,y,r,color){return path(`M${x-r} ${y}Q${x-r} ${y-r*.8} ${x} ${y-r*1.2}Q${x+r} ${y-r*.8} ${x+r} ${y}Z`,color)+line(x,y-r*1.2,x,y-r*1.5,'#e9c27f',2)+circle(x,y-r*1.5,2,'#ffe3a7')}
function compass(x,y,accent){return `<g transform="translate(${x} ${y})">${circle(0,0,23,'#11252b','stroke="#597879" stroke-width="1"')}${circle(0,0,18,'none',`stroke="${accent}" stroke-opacity=".45" stroke-dasharray="2 4"`)}${path('M-8 10L4 -13 9 9 0 4Z',accent)}${path('M-8 10L4 -13 0 4Z','#e8d6b5')}</g>`}
function art(id){const accents={ember:'#38d9bd',neon:'#ffb45c',frost:'#91d8f2',dunes:'#f6be73',astral:'#81d9b6',india:'#ffba76'};const a=accents[id];let s=begin(a);
if(id==='ember'){
s+=`<ellipse cx="295" cy="271" rx="227" ry="67" fill="url(#water)"/>`+path('M151 252Q133 200 206 181Q257 153 326 176Q416 174 448 228Q454 275 348 305Q245 319 151 252','#33584c')+path('M151 244Q133 192 206 173Q257 145 326 168Q416 166 448 220Q440 262 340 288Q250 304 151 244','#a8986c')+path('M172 229Q179 185 243 182Q332 167 390 197L410 234 326 273 227 267Z','#376b57');
s+=rect(290,139,34,102,'#d7d5b3')+path('M324 139l15 -8v101l-15 9Z','#829d8c')+path('M284 139l28 -17 34 8 -22 15Z','#bc6d46')+rect(293,114,29,23,'#1b343d','rx="3"')+rect(297,117,20,14,a)+path('M294 112l15 -16 20 16Z','#d88853')+path('M300 236v-21q9 -12 18 0v21Z','#23373a')+path('M301 124L85 157 95 96Z',a,'opacity=".055"')+path('M317 123L516 113 493 170Z',a,'opacity=".055"');
s+=palm(200,247,.88)+palm(397,220,.8)+palm(370,272,.66);
s+=path('M389 286l80 -21 -9 22 -51 14Z','#aa7b54')+line(427,276,427,212,'#d3cab0',3)+path('M421 221v51l-33 10Z','#f0d69d')+path('M433 229v41l26 -7Z','#439b90');
s+=rect(229,234,43,28,'#b8793e','rx="5"')+path('M229 238v-10q22 -13 43 0v10Z','#deac5c')+rect(247,226,8,37,'#f3cd7a')+rect(245,241,12,10,'#6e532f','rx="2"')+circle(251,246,2,a);
for(let i=0;i<5;i++)s+=path(`M${90+i*75} ${300+(i%2)*18}q16 7 31 -1`,'none',`stroke="${a}" stroke-opacity=".35" stroke-width="2"`);
}else if(id==='neon'){
s+=platform('#1c313a','#0a1b25')+path('M126 260L295 187 483 265 310 333Z','#14232d')+path('M157 269L318 199M236 313L411 236M168 235L380 321','none',`stroke="${a}" stroke-width="2" stroke-opacity=".5"`);
s+=building(170,241,38,83,'#61dbcb')+building(236,228,53,137,a)+building(319,215,36,155,'#4cd5cf')+building(383,251,40,94,a)+building(280,291,57,111,'#74d0b6')+building(192,291,36,51,a)+building(365,298,35,43,'#b7decd');
s+=line(337,51,337,24,a,2)+circle(337,24,3,a)+rect(251,102,27,13,'#142b2e','rx="2"')+line(254,108,274,108,a,3)+path('M245 241l28 -12 15 8 -27 12Z','#edb161')+path('M353 300l30 -14 15 8 -29 14Z','#75dcca')+line(114,272,128,266,a,2);
}else if(id==='frost'){
s+=platform('#294851','#112632')+peak(255,234,172,178)+peak(353,242,172,210)+peak(411,246,118,139)+peak(180,250,98,98)+path('M111 269Q229 224 278 274T485 284','none','stroke="#aacfd0" stroke-width="11"')+path('M111 269Q229 224 278 274T485 284','none','stroke="#263d48" stroke-width="5" stroke-dasharray="3 8"');
s+=rect(216,248,84,26,'#38525e','rx="6"')+rect(219,253,77,12,a,'rx="3"')+rect(239,246,9,29,'#304d55')+rect(267,246,9,29,'#304d55')+circle(230,278,5,'#0a2029')+circle(288,278,5,'#0a2029');
for(const [x,y] of [[148,239],[173,260],[365,295],[406,283],[317,315]])s+=line(x,y,x,y-39,'#4c6c70',4)+path(`M${x-14} ${y-7}l14 -33 14 33Z`,'#578a7f')+path(`M${x-9} ${y-20}l9 -22 9 22Z`,'#c8e5db');
s+=path('M148 110Q250 16 451 78M184 91Q277 37 416 83','none',`stroke="${a}" stroke-width="9" stroke-opacity=".11"`);
}else if(id==='dunes'){
s+=platform('#6b5842','#3c322c')+path('M127 250Q230 208 320 241T485 259L302 338Z','#9a7850')+path('M181 240L264 99 351 248Z','#c9a269')+path('M264 99L351 248 265 260Z','#8a6948')+path('M305 216L377 122 443 235Z','#b9915c')+path('M377 122L443 235 379 248Z','#725b41');
s+=rect(157,220,54,72,'#aa8659')+arch(169,293,29,60,'#243231')+rect(148,211,73,12,'#d1ac76')+rect(144,205,80,8,'#e2c38a');
for(let x=149;x<220;x+=16)s+=rect(x,195,10,14,'#bb9460');
s+=rect(359,269,43,28,'#ba8954')+dome(380,269,25,'#d9b173')+palm(427,287,.8)+palm(142,232,.65)+path('M241 312Q296 287 336 301','none','stroke="#e5b95f" stroke-width="3" stroke-dasharray="4 6"');
}else if(id==='astral'){
s+=`<ellipse cx="300" cy="300" rx="176" ry="43" fill="none" stroke="#4e8d83" stroke-width="2"/><circle cx="300" cy="183" r="117" fill="#133b48" stroke="#5b9a95" stroke-width="2"/>`;
s+=path('M213 109l30 -18 25 10 10 29 -18 13 7 29 -22 17 -19 -15 -18 -29Z','#7ea584')+path('M260 186l31 12 10 26 -17 41 -16 12 -9 -39 -20 -28Z','#acb28a')+path('M304 92l47 -6 44 41 -18 16 -20 -9 -22 17 -8 36 -28 -5 -10 -29 18 -18Z','#9fbe9b')+path('M302 171l29 9 17 35 -25 39 -21 -9 -13 -39Z','#bbbf8c')+path('M364 235l29 -2 14 21 -16 15 -35 -12Z','#7ebbaa');
s+=`<ellipse cx="300" cy="183" rx="58" ry="117" fill="none" stroke="#79c9b4" stroke-opacity=".3"/><ellipse cx="300" cy="183" rx="114" ry="40" fill="none" stroke="#79c9b4" stroke-opacity=".3"/>`+line(183,183,417,183,'#7dc6b044',1)+line(300,66,300,300,'#7dc6b044',1);
s+=`<ellipse cx="300" cy="187" rx="174" ry="48" transform="rotate(-28 300 187)" fill="none" stroke="#deb984" stroke-width="2" stroke-dasharray="4 5"/>`+path('M433 101l-22 2 6 -16 -7 -4 -12 20 -19 7 5 5 20 -3 19 12 5 -4 -10 -12Z','#f1d49d')+circle(333,177,6,'#ffba76','stroke="#fff0ca" stroke-width="2"');
}else{
s+=platform('#28413a','#172a2b')+path('M121 262L296 184 483 264 304 339Z','#3b574a')+path('M275 288L301 276 343 318 317 330Z','#497a78')+path('M289 290L300 284 332 319 320 323Z','#68b1a2');
s+=rect(223,214,155,68,'#c7c1a0')+rect(231,224,138,54,'#e0dbc0')+dome(300,214,42,'#e6e3c8')+rect(287,162,26,7,'#aeae90')+arch(281,280,39,61,'#31534f')+arch(241,279,24,44,'#718c74')+arch(335,279,24,44,'#718c74');
for(const x of [203,386]){s+=rect(x,174,12,109,'#c9ceb1')+rect(x-3,209,18,6,'#acb398')+rect(x-3,246,18,6,'#acb398')+dome(x+6,174,12,'#efe4c1')+rect(x-2,280,16,8,'#879f87');}
for(const x of [238,348])s+=dome(x+9,217,15,'#d3d0ac');
s+=line(155,261,155,176,'#cfbe94',3)+rect(156,176,41,9,'#ff9933')+rect(156,185,41,9,'#f5f3e7')+rect(156,194,41,9,'#138808')+circle(176,189.5,3.9,'none','stroke="#000080" stroke-width=".8"');
for(let i=0;i<12;i++){let t=i*Math.PI/6;s+=line(176,189.5,176+3.4*Math.cos(t),189.5+3.4*Math.sin(t),'#000080',.5)}
s+=path('M164 301Q300 365 433 294','none','stroke="#e3ab62" stroke-width="2" stroke-dasharray="3 7"');
}
s+=compass(491,330,a)+circle(109,316,5,a,'stroke="#d2f2d4" stroke-width="1"')+circle(90,309,2,'#e6bb7e')+circle(82,319,2,'#e6bb7e');return s+'</svg>'}
for(const id of ['ember','neon','frost','dunes','astral','india'])writeFileSync(`${root}maps/${id}.svg`,art(id));
writeFileSync(`${root}favicon.svg`,`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="23" fill="#10242a" stroke="#b19062"/><circle cx="24" cy="24" r="18" fill="none" stroke="#51887c" stroke-dasharray="2 4"/><path d="M14 35L29 10 34 34 24 28Z" fill="#59d2b3"/><path d="M14 35L29 10 24 28Z" fill="#f4c582"/></svg>`);
console.log('Generated six original adventure illustrations and compass favicon.');
