import type { AdventureCard, BoardMap, Tile } from './types';

const GROUP_COLORS = ['#fb8c6b', '#6fe3e5', '#ed7cbf', '#ffba61', '#ee657f', '#f0d95e', '#73dca4', '#7b9cfa', '#bd90fa', '#54cec0', '#dea377', '#9fbc75'];
const PRICES = [60, 60, 100, 100, 120, 140, 140, 160, 180, 180, 200, 220, 220, 240, 260, 260, 280, 300, 300, 320, 350, 400];
const RENTS = [
  [2, 10, 30, 90, 160, 250], [4, 20, 60, 180, 320, 450],
  [6, 30, 90, 270, 400, 550], [6, 30, 90, 270, 400, 550], [8, 40, 100, 300, 450, 600],
  [10, 50, 150, 450, 625, 750], [10, 50, 150, 450, 625, 750], [12, 60, 180, 500, 700, 900],
  [14, 70, 200, 550, 750, 950], [14, 70, 200, 550, 750, 950], [16, 80, 220, 600, 800, 1000],
  [18, 90, 250, 700, 875, 1050], [18, 90, 250, 700, 875, 1050], [20, 100, 300, 750, 925, 1100],
  [22, 110, 330, 800, 975, 1150], [22, 110, 330, 800, 975, 1150], [24, 120, 360, 850, 1025, 1200],
  [26, 130, 390, 900, 1100, 1275], [26, 130, 390, 900, 1100, 1275], [28, 150, 450, 1000, 1200, 1400],
  [35, 175, 500, 1100, 1300, 1500], [50, 200, 600, 1400, 1700, 2000],
];
const GROUP_SIZES = [2, 3, 3, 3, 3, 3, 3, 2];
/** Building sets follow countries internationally and states or union territories in India. */
export function getPropertySetName(tile: Tile): string {
  if (tile.kind !== 'property') return '';
  if (tile.group?.startsWith('india-')) return tile.region ?? 'State';
  return tile.countryName ?? 'Property';
}

interface Destination { name: string; countryCode: string; countryName: string; region: string }
const COUNTRIES: Record<string, [string, string]> = {
  in: ['India', 'Asia'], pt: ['Portugal', 'Europe'], es: ['Spain', 'Europe'],
  fr: ['France', 'Europe'], mc: ['Monaco', 'Europe'], it: ['Italy', 'Europe'],
  hr: ['Croatia', 'Europe'], gr: ['Greece', 'Europe'], tr: ['Türkiye', 'Asia / Europe'],
  id: ['Indonesia', 'Asia'], th: ['Thailand', 'Asia'], sg: ['Singapore', 'Asia'],
  au: ['Australia', 'Oceania'], nz: ['New Zealand', 'Oceania'], us: ['United States', 'North America'],
  br: ['Brazil', 'South America'], cn: ['China', 'Asia'], kr: ['South Korea', 'Asia'],
  jp: ['Japan', 'Asia'], gb: ['United Kingdom', 'Europe'], de: ['Germany', 'Europe'],
  ae: ['United Arab Emirates', 'Asia'], qa: ['Qatar', 'Asia'], ca: ['Canada', 'North America'],
  np: ['Nepal', 'Asia'], bt: ['Bhutan', 'Asia'], ch: ['Switzerland', 'Europe'],
  at: ['Austria', 'Europe'], no: ['Norway', 'Europe'], se: ['Sweden', 'Europe'],
  fi: ['Finland', 'Europe'], is: ['Iceland', 'Europe'], eg: ['Egypt', 'Africa'],
  ma: ['Morocco', 'Africa'], jo: ['Jordan', 'Asia'], om: ['Oman', 'Asia'],
  uz: ['Uzbekistan', 'Asia'], ke: ['Kenya', 'Africa'], za: ['South Africa', 'Africa'],
  ng: ['Nigeria', 'Africa'], gh: ['Ghana', 'Africa'], mx: ['Mexico', 'North America'],
  cu: ['Cuba', 'North America'], ar: ['Argentina', 'South America'], pe: ['Peru', 'South America'],
  co: ['Colombia', 'South America'], cl: ['Chile', 'South America'], fj: ['Fiji', 'Oceania'],
};
function place(name: string, countryCode: string, region?: string): Destination {
  const country = COUNTRIES[countryCode];
  if (!country) throw new Error(`Missing country metadata for ${name}.`);
  return { name, countryCode, countryName: country[0], region: region ?? country[1] };
}

