# Deploy DeedQuest on Cloudflare

Use Cloudflare Workers with static assets plus Upstash Redis Free for a small ad-supported launch. Both the Worker API and frontend are included; uploading only dist to a static host cannot run multiplayer.

## Setup in VS Code

Open the deedquest folder inside New folder. Install Node.js 22 or 24. In its PowerShell terminal:

```powershell
npm.cmd install --global pnpm@10.34.6
pnpm.cmd install --frozen-lockfile
pnpm.cmd test
pnpm.cmd cloudflare:check
```

The last command builds and checks the Worker without publishing. For local play, run `pnpm.cmd dev` and open http://localhost:5173. No database account is needed locally.

## Publish

1. Create a Free Redis database at [Upstash](https://console.upstash.com/redis). Keep its REST URL and write-enabled REST token private.
2. Create a Cloudflare account and leave Workers on Free.
3. Run the following commands in the game folder:

```powershell
pnpm.cmd exec wrangler login
pnpm.cmd cloudflare:deploy
pnpm.cmd exec wrangler secret put UPSTASH_REDIS_REST_URL
pnpm.cmd exec wrangler secret put UPSTASH_REDIS_REST_TOKEN
```

Complete the login in your browser. Each secret command prompts for its value: paste there, not in source code or a shell command. The first deployment creates the Worker and prints its HTTPS address. Rooms intentionally report missing configuration until both secrets are present. The secret commands publish those settings without exposing them to the frontend.

Open the printed address. Create a room, add two bots, start, refresh and reconnect. Test a friend on a separate browser/device. New people must be rejected after the game starts. Watch usage in both provider dashboards.

For updates, run `pnpm.cmd cloudflare:deploy` again. Change the name in wrangler.jsonc if deedquest conflicts with another Worker in your account. Keep `/api/*` routed to the Worker. The frontend uses free static asset serving.

For automated Git deployments, use Workers Builds with this folder as root, `pnpm build` as Build command and `pnpm exec wrangler deploy` as Deploy command. Use Workers, not a static-only Pages upload.

## Advertising

See [HOSTING-ADS.md](HOSTING-ADS.md). Ads default to off. Public VITE_ settings must exist during the build: put them in your ignored .env.local for CLI deployment, or the hosting build variables. Worker runtime secrets cannot change an already-built frontend. Never prefix Redis secrets with VITE_.

Set your actual public contact email and review the About/Privacy text before a public launch. A workers.dev address is free for testing; Cloudflare recommends a custom domain for production. Domain registration costs separately, and AdSense approval is not guaranteed.

## Limits and verification

Checked October 5, 2026: [Workers Free](https://developers.cloudflare.com/workers/platform/pricing/) has 100,000 dynamic requests/day and 10ms CPU/request. Ordinary static asset requests are free and unlimited. [Upstash Free](https://upstash.com/pricing/redis) includes 500,000 commands/month, 256MB storage and 10GB bandwidth.

Ten visible players generate about 18,000 room reads/hour, plus moves, bot requests and database rate limits. This is a small-game starting setup, not unlimited multiplayer. Long-game CPU use on a live Free Worker has not been measured. See [CAPACITY.md](CAPACITY.md).

TypeScript, automated tests, the production bundle and Cloudflare dry run pass. The actual local Worker served static pages and returned the correct API errors when secrets were absent. No account, live database or online deployment was created by the assistant.

To debug the Worker locally, copy .dev.vars.example to .dev.vars, enter a test Redis database, and run `pnpm.cmd cloudflare:dev` (usually port 8787). Without those secrets the homepage still works but rooms return 503. Keep .env.local, .dev.vars and .local-data private.
