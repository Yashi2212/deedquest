# Play DeedQuest

Six free adventure maps with real places, private rooms, teams, and optional bots. International boards use country flags; Incredible India uses local landmark, food, and cultural symbols. Small boards allow 8 players; big boards allow 10.

## Try it locally

Using Windows? Follow [VS-CODE.md](VS-CODE.md) for the exact folder and terminal commands.

Install Node.js 22 or 24 and [pnpm](https://pnpm.io/installation). Open a terminal in this folder:

```sh
pnpm install
pnpm dev
```

Open http://localhost:5173. Enter a name and create a room. Click **Add bot player**, then **Start game** to play alone. For friends, copy the invite link. Each human player needs their own device, browser profile, or private window.

To try the India game with two bots: choose **Incredible India**, create your room, click **Add bot player** twice, then **Start game**. Use **Choose emoji & color** on your seat before starting. Games have no round limit; the last player or team standing wins. The bots take turns automatically while your browser remains open. The live game log shows their rolls, purchases, rent, and events.

## Deploy with ads

Follow **[CLOUDFLARE.md](CLOUDFLARE.md)** for Cloudflare Workers + Upstash, the recommended route for the ad-supported version. See [HOSTING-ADS.md](HOSTING-ADS.md) for earnings examples and setup.

## Vercel playtest

Follow **[VERCEL-PLAYTEST.md](VERCEL-PLAYTEST.md)** for the full GitHub, Upstash, environment-variable, deployment, and tester checklist.

Vercel Hobby is for personal, noncommercial use. A free beta intended to become a paid product is not automatically eligible. Use an eligible plan or confirm eligibility with Vercel; see [their policy](https://vercel.com/docs/limits/fair-use-guidelines). Keep `VITE_AD_MODE=off` for feedback testing.

Deploy the complete source, including `api` and `server`, with the two server-only Upstash REST variables. Uploading only `dist` does not deploy multiplayer. Hosting quotas still apply.

For running inside Discord rather than sharing a web link, see [DISCORD.md](DISCORD.md). The current build needs a Discord integration first.

## During the game

- Press **R** or **Space** to roll when it is your turn. Shortcuts stay inactive in chat inputs and dialogs.
- International boards: collect all property sites in a country to unlock houses. India: collect all three sites of a state (for example Lucknow, Ayodhya, and Mathura). No map allows houses from owning just one site. Open **View details** for the exact checklist.
- Create trades at any time, even on another player’s turn. A numbered Trades badge shows new offers; offers for you are highlighted. Click **View trade** to Accept, Decline, or Negotiate. Counteroffers and their changes stay in the same trade.
- Sell an unimproved, unmortgaged site to the bank for half price through its details. You give up ownership. Mortgages instead let you keep the deed.
- Tax payments go to the vacation jackpot; landing there collects the pot.
- The log shows newest events first. Scroll back to read; **Latest ↑** returns to live updates.

- Rules sits beside the invite. New seats are locked once the game starts.
- Use the remove-player icon to vote: everyone else must agree, across teams.