interface AdventureDefinition {
  id: string; name: string; subtitle: string; description: string; tag: string;
  accent: string; background: string; large: boolean; properties: Destination[];
  stations: Destination[]; utilities: [Destination, Destination]; start: string; rest: string;
  jail: string; goToJail: string; taxes: [string, string];
  treasurePositions: number[]; surprisePositions: number[];
  rules: string[]; treasureCards: AdventureCard[]; surpriseCards: AdventureCard[];
}

function cash(id: string, title: string, text: string, amount: number): AdventureCard { return { id, title, text, effect: 'cash', amount }; }
function move(id: string, title: string, text: string, steps: number): AdventureCard { return { id, title, text, effect: 'move', steps }; }
function repair(id: string, title: string, text: string, amount: number): AdventureCard { return { id, title, text, effect: 'repair', amount }; }
function start(id: string, title: string, text: string): AdventureCard { return { id, title, text, effect: 'start', amount: 200 }; }
function jail(id: string, title: string, text: string): AdventureCard { return { id, title, text, effect: 'jail' }; }

function makeBoard(world: AdventureDefinition): BoardMap {
  const size = world.large ? 56 : 40;
  const side = size / 4;
  const stationPositions = world.large ? [7, 21, 35, 49] : [5, 15, 25, 35];
  const utilityPositions = world.large ? [16, 39] : [12, 28];
  const taxPositions = world.large ? [5, 54] : [4, 38];
  const countryGroups = [...new Set(world.properties.map(site => site.countryCode))];
  const stateGroups = [...new Set(world.properties.map(site => site.region))];
  let propertyIndex = 0;
  const tiles: Tile[] = Array.from({ length: size }, (_, id) => {
    if (id === 0) return { id, name: world.start, kind: 'start', amount: 200 };
    if (id === side) return { id, name: world.jail, kind: 'jail' };
    if (id === side * 2) return { id, name: world.rest, kind: 'rest' };
    if (id === side * 3) return { id, name: world.goToJail, kind: 'goToJail' };
    if (stationPositions.includes(id)) return { id, ...world.stations[stationPositions.indexOf(id)], kind: 'station', price: 200, rents: [25, 50, 100, 200] };
    if (utilityPositions.includes(id)) return { id, ...world.utilities[utilityPositions.indexOf(id)], kind: 'utility', price: 150 };
    if (world.treasurePositions.includes(id)) return { id, name: 'Treasure', kind: 'treasure' };
    if (world.surprisePositions.includes(id)) return { id, name: 'Surprise', kind: 'surprise' };
    if (taxPositions.includes(id)) return { id, name: world.taxes[taxPositions.indexOf(id)], kind: 'tax', amount: id === taxPositions[0] ? 200 : 100 };
    const index = propertyIndex++;
    let groupIndex = 0;
    if (world.large) groupIndex = Math.floor(index / 3);
    else {
      let boundary = GROUP_SIZES[0];
      while (index >= boundary) boundary += GROUP_SIZES[++groupIndex];
    }
    const economyIndex = world.large ? Math.round(index / 35 * 21) : index;
    const countryIndex = countryGroups.indexOf(world.properties[index].countryCode);
    const countryColor = countryGroups.length <= GROUP_COLORS.length
      ? GROUP_COLORS[countryIndex]
      : `hsl(${Math.round(countryIndex * 360 / countryGroups.length)} 70% 68%)`;
    const stateIndex = stateGroups.indexOf(world.properties[index].region);
    const stateColor = `hsl(${Math.round(stateIndex * 360 / stateGroups.length)} 70% 68%)`;
    return {
      id, ...world.properties[index], kind: 'property',
      group: world.id === 'india' ? `india-state-${world.properties[index].region.toLowerCase().replaceAll(' ', '-')}` : `${world.id}-country-${world.properties[index].countryCode}`,
      color: world.id === 'india' ? stateColor : countryColor,
      price: PRICES[economyIndex], rents: [...RENTS[economyIndex]],
      buildCost: Math.min(200, 50 * (1 + Math.floor(groupIndex / (world.large ? 3 : 2)))),
    };
  });
  if (propertyIndex !== world.properties.length) throw new Error(`${world.name} has an invalid property layout.`);
  for (const group of new Set(tiles.filter(tile => tile.kind === 'property').map(tile => tile.group))) {
    if (tiles.filter(tile => tile.group === group).length < 2) throw new Error(`${world.name} has a one-site monopoly.`);
  }
  const rules = world.id === 'india' ? [
    `${size} spaces · 2–10 players · 36 Indian destinations in ${stateGroups.length} state or union territory property sets.`,
    'Make a monopoly by owning all three property sites of a state before building any houses there. Stations and utilities are separate. The set checklist on each card shows all three required sites.',
    ...world.rules.slice(1),
  ] : [
    `${size} spaces · 2–${world.large ? 10 : 8} players · ${countryGroups.length} country property sets.`,
    'Make a monopoly by owning every property site of a country before building any houses there. Every country set contains at least two sites. Stations and utilities are separate.',
    ...world.rules.slice(1),
  ];
  return {
    id: world.id, version: ['ember', 'neon', 'astral', 'india'].includes(world.id) ? 2 : 1, name: world.name, subtitle: world.subtitle, description: world.description,
    tag: world.tag, theme: world.id, accent: world.accent, background: world.background,
    artwork: `/maps/${world.id}.svg`, size, maxPlayers: world.large ? 10 : 8, tiles,
    rules, treasureCards: world.treasureCards, surpriseCards: world.surpriseCards,
  };
}

