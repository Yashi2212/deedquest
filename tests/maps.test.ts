import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { MAPS, getMap, getPropertySetName } from '../src/game/maps.js';
import { applyGameAction, canBuild, createGame } from '../src/game/engine.js';
import { DEFAULT_SETTINGS, type Player } from '../src/game/types.js';

test('every purchasable destination has a bundled country flag and every map includes India', () => {
  for (const map of MAPS) {
    const sites = map.tiles.filter(tile => tile.price);
    assert.ok(sites.length > 20);
    assert.ok(map.tiles.some(tile => tile.kind === 'property' && tile.countryCode === 'in'), map.name);
    for (const tile of sites) {
      assert.match(tile.countryCode || '', /^[a-z]{2}$/);
      assert.ok(tile.countryName && tile.region, tile.name);
      const flag = new URL(`../public/flags/${tile.countryCode}.svg`, import.meta.url);
      assert.ok(existsSync(flag), `Flag missing for ${tile.name}`);
      assert.match(readFileSync(flag, 'utf8'), /<svg/);
    }
    assert.ok(existsSync(new URL(`../public${map.artwork}`, import.meta.url)), `Artwork missing for ${map.name}`);
  }
});

test('India is a ten-player 56-space board with 36 Indian properties', () => {
  const map = getMap('india');
  assert.equal(map.id, 'india');
  assert.equal(map.maxPlayers, 10);
  assert.equal(map.size, 56);
  const sites = map.tiles.filter(tile => tile.price);
  assert.ok(sites.every(tile => tile.countryCode === 'in' && tile.countryName === 'India'));
  assert.equal(sites.filter(tile => tile.kind === 'property').length, 36);
  assert.equal(new Set(sites.filter(tile => tile.group).map(tile => tile.group)).size, 12);
  assert.ok(sites.every(tile => tile.placeIcon && tile.placeIconLabel), 'Every Indian site needs a local symbol and accessible description');
  assert.ok(MAPS.filter(board => board.id !== 'india').every(board => board.tiles.every(tile => !tile.placeIcon)), 'International boards retain country flags');
});

test('Continental Quest visits six cities in each inhabited continent while grouping houses by country', () => {
  const map = getMap('astral');
  const continents = map.tiles.filter(tile => tile.kind === 'property').map(tile => tile.region!);
  assert.deepEqual([...new Set(continents)].sort(), ['Africa', 'Asia', 'Europe', 'North America', 'Oceania', 'South America']);
  for (const name of new Set(continents)) assert.equal(continents.filter(continent => continent === name).length, 6);
});

test('international country sets include every property from that country and exclude stations and utilities', () => {
  for (const map of MAPS.filter(map => map.id !== 'india')) {
    const properties = map.tiles.filter(tile => tile.kind === 'property');
    for (const tile of properties) {
      assert.deepEqual(properties.filter(site => site.group === tile.group).map(site => site.id), properties.filter(site => site.countryCode === tile.countryCode).map(site => site.id), `${map.name}: ${tile.name}`);
      assert.equal(getPropertySetName(tile), tile.countryName);
      assert.ok(properties.filter(site => site.group === tile.group).every(site => site.color === tile.color));
    }
    assert.ok(map.tiles.filter(tile => tile.kind === 'station' || tile.kind === 'utility').every(tile => !tile.group));
    const setCount = new Set(properties.map(tile => tile.group)).size;
    assert.match(map.rules[0], new RegExp(`${setCount} country property sets`));
  }
});

test('Alpine Trails requires all six Indian property sites to build, with no railway requirement', () => {
  const players: Player[] = [
    { id: 'p0', name: 'Player', color: '#123456', tokenIndex: 0, team: 0, ready: true },
    { id: 'p1', name: 'Other', color: '#abcdef', tokenIndex: 1, team: 1, ready: true },
  ];
  const game = createGame(players, { ...DEFAULT_SETTINGS, mapId: 'frost' });
  const india = getMap('frost').tiles.filter(tile => tile.kind === 'property' && tile.countryCode === 'in');
  assert.equal(india.length, 6);
  for (const tile of india.slice(0, -1)) game.properties[tile.id].ownerId = 'p0';
  assert.equal(canBuild(game, 'p0', india[0].id), false);
  game.properties[india.at(-1)!.id].ownerId = 'p0';
  assert.equal(canBuild(game, 'p0', india[0].id), true);
  const railway = getMap('frost').tiles.find(tile => tile.kind === 'station' && tile.countryCode === 'in')!;
  assert.equal(game.properties[railway.id].ownerId, null);
});

