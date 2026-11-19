# DeedQuest

A private property-trading game with an original charcoal, teal, and copper interface. All maps and gameplay features are included. No coin store, accounts, or paid game unlocks.

## Maps

| Adventure | Board | Players | Destinations |
| --- | --- | --- | --- |
| Coastal Escape | 40 spaces | 2–8 | Goa, Kochi, Venice, Sydney, Rio, and other coastal places |
| Metro Rush | 40 spaces | 2–8 | Mumbai, Delhi, Tokyo, London, New York, and major cities |
| Alpine Trails | 56 spaces | 2–10 | Shimla, Manali, Leh, Swiss towns, Nordic destinations, and Canada |
| Heritage Route | 56 spaces | 2–10 | Jaipur, Agra, Cairo, Petra, Rome, and historic destinations |
| Continental Quest | 56 spaces | 2–10 | Six cities per inhabited continent; building sets follow countries |
| Incredible India | 56 spaces | 2–10 | 36 Indian destinations; 12 state monopolies of three sites each |

International boards display each site's country flag, including Indian destinations. The India board uses local landmark, food, and cultural symbols instead of repeated flags: Mumbai's cinema, Nagpur's oranges, Hyderabad's biryani, and more. Hover a symbol for its meaning, or open a property's details to see its state or territory. Flags are bundled locally; their MIT license and source credit are in `public/flags`.

The maps have separate treasure and surprise decks, with distinct cash awards, fees, movement, repairs, and jail events. The in-game **Rules** button lists every possible card and the active room settings. The fictional currency is shown with `$` consistently across all maps; it is not real money or a currency conversion.

## Features

- Private rooms with an eight-character code and shareable invitation link.
- Optional bots: the host can fill empty seats with **Add bot player**, including a solo human versus bots. Bots use normal game actions to buy, bid, build, manage debt, and answer trade offers.
- 2–5 teams on big maps; up to 4 on small maps. Team assets are shared, while each member keeps personal cash.
- General chat plus server-filtered team-only chat. Rival browsers do not receive private team messages.
- Every player’s money and site count stays visible in the sidebar. Assets, chat, and trades use compact tabs. One game log sits at the bottom, newest first; it follows new events only while you are at the top and preserves your position while you read older entries.
- Choose an emoji and unique player color in the lobby. Larger tokens, a YOU marker, Find me, and colored property borders with owner initials make positions and ownership clear. Press R or Space to roll on your turn; shortcuts pause while typing or viewing a dialog. Dice and payment decisions live in the board center; the destination bar opens detailed site information.
- Auctions, houses/hotels, mortgages, jail, doubles, utilities, transport sites, bankruptcy, automatic saving, reconnect, and rematches.
- Unlimited games: the last solvent player or team wins. Configure auctions, double set rent, prison rent, mortgages, even building, and random turn order. Tax jackpots are always enabled.

## Local setup

For step-by-step Windows instructions, see [Run in VS Code](VS-CODE.md).

Install Node.js 22 or 24 and pnpm, then run in this folder:

```sh
pnpm install
pnpm dev
```

Open http://localhost:5173. No database account is required locally: rooms are saved in the ignored `.local-data` directory. To test another human, use a different browser/profile or private window. Normal tabs share the same saved player identity.

For devices on your home Wi-Fi, `pnpm dev` listens on the network. Open your computer's LAN address on those devices and allow the development server through the firewall if required. A localhost invite points to the receiving device; use your LAN address or your deployed Vercel URL when inviting other devices.

For Discord Activity testing, public discovery, and the future paid-model plan, see [DISCORD.md](DISCORD.md). The Discord integration is not implemented in this release.

## Ad-supported deployment

Use **Cloudflare Workers + static assets + Upstash Free** for a small ad-supported launch. Follow [CLOUDFLARE.md](CLOUDFLARE.md). See [HOSTING-ADS.md](HOSTING-ADS.md) for the optional homepage ad slot, consent setup and illustrative earnings. Ads default to off and do not appear inside rooms.

## Vercel playtest