const adventures: AdventureDefinition[] = [
  {
    id: 'ember', name: 'Coastal Escape', subtitle: 'Goa to Rio. Follow the coastline.',
    description: 'Sail between famous coastal destinations, from Goa and Kochi to Venice, Sydney, and Rio. Treasure chests and changing tides keep every voyage lively.',
    tag: 'COASTAL ADVENTURE', large: false, accent: '#27d7c4', background: '#071f2a',
    properties: [
      place('Goa', 'in'), place('Kochi', 'in'),
      place('Lisbon', 'pt'), place('Porto', 'pt'), place('Faro', 'pt'),
      place('Marseille', 'fr'), place('Nice', 'fr'), place('Cannes', 'fr'),
      place('Naples', 'it'), place('Venice', 'it'), place('Amalfi', 'it'),
      place('Athens', 'gr'), place('Santorini', 'gr'), place('Mykonos', 'gr'),
      place('Bali', 'id'), place('Jakarta', 'id'), place('Lombok', 'id'),
      place('Sydney', 'au'), place('Gold Coast', 'au'), place('Cairns', 'au'),
      place('Rio de Janeiro', 'br'), place('Salvador', 'br'),
    ],
    stations: [place('Mumbai Ferry', 'in'), place('Venice Ferry', 'it'), place('Sydney Ferry', 'au'), place('Rio Ferry', 'br')],
    utilities: [place('Goa Tidal Power', 'in'), place('Singapore Water', 'sg')], start: 'Set sail', rest: 'Beach Break', jail: 'The Brig', goToJail: 'Caught at sea', taxes: ['Harbor duty', 'Captain’s levy'],
    treasurePositions: [2, 17, 33], surprisePositions: [7, 22, 36],
    rules: ['40 spaces · 2–8 players · Country property sets.', 'Treasure favors the crew: every card grants $50–$200 or returns you to Set sail for $200.', 'Surprises bring tides and trouble: sail forward 3, drift back 3, gain $80, pay $75, repair buildings, or visit the Brig.', 'Harbor duty costs $200; Captain’s levy costs $100. Collect $200 when you pass Set sail.'],
    treasureCards: [
      cash('ember-t1', 'Buried doubloons', 'A weathered map leads to a hidden chest. Collect $150.', 150),
      cash('ember-t2', 'Pearl diver', 'Your crew finds a flawless pearl. Collect $100.', 100),
      cash('ember-t3', 'Captain’s bounty', 'Return a stolen compass and collect a $200 reward.', 200),
      cash('ember-t4', 'Message in a bottle', 'A grateful castaway sends you $75.', 75),
      cash('ember-t5', 'Lucky seashell', 'Trade your curious shell at the harbor. Collect $50.', 50),
      start('ember-t6', 'Homeward current', 'Return to Set sail and collect $200.'),
    ],
    surpriseCards: [
      move('ember-s1', 'Fair winds', 'Sail forward 3 spaces and resolve your destination.', 3),
      move('ember-s2', 'Wrong channel', 'Drift back 3 spaces and resolve your destination.', -3),
      cash('ember-s3', 'Harbor festival', 'Your pop-up stall is a hit. Collect $80.', 80),
      cash('ember-s4', 'Torn sails', 'Pay $75 for a fresh set of sails.', -75),
      repair('ember-s5', 'Storm repairs', 'Pay $20 per house and $100 per landmark you own.', 20),
      jail('ember-s6', 'Navy patrol', 'Go directly to the Brig. Do not collect start money.'),
    ],
  },
  {
    id: 'neon', name: 'Metro Rush', subtitle: 'World cities. After dark.',
    description: 'Build a city empire across Mumbai, Tokyo, London, and New York. Bright skylines hide jackpots, expensive surprises, and fast-moving deals.',
    tag: 'CITY ADVENTURE', large: false, accent: '#ff628e', background: '#231224',
    properties: [
      place('Mumbai', 'in'), place('Delhi', 'in'),
      place('Beijing', 'cn'), place('Shanghai', 'cn'), place('Hong Kong', 'cn'),
      place('Tokyo', 'jp'), place('Osaka', 'jp'), place('Kyoto', 'jp'),
      place('London', 'gb'), place('Manchester', 'gb'), place('Edinburgh', 'gb'),
      place('Paris', 'fr'), place('Lyon', 'fr'), place('Marseille', 'fr'),
      place('Dubai', 'ae'), place('Abu Dhabi', 'ae'), place('Sharjah', 'ae'),
      place('New York', 'us'), place('Las Vegas', 'us'), place('Los Angeles', 'us'),
      place('Sydney', 'au'), place('Melbourne', 'au'),
    ],
    stations: [place('Delhi Metro', 'in'), place('Tokyo Metro', 'jp'), place('London Tube', 'gb'), place('New York Subway', 'us')],
    utilities: [place('Mumbai Power', 'in'), place('Singapore Cooling', 'sg')], start: 'Clock in', rest: 'Rooftop Lounge', jail: 'Security Lockup', goToJail: 'City lockdown', taxes: ['City license', 'Nightlife levy'],
    treasurePositions: [2, 22, 36], surprisePositions: [7, 17, 33],
    rules: ['40 spaces · 2–8 players · Country property sets.', 'Caches contain $75–$250, but one encrypted cache costs $50 to unlock.', 'City surprises can advance you 5 spaces, send you back 3, award $125, cost $125, charge building repairs, or trigger Security Lockup.', 'City license costs $200; Nightlife levy costs $100. Collect $200 when you pass Clock in.'],
    treasureCards: [
      cash('neon-t1', 'Data bounty', 'A recovered drive earns a $250 finder’s fee.', 250),
      cash('neon-t2', 'Arcade jackpot', 'The high score is yours. Collect $150.', 150),
      cash('neon-t3', 'Rare vinyl', 'Sell a collector’s edition for $100.', 100),
      cash('neon-t4', 'Backstage pass', 'Host a secret rooftop set. Collect $75.', 75),
      cash('neon-t5', 'Encrypted cache', 'The cache is empty after the $50 decoding fee. Pay $50.', -50),
      start('neon-t6', 'Express elevator', 'Return to Clock in and collect $200.'),
    ],
    surpriseCards: [
      move('neon-s1', 'Green lights', 'Ride forward 5 spaces and resolve your destination.', 5),
      move('neon-s2', 'Roadblock', 'Head back 3 spaces and resolve your destination.', -3),
      cash('neon-s3', 'Viral opening', 'Your venue is trending. Collect $125.', 125),
      cash('neon-s4', 'Grid overload', 'Pay $125 for emergency power.', -125),
      repair('neon-s5', 'System upgrade', 'Pay $30 per house and $150 per landmark you own.', 30),
      jail('neon-s6', 'Security sweep', 'Go directly to Security Lockup. Do not collect start money.'),
    ],
  },
  {
    id: 'frost', name: 'Alpine Trails', subtitle: 'Himalayan peaks. Northern lights.',
    description: 'Travel from Shimla, Manali, and Leh to the Swiss Alps and snowy Canada. Collect mountain treasures while blizzards and auroras change your route.',
    tag: 'MOUNTAIN ADVENTURE', large: true, accent: '#6cbfff', background: '#102035',
    properties: [
      place('Shimla', 'in'), place('Manali', 'in'), place('Leh', 'in'),
      place('Srinagar', 'in'), place('Gangtok', 'in'), place('Darjeeling', 'in'),
      place('Kathmandu', 'np'), place('Pokhara', 'np'), place('Bhaktapur', 'np'),
      place('Thimphu', 'bt'), place('Paro', 'bt'), place('Punakha', 'bt'),
      place('Zurich', 'ch'), place('Lucerne', 'ch'), place('Zermatt', 'ch'),
      place('Innsbruck', 'at'), place('Salzburg', 'at'), place('Vienna', 'at'),
      place('Chamonix', 'fr'), place('Grenoble', 'fr'), place('Annecy', 'fr'),
      place('Oslo', 'no'), place('Bergen', 'no'), place('Tromsø', 'no'),
      place('Stockholm', 'se'), place('Kiruna', 'se'), place('Abisko', 'se'),
      place('Helsinki', 'fi'), place('Rovaniemi', 'fi'), place('Turku', 'fi'),
      place('Reykjavík', 'is'), place('Akureyri', 'is'), place('Vík', 'is'),
      place('Banff', 'ca'), place('Jasper', 'ca'), place('Whistler', 'ca'),
    ],
    stations: [place('Shimla Railway', 'in'), place('Swiss Railway', 'ch'), place('Oslo Railway', 'no'), place('Canadian Railway', 'ca')],
    utilities: [place('Bhutan Hydropower', 'bt'), place('Iceland Hot Spring', 'is')], start: 'Base Camp', rest: 'Fireside Lodge', jail: 'Rescue Station', goToJail: 'Trail closed', taxes: ['Trail permit', 'Winter provisions'],
    treasurePositions: [2, 18, 30, 45], surprisePositions: [10, 25, 37, 52],
    rules: ['56 spaces · 2–10 players · Country property sets.', 'Mountain treasures grant $75–$225 or guide you home to Base Camp for $200.', 'Surprises move you forward 4 or back 4, award $100, cost $100, charge building repairs, or send you to the Rescue Station.', 'Trail permit costs $200; Winter provisions cost $100. Collect $200 when you pass Base Camp.'],
    treasureCards: [
      cash('frost-t1', 'Summit reward', 'Complete a mountain photography commission. Collect $225.', 225),
      cash('frost-t2', 'Winter crafts', 'Your handmade winter crafts earn $175.', 175),
      cash('frost-t3', 'Hidden hearth', 'A traveler leaves you a $100 gift.', 100),
      cash('frost-t4', 'Lost camera', 'Return a traveler’s camera and collect $150.', 150),
      cash('frost-t5', 'Snow fox’s gift', 'A friendly fox leads you to $75.', 75),
      start('frost-t6', 'Northern passage', 'Return to Base Camp and collect $200.'),
    ],
    surpriseCards: [
      move('frost-s1', 'Aurora trail', 'Follow the lights forward 4 spaces and resolve your destination.', 4),
      move('frost-s2', 'Whiteout', 'Retrace your steps by 4 spaces and resolve your destination.', -4),
      cash('frost-s3', 'Winter fair', 'Your warm cider sells out. Collect $100.', 100),
      cash('frost-s4', 'Supply shortage', 'Buy emergency winter supplies for $100.', -100),
      repair('frost-s5', 'Heavy snowfall', 'Clear your roofs: pay $25 per house and $125 per landmark you own.', 25),
      jail('frost-s6', 'Avalanche warning', 'Go directly to the Rescue Station. Do not collect start money.'),
    ],
  },
  {
    id: 'dunes', name: 'Heritage Route', subtitle: 'Jaipur to Petra. Stories in stone.',
    description: 'Trace famous heritage destinations through India, Egypt, the Mediterranean, and the Silk Road. Find desert treasure and bargain your way through historic cities.',
    tag: 'HERITAGE ADVENTURE', large: true, accent: '#ffb34f', background: '#291b15',
    properties: [
      place('Jaipur', 'in'), place('Jodhpur', 'in'), place('Jaisalmer', 'in'),
      place('Agra', 'in'), place('Delhi', 'in'), place('Ahmedabad', 'in'),
      place('Cairo', 'eg'), place('Giza', 'eg'), place('Luxor', 'eg'),
      place('Aswan', 'eg'), place('Alexandria', 'eg'), place('Abu Simbel', 'eg'),
      place('Marrakesh', 'ma'), place('Fes', 'ma'), place('Casablanca', 'ma'),
      place('Petra', 'jo'), place('Amman', 'jo'), place('Aqaba', 'jo'),
      place('Dubai', 'ae'), place('Abu Dhabi', 'ae'), place('Sharjah', 'ae'),
      place('Muscat', 'om'), place('Nizwa', 'om'), place('Salalah', 'om'),
      place('Istanbul', 'tr'), place('Cappadocia', 'tr'), place('Ephesus', 'tr'),
      place('Athens', 'gr'), place('Delphi', 'gr'), place('Olympia', 'gr'),
      place('Rome', 'it'), place('Florence', 'it'), place('Pompeii', 'it'),
      place('Samarkand', 'uz'), place('Bukhara', 'uz'), place('Khiva', 'uz'),
    ],
    stations: [place('Jaipur Railway', 'in'), place('Cairo Railway', 'eg'), place('Istanbul Railway', 'tr'), place('Rome Railway', 'it')],
    utilities: [place('Dubai Solar Power', 'ae'), place('Muscat Water', 'om')], start: 'Caravan Gate', rest: 'Moonlit Oasis', jail: 'Desert Outpost', goToJail: 'Lost in the dunes', taxes: ['Caravan toll', 'Heritage levy'],
    treasurePositions: [2, 10, 30, 37], surprisePositions: [18, 25, 45, 52],
    rules: ['56 spaces · 2–10 players · Country property sets.', 'Desert treasures award $100–$300 or return you to Caravan Gate for $200. An empty tomb costs $75.', 'Surprises move you forward 6 or back 5, award $150, cost $150, charge building repairs, or send you to the Desert Outpost.', 'Caravan toll costs $200; Heritage levy costs $100. Collect $200 when you pass Caravan Gate.'],
    treasureCards: [
      cash('dunes-t1', 'The golden scarab', 'Discover a rare relic worth $300.', 300),
      cash('dunes-t2', 'Spice windfall', 'Your caravan makes a $200 profit.', 200),
      cash('dunes-t3', 'Hidden coin jar', 'Collect $125 from a buried jar.', 125),
      cash('dunes-t4', 'Oasis pearls', 'Trade freshwater pearls for $100.', 100),
      cash('dunes-t5', 'Empty tomb', 'The expedition finds nothing. Pay the $75 guide fee.', -75),
      start('dunes-t6', 'Royal escort', 'Return to Caravan Gate and collect $200.'),
    ],
    surpriseCards: [
      move('dunes-s1', 'Caravan shortcut', 'Travel forward 6 spaces and resolve your destination.', 6),
      move('dunes-s2', 'Shifting sands', 'Fall back 5 spaces and resolve your destination.', -5),
      cash('dunes-s3', 'Festival of lanterns', 'Your market stall earns $150.', 150),
      cash('dunes-s4', 'Water shortage', 'Pay $150 for emergency water.', -150),
      repair('dunes-s5', 'Sandstorm damage', 'Pay $35 per house and $175 per landmark you own.', 35),
      jail('dunes-s6', 'Lost caravan', 'Go directly to the Desert Outpost. Do not collect start money.'),
    ],
  },
  {
    id: 'astral', name: 'Continental Quest', subtitle: 'Six continents. One world to explore.',
    description: 'Start with Delhi, Mumbai, and Bengaluru, then visit famous cities across six inhabited continents. Collect all sites of a country to unlock its houses.',
    tag: 'WORLD ADVENTURE', large: true, accent: '#a4df5f', background: '#15231d',
    properties: [
      place('Delhi', 'in'), place('Mumbai', 'in'), place('Bengaluru', 'in'),
      place('Tokyo', 'jp'), place('Osaka', 'jp'), place('Kyoto', 'jp'),
      place('London', 'gb'), place('Manchester', 'gb'), place('Edinburgh', 'gb'),
      place('Paris', 'fr'), place('Lyon', 'fr'), place('Marseille', 'fr'),
      place('Cairo', 'eg'), place('Giza', 'eg'), place('Luxor', 'eg'),
      place('Cape Town', 'za'), place('Johannesburg', 'za'), place('Durban', 'za'),
      place('New York', 'us'), place('Los Angeles', 'us'), place('Chicago', 'us'),
      place('Toronto', 'ca'), place('Vancouver', 'ca'), place('Montreal', 'ca'),
      place('Rio de Janeiro', 'br'), place('São Paulo', 'br'), place('Salvador', 'br'),
      place('Buenos Aires', 'ar'), place('Córdoba', 'ar'), place('Mendoza', 'ar'),
      place('Sydney', 'au'), place('Melbourne', 'au'), place('Brisbane', 'au'),
      place('Auckland', 'nz'), place('Wellington', 'nz'), place('Queenstown', 'nz'),
    ],
    stations: [place('Delhi Airport', 'in'), place('London Airport', 'gb'), place('New York Airport', 'us'), place('Sydney Airport', 'au')],
    utilities: [place('Nairobi Power', 'ke'), place('São Paulo Water', 'br')], start: 'Departures', rest: 'Travel Lounge', jail: 'Border Check', goToJail: 'Passport check', taxes: ['Travel permit', 'Arrival duty'],
    treasurePositions: [2, 25, 37, 52], surprisePositions: [10, 18, 30, 45],
    rules: ['56 spaces · 2–10 players · Country sets across six inhabited continents.', 'Travel treasures award $80–$250. An express ticket moves you forward 8 spaces; a return flight takes you to Departures for $200.', 'Surprises move you forward 10 or back 6, award $175, cost $125, charge building repairs, or send you to Border Check.', 'Travel permit costs $200; Arrival duty costs $100. Collect $200 when you pass Departures.'],
    treasureCards: [
      cash('astral-t1', 'Travel competition', 'Your travel photo wins the grand prize. Collect $250.', 250),
      cash('astral-t2', 'Loyalty reward', 'Redeem your travel points for $175.', 175),
      cash('astral-t3', 'City guide', 'Your guidebook earns $125 in royalties.', 125),
      cash('astral-t4', 'Fare refund', 'A price adjustment returns $80 to your wallet.', 80),
      move('astral-t5', 'Express ticket', 'Travel forward 8 spaces and resolve your destination.', 8),
      start('astral-t6', 'Return flight', 'Return to Departures and collect $200.'),
    ],
    surpriseCards: [
      move('astral-s1', 'Direct connection', 'Fly forward 10 spaces and resolve your destination.', 10),
      move('astral-s2', 'Missed connection', 'Travel back 6 spaces and resolve your destination.', -6),
      cash('astral-s3', 'Festival booking', 'Your properties welcome extra visitors. Collect $175.', 175),
      cash('astral-s4', 'Lost luggage', 'Pay $125 for replacement essentials.', -125),
      repair('astral-s5', 'Seasonal upkeep', 'Pay $30 per house and $150 per landmark you own.', 30),
      jail('astral-s6', 'Passport problem', 'Go directly to Border Check. Do not collect start money.'),
    ],
  },
];