test('India property cards group all and only sites from the same state or union territory', () => {
  const properties = getMap('india').tiles.filter(tile => tile.kind === 'property');
  const names = new Set(properties.map(getPropertySetName));
  assert.equal(names.size, 12);
  assert.equal(new Set(properties.map(tile => tile.name)).size, 36, 'No duplicate city names');
  for (const tile of properties) {
    assert.equal(getPropertySetName(tile), tile.region);
    const stateSites = properties.filter(site => site.region === tile.region);
    assert.equal(stateSites.length, 3, `${tile.region} must require three sites`);
    assert.deepEqual(properties.filter(site => site.group === tile.group).map(site => site.id), stateSites.map(site => site.id), tile.name);
    assert.ok(stateSites.every(site => site.color === tile.color), tile.region);
  }
  assert.equal(new Set(properties.map(tile => tile.color)).size, names.size);
  assert.ok(getMap('india').tiles.filter(tile => tile.kind === 'station' || tile.kind === 'utility').every(tile => !tile.group));
  assert.match(getMap('india').rules[0], /12 state or union territory property sets/);
  assert.equal(getPropertySetName(properties.find(tile => tile.name === 'Jaipur')!), 'Rajasthan');
  assert.equal(getPropertySetName(properties.find(tile => tile.name === 'Lucknow')!), 'Uttar Pradesh');
});

test('India houses require all three sites of every state and deduct the build cost', () => {
  const players: Player[] = [
    { id: 'p0', name: 'Player', color: '#123456', tokenIndex: 0, team: 0, ready: true },
    { id: 'p1', name: 'Other', color: '#abcdef', tokenIndex: 1, team: 1, ready: true },
  ];
  const properties = getMap('india').tiles.filter(tile => tile.kind === 'property');
  for (const region of new Set(properties.map(tile => tile.region))) {
    const stateSites = properties.filter(tile => tile.region === region);
    let game = createGame(players, { ...DEFAULT_SETTINGS, mapId: 'india', randomOrder: false });
    for (const tile of stateSites.slice(0, -1)) game.properties[tile.id].ownerId = 'p0';
    assert.equal(canBuild(game, 'p0', stateSites[0].id), false, `${region} cannot build before its full set is owned`);
    game.properties[stateSites.at(-1)!.id].ownerId = 'p0';
    for (const tile of stateSites) assert.equal(canBuild(game, 'p0', tile.id), true, `${region}: ${tile.name} can build`);
    const cash = game.players[0].cash;
    game = applyGameAction(game, 'p0', { type: 'build', tileId: stateSites[0].id });
    assert.equal(game.properties[stateSites[0].id].level, 1);
    assert.equal(game.players[0].cash, cash - stateSites[0].buildCost!);
  }
});

test('India uses the requested Uttar Pradesh trio and real state boundaries', () => {
  const properties = getMap('india').tiles.filter(tile => tile.kind === 'property');
  const stateNames = (name: string) => {
    const tile = properties.find(site => site.name === name)!;
    return properties.filter(site => site.group === tile.group).map(site => site.name);
  };
  assert.deepEqual(stateNames('Shimla'), ['Shimla', 'Manali', 'Dharamshala']);
  assert.deepEqual(stateNames('Lucknow'), ['Lucknow', 'Ayodhya', 'Mathura']);
  assert.deepEqual(stateNames('Hyderabad'), ['Hyderabad', 'Warangal', 'Nizamabad']);
});

test('every map rejects building on a lone site or incomplete monopoly, then permits the complete set', () => {
  const players: Player[] = [
    { id: 'p0', name: 'Player', color: '#123456', tokenIndex: 0, team: 0, ready: true },
    { id: 'p1', name: 'Other', color: '#abcdef', tokenIndex: 1, team: 1, ready: true },
  ];
  for (const map of MAPS) {
    const properties = map.tiles.filter(tile => tile.kind === 'property');
    for (const group of new Set(properties.map(tile => tile.group))) {
      const sites = properties.filter(tile => tile.group === group);
      assert.ok(sites.length >= 2, `${map.name}: ${group} must require multiple properties`);
      let game = createGame(players, { ...DEFAULT_SETTINGS, mapId: map.id });
      game.properties[sites[0].id].ownerId = 'p0';
      assert.equal(canBuild(game, 'p0', sites[0].id), false);
      assert.throws(() => applyGameAction(game, 'p0', { type: 'build', tileId: sites[0].id }));
      for (const tile of sites.slice(0, -1)) game.properties[tile.id].ownerId = 'p0';
      game.properties[sites.at(-1)!.id].ownerId = 'p1';
      assert.equal(canBuild(game, 'p0', sites[0].id), false, 'A rival owning the last site blocks houses');
      game.properties[sites.at(-1)!.id].ownerId = 'p0';
      assert.equal(canBuild(game, 'p0', sites[0].id), true);
      game = applyGameAction(game, 'p0', { type: 'build', tileId: sites[0].id });
      assert.equal(game.properties[sites[0].id].level, 1);
    }
  }
});