Follow [VERCEL-PLAYTEST.md](VERCEL-PLAYTEST.md) for the complete setup and post-deployment checks. Hobby is limited to personal, noncommercial use; a free beta for a planned paid product is not automatically eligible. Use Pro or confirm that your use qualifies with Vercel. See [Vercel's policy](https://vercel.com/docs/limits/fair-use-guidelines). Keep ads off during feedback testing.

1. Create an **Upstash Redis Free** database at https://console.upstash.com/redis. A standalone free database is sufficient.
2. Put this complete project in a Git repository and import it at https://vercel.com/new using a plan eligible for your intended use.
3. Set the root directory to the folder containing this `package.json`, `api`, and `vercel.json`. Framework: Vite. Build: `pnpm build`. Output: `dist`. Node: 22.x or 24.x. Let Vercel choose its install command from the pnpm lockfile.
4. Add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in Vercel. Use a REST token with write access. Both are server-only: never prefix them with `VITE_`.
5. Deploy, then open the deployed URL. Create a room and share its invitation. Redeploy whenever you add or change environment variables.

Vercel's functions need shared persistence between requests; production therefore requires Redis. The application deliberately does not fall back to process memory or local files on Vercel. Uploading only `dist` cannot run multiplayer.

No paid bot API, WebSocket server, cron job, or AI service is required. Bots are rule-based and run inside the same API function. Open player browsers request bot ticks, and the server chooses and validates each bot move. Bots pause when no human browser is open; reopening the room resumes play. Browser background timer throttling may slow bots.

### Free plan limits

At verification, [Upstash Free](https://upstash.com/pricing/redis) includes 500,000 commands/month, 256 MB storage, and 10 GB bandwidth. [Vercel Hobby](https://vercel.com/docs/plans/hobby) includes 1 million function invocations/month for personal use. Keep both services on their free plans and check their current usage limits; this is not unlimited hosting.

Visible tabs poll every 2 seconds; hidden tabs poll every 12 seconds. Ten visible players make approximately 18,000 room-read requests per hour, plus writes, rate-limit commands, and bot ticks. Bot-heavy games add traffic. Rooms expire after 72 hours without a change. Close tabs after a game. No app code upgrades a plan or purchases extra capacity.

To test against your own Redis locally, copy `.env.example` to `.env.local`, fill both values, and restart the development server. Keep this file private.

For a traffic estimate and what a 3,000-player launch would require, see [CAPACITY.md](CAPACITY.md).

## Rules that matter

- Collect $200 on passing or landing on Start. Starting cash can be $1,000, $1,500, or $2,000.
- Buy an unowned property or decline. When auctions are enabled, everyone still active may bid. Passing withdraws from that auction. The highest remaining bidder pays once.
- Own all property sites in one country, alone or with teammates. India has 12 state sets of exactly three properties: for example Lucknow, Ayodhya, and Mathura form Uttar Pradesh. Hyderabad requires Warangal and Nizamabad to complete Telangana. Every international country set contains at least two properties. Owning a single site never unlocks houses. Stations and utilities are excluded. Each property’s details list the required sites and any missing ones. Build up to four houses and then a hotel. Even building is the default; selling buildings returns half their cost. There is no physical limit on the supply of houses/hotels.
- Teammates never pay one another rent. Any active teammate can manage shared properties on their turn. The acting player pays build costs and receives sales/mortgage proceeds. Rent goes to the property's named holder. Combined stations and utilities determine their team's rent multipliers.
- Mortgage an unimproved property for 50% of its price. Its property set must have no buildings. Repay the mortgage plus 10%, rounded up, to restore rent. Mortgaged properties collect no rent.
- Sell an unmortgaged site back to the bank for half its printed purchase price during your turn or while settling your debt. First sell all buildings in its set. You lose ownership; the site becomes available to buy again.
- Create and respond to trades any time during an active game, independent of turns, including auctions and debts. Standing bids and cash already needed toward a debt remain protected. Multiple offers can remain pending. The Trades badge counts unseen open offers from other players, including offers between other players; viewing the open-offers panel clears it. A new counteroffer raises the badge again. Offers addressed to you are highlighted. Everyone sees the offers; only the recipient may accept, decline, or negotiate, and the current sender may withdraw. Open **View trade** for a readable two-column comparison. Negotiation keeps the same trade ID, records each version, highlights changed cash and properties, and switches who must approve. Old terms cannot be accepted after a counteroffer. Trades revalidate cash and ownership on acceptance. Conflicting or unavailable offers expire. Built-up sets cannot be traded.
- If you cannot pay, sell buildings or mortgage assets; the bill settles when you raise enough. Choose **Declare bankruptcy** in the board center if you cannot pay; this remains available when mortgages are disabled. You can also retire from the sidebar. A surviving teammate inherits your cash, buildings, mortgages, and properties **before any opposing creditor**. The first surviving teammate in turn order inherits. With no teammate, assets go to the creditor or bank.
- Doubles grant another roll, except on leaving jail. Three doubles in a row send you to jail. Pay $50 before rolling or try doubles. After three failed jail rolls, the game liquidates assets if necessary for bail, then moves; insolvency causes bankruptcy.
- Paid tax-space fees enter the jackpot displayed on the vacation tile. The next visitor collects the entire jackpot, which resets to zero. Bail, repairs, purchases, rent, and mortgage repayments do not feed it. Unpaid taxes enter only when settled. Event repairs charge the acting player's shared team buildings in team mode.
- The final active player or team wins. There is no round limit or score-based ending. Old saved games also ignore their former round limits.
- After three idle minutes, another active player can continue a stalled turn. Auctions settle at their highest bid and debts are liquidated as needed. This supports disconnected friends.
- To remove someone during play, use the remove-player icon. Every other authenticated human must agree, across teams; bots do not vote. Votes can be withdrawn and reset when membership changes. Removal revokes access and follows bankruptcy inheritance rules.
- The same browser can reconnect while its saved session remains. A room code is an invitation, not a recovery token. Clearing browser storage loses the player identity. Closing a tab keeps the seat; Leave and Retire give it up. New players can join only in the lobby. After a finished match, the host can reopen the lobby for a rematch.

## Verification and development

```sh
pnpm test
pnpm check
pnpm build
# With pnpm dev running:
node scripts/live-smoke.mjs
node --import tsx scripts/india-bots-smoke.mjs
```

`pnpm preview` serves the built static frontend only. Use `pnpm dev` or a complete Cloudflare/Vercel deployment for multiplayer.

The rules engine, bots, room membership, private chat, retry receipts, race handling, and geography/assets have automated tests. The HTTP smoke script tests ten concurrent human sessions, private team chat, authenticated state, idempotent rolls, and bot ticks on localhost. See [QA.md](QA.md) for this package's verification results.

- `src/game/maps.ts`: destinations, country metadata, map cards, and economy.
- `src/game/engine.ts`: pure validated game transitions.
- `src/App.tsx`, `src/GameView.tsx`, `src/panels.tsx`, `src/components.tsx`, `src/dark.css`, `src/arena.css`: interface.
- `server/bots.ts`: bot decision policy.
- `server/service.ts`: authentication, rooms, chat filtering, and bot execution.
- `server/store.ts`: atomic Redis compare-and-swap; local file store for development.
- `api/room.ts`: Vercel function entry point.
- `worker/index.ts`, `wrangler.jsonc`: Cloudflare API and asset routing.
- `src/Advertising.tsx`: optional homepage sponsor or manual ad.
- `scripts/generate-art.mjs`: regenerate the six original SVG map illustrations.
- `scripts/fetch-flags.py`: optional maintenance script to refresh bundled MIT flag assets.

Client requests contain actions, never trusted game state. The server generates dice and validates ownership, money, and turn order. Per-player request receipts prevent applying a retried move twice. Room responses exclude authentication tokens and private storage fields.

Fonts load from Google Fonts with local system fallbacks. All maps, country flags, and gameplay assets are bundled. This is an original game, not an official Hasbro or Richup product.

### Troubleshooting

- **Room service is not configured:** add both Redis environment variables, then redeploy.
- **Another player takes my identity:** use separate browser profiles/devices; ordinary tabs share local storage.
- **Bot not moving:** keep a human player's game tab open; bots may be waiting for your auction bid/pass or trade response.
- **Map change rejected:** the smaller map cannot hold the current roster. Remove lobby bots/players before reducing the seat limit.
- **Older room expired after updating:** create a new room for the current board version. Older India, Coastal Escape, Metro Rush, and Continental Quest matches cannot resume after the monopoly correction because destinations changed. Existing assets are not silently relabelled.

## GitHub repository

https://github.com/Yashi2212/deedquest

This game requires its room API and persistence. GitHub Pages alone cannot run multiplayer or bot games. Use the included Cloudflare or Vercel deployment guides for a working online game.