adventures.push({
  id: 'india', name: 'Incredible India', subtitle: 'One country. A thousand stories.',
  description: 'A grand journey from Rajasthan’s forts to Kerala’s backwaters, Himalayan towns, and India’s best-known cities. Discover local landmarks, food, and culture through each destination’s symbol.',
  tag: 'INDIA ADVENTURE', large: true, accent: '#ffa758', background: '#172824',
  properties: [
    place('Jaipur', 'in', 'Rajasthan'), place('Jodhpur', 'in', 'Rajasthan'), place('Udaipur', 'in', 'Rajasthan'),
    place('Ahmedabad', 'in', 'Gujarat'), place('Surat', 'in', 'Gujarat'), place('Vadodara', 'in', 'Gujarat'),
    place('Mumbai', 'in', 'Maharashtra'), place('Pune', 'in', 'Maharashtra'), place('Nagpur', 'in', 'Maharashtra'),
    place('Panaji', 'in', 'Goa'), place('Margao', 'in', 'Goa'), place('Vasco da Gama', 'in', 'Goa'),
    place('Bengaluru', 'in', 'Karnataka'), place('Mysuru', 'in', 'Karnataka'), place('Hampi', 'in', 'Karnataka'),
    place('Kochi', 'in', 'Kerala'), place('Munnar', 'in', 'Kerala'), place('Alappuzha', 'in', 'Kerala'),
    place('Chennai', 'in', 'Tamil Nadu'), place('Madurai', 'in', 'Tamil Nadu'), place('Ooty', 'in', 'Tamil Nadu'),
    place('Hyderabad', 'in', 'Telangana'), place('Warangal', 'in', 'Telangana'), place('Nizamabad', 'in', 'Telangana'),
    place('Kolkata', 'in', 'West Bengal'), place('Darjeeling', 'in', 'West Bengal'), place('Digha', 'in', 'West Bengal'),
    place('Bhubaneswar', 'in', 'Odisha'), place('Puri', 'in', 'Odisha'), place('Konark', 'in', 'Odisha'),
    place('Shimla', 'in', 'Himachal Pradesh'), place('Manali', 'in', 'Himachal Pradesh'), place('Dharamshala', 'in', 'Himachal Pradesh'),
    place('Lucknow', 'in', 'Uttar Pradesh'), place('Ayodhya', 'in', 'Uttar Pradesh'), place('Mathura', 'in', 'Uttar Pradesh'),
  ],
  stations: [place('Mumbai Railway', 'in'), place('Chennai Railway', 'in'), place('Kolkata Railway', 'in'), place('Delhi Railway', 'in')],
  utilities: [place('Rajasthan Solar', 'in'), place('Kerala Water', 'in')], start: 'Namaste', rest: 'Chai Break', jail: 'Station Office', goToJail: 'Ticket inspection', taxes: ['Travel tax', 'City levy'],
  treasurePositions: [2, 18, 30, 45], surprisePositions: [10, 25, 37, 52],
  rules: ['56 spaces · 2–10 players · State and union territory property sets.', 'Festival treasures award $75–$250 or return you to Namaste for $200. All money is fictional game currency.', 'Surprises move you forward 5 or back 3, award $125, cost $100, charge building repairs, or send you to the Station Office.', 'Travel tax costs $200; City levy costs $100. Collect $200 when you pass Namaste.'],
  treasureCards: [cash('india-t1', 'Festival market', 'Your festive market is a success. Collect $250.', 250), cash('india-t2', 'Craft fair', 'Your handcrafted souvenirs earn $175.', 175), cash('india-t3', 'Heritage award', 'Your restored courtyard wins a $150 award.', 150), cash('india-t4', 'Cricket celebration', 'The neighborhood celebration brings in $100.', 100), cash('india-t5', 'Chai stall', 'A busy morning earns you $75.', 75), start('india-t6', 'Homecoming express', 'Return to Namaste and collect $200.')],
  surpriseCards: [move('india-s1', 'Express train', 'Travel forward 5 spaces and resolve your destination.', 5), move('india-s2', 'Monsoon detour', 'Travel back 3 spaces and resolve your destination.', -3), cash('india-s3', 'Tourism season', 'Welcome extra visitors. Collect $125.', 125), cash('india-s4', 'Missed train', 'A replacement ticket costs $100.', -100), repair('india-s5', 'Monsoon repairs', 'Pay $25 per house and $125 per landmark you own.', 25), jail('india-s6', 'Ticket mix-up', 'Go directly to the Station Office. Do not collect start money.')],
});

const INDIA_SYMBOLS: Record<string, [string, string]> = {
  Warangal: ['🏰', 'Warangal · historic fort'], Nizamabad: ['🏰', 'Nizamabad · historic fort'],
  Darjeeling: ['🍵', 'Darjeeling · tea gardens'], Digha: ['🏖️', 'Digha · seaside'], Konark: ['☀️', 'Konark · Sun Temple'],
  Dharamshala: ['🏔️', 'Dharamshala · Himalayan views'], Lucknow: ['🏛️', 'Lucknow · Bara Imambara'],
  Ayodhya: ['🛕', 'Ayodhya · temple city'], Mathura: ['🦚', 'Mathura · Krishna heritage'],
  Jaipur: ['🏰', 'Jaipur · royal forts'], Jodhpur: ['🏰', 'Jodhpur · Mehrangarh Fort'], Udaipur: ['🚤', 'Udaipur · lake palaces'],
  Ahmedabad: ['🪁', 'Ahmedabad · kite festival'], Surat: ['💎', 'Surat · diamond city'], Vadodara: ['🏛️', 'Vadodara · Laxmi Vilas Palace'],
  Mumbai: ['🎬', 'Mumbai · Bollywood cinema'], Pune: ['🎓', 'Pune · university city'], Nagpur: ['🍊', 'Nagpur · orange city'],
  Panaji: ['⛪', 'Panaji · historic churches'], Margao: ['🐟', 'Margao · Goan seafood'], 'Vasco da Gama': ['⚓', 'Vasco da Gama · harbor'],
  Bengaluru: ['💻', 'Bengaluru · technology city'], Mysuru: ['👑', 'Mysuru · royal palace'], Hampi: ['🏛️', 'Hampi · ancient monuments'],
  Kochi: ['⛵', 'Kochi · coastal harbor'], Munnar: ['🍃', 'Munnar · tea gardens'], Alappuzha: ['🛶', 'Alappuzha · backwaters'],
  Chennai: ['🎶', 'Chennai · classical music'], Madurai: ['🛕', 'Madurai · Meenakshi Temple'], Ooty: ['🚂', 'Ooty · Nilgiri Mountain Railway'],
  Hyderabad: ['🍛', 'Hyderabad · biryani'], Visakhapatnam: ['🚢', 'Visakhapatnam · port city'], Tirupati: ['🛕', 'Tirupati · temple city'],
  Kolkata: ['🌉', 'Kolkata · Howrah Bridge'], Bhubaneswar: ['🛕', 'Bhubaneswar · temple architecture'], Puri: ['🛞', 'Puri · chariot festival'],
  Guwahati: ['🍵', 'Guwahati · gateway to Assam tea country'], Shillong: ['🎸', 'Shillong · live music'], Gangtok: ['🏔️', 'Gangtok · Himalayan views'],
  Leh: ['🏔️', 'Leh · Ladakh mountains'], Shimla: ['🚂', 'Shimla · mountain railway'], Manali: ['🏔️', 'Manali · mountain adventures'],
  Delhi: ['🏛️', 'Delhi · historic monuments'], Agra: ['🕌', 'Agra · Taj Mahal'], Varanasi: ['🪔', 'Varanasi · riverside lamps'],
  'Mumbai Railway': ['🚆', 'Mumbai Railway'], 'Chennai Railway': ['🚆', 'Chennai Railway'],
  'Kolkata Railway': ['🚆', 'Kolkata Railway'], 'Delhi Railway': ['🚆', 'Delhi Railway'],
  'Rajasthan Solar': ['☀️', 'Rajasthan · solar power'], 'Kerala Water': ['💧', 'Kerala · water utility'],
};

export const MAPS: BoardMap[] = adventures.map(world => {
  const map = makeBoard(world);
  if (map.id === 'india') for (const tile of map.tiles) {
    const symbol = INDIA_SYMBOLS[tile.name];
    if (symbol) [tile.placeIcon, tile.placeIconLabel] = symbol;
  }
  return map;
});
export function getMap(id: string): BoardMap { return MAPS.find(map => map.id === id) ?? MAPS[0]; }
