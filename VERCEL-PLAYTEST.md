# Deploy the DeedQuest playtest on Vercel

Checked against the project and official documentation on 7 October 2026. These instructions deploy the existing web game. Discord integration and paid accounts are future work.

## First, choose an eligible hosting plan

Vercel Hobby is limited to personal, noncommercial use. Its definition of commercial use includes deployments intended for financial gain, as well as advertising and payment features. A free beta for a planned business is not automatically eligible just because it has no revenue yet. For your proposed paid game, use Pro or get Vercel's confirmation that the particular beta qualifies for Hobby. See [Vercel's policy](https://vercel.com/docs/limits/fair-use-guidelines).

The deployment settings below work on an eligible Vercel plan. If spending zero is essential, the project also has a [Cloudflare deployment guide](CLOUDFLARE.md). Keep ads off during the feedback beta.

## 1. Open the correct project

The game is here, separate from Birthday:

`C:/Users/abhis/OneDrive/Documents/ChatGPT/New folder/deedquest`

Open that folder in VS Code. Its top level contains `package.json`, `vercel.json`, `api`, `server`, `src`, and `public`.

For a clean upload, `../deedquest-deploy.zip` contains the complete source without your local rooms, installed dependencies, or secrets. Extract it into a separate location and open the extracted `deedquest` folder. Do not upload the zip as the repository's only file.

Optional local check, in VS Code's PowerShell terminal:

```powershell
npm.cmd install --global pnpm@10.34.6
pnpm.cmd install --frozen-lockfile
pnpm.cmd test
pnpm.cmd build
```

Install Node.js 22 or 24 first if needed. See [VS-CODE.md](VS-CODE.md) for local play.

## 2. Put the full source on GitHub

In VS Code's Source Control panel, initialize a repository in the game folder if one does not already exist. Review the file list, commit the source, then use Publish to GitHub and choose a private repository. Sign in when prompted; Git must be installed for this workflow.

Include `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `api`, `server`, the frontend, assets, and configuration. The included `.gitignore` excludes local secrets and generated files. Confirm `.env.local`, `.dev.vars`, `.local-data`, and `node_modules` are absent before committing. `.env.example` and `.dev.vars.example` are safe templates.

Do not initialize or publish the unrelated Birthday project. Do not publish just `dist`: that omits the multiplayer backend.

## 3. Create the shared database

1. Open the [Upstash Redis console](https://console.upstash.com/redis), sign up, and create a database on its **Free** plan.
2. Choose a region close to your Vercel function region where practical.
3. In the database's REST API details, find its HTTPS REST URL and its normal read/write REST token. The read-only token cannot create rooms or save moves.
4. Keep these values for Vercel's environment settings. They do not belong in GitHub or browser code.

The database stores rooms between serverless requests. Local development's file storage cannot replace it on Vercel. [Upstash Free](https://upstash.com/pricing/redis) currently includes 500,000 commands/month, 256 MB storage, and 10 GB bandwidth. Keep the database on Free; optional paid plans have different billing.

## 4. Import into Vercel

Open [New Project](https://vercel.com/new), connect GitHub, and import the game repository into the eligible plan selected above. Set:

| Setting | Value |
| --- | --- |
| Framework preset | Vite |
| Root directory | The directory containing `package.json` and `api` |
| Build command | `pnpm build` |
| Output directory | `dist` |
| Install command | Leave automatic; the project supplies a pnpm lockfile |
| Node.js version | 22.x or 24.x |

If GitHub shows `package.json` immediately, use the repository root. If it shows a containing `deedquest` folder, use `deedquest` as Root Directory. The existing `vercel.json` configures the build and room function; no separate backend service is needed. See [Vercel's Git import workflow](https://vercel.com/docs/git).

## 5. Add environment variables before Deploy

Under Environment Variables, add the following for **Production**:

| Name | Value | Visibility |
| --- | --- | --- |
| `UPSTASH_REDIS_REST_URL` | Your Upstash HTTPS REST URL | Server only |
| `UPSTASH_REDIS_REST_TOKEN` | Your read/write REST token | Secret, server only |
| `VITE_AD_MODE` | `off` | Public build setting |
| `VITE_CONTACT_EMAIL` | Optional public feedback/contact email | Public build setting |

Never add `VITE_` to either Redis variable. Leave AdSense and sponsor variables empty for this beta. The ad setting controls the current homepage placement; there are no ads in game rooms.

Preview deployments also need database variables if you want multiplayer there. Prefer a separate test database for preview code; using the same database shares room state between deployments. Production-only credentials are sufficient for the first launch.

Click **Deploy**. Environment changes require a new deployment. If the dashboard exposes Node version only after project creation, set it in project settings and redeploy if needed.

## 6. Test the deployed game before sharing widely

Open the stable production address such as `https://your-project.vercel.app`. You do not need a custom domain for this beta.

1. Create an Incredible India room and add two bots. Start and play several turns.
2. Create a separate room. Invite a friend before starting, or join from a second browser profile/device. Check that rolls, money and the game log update for both players.
3. Send a trade outside your turn. On the recipient's device, view it, negotiate it, and check the same trade's history. Test chat too.
4. Refresh the original browser and check that it reconnects to its existing seat. Keep its browser storage; there are no permanent player accounts yet.
5. After starting, try the invite from a third fresh profile. A new player should be unable to join; an existing player should still reconnect.
6. Test the production address while signed out of Vercel. If it requires Vercel login, check Deployment Protection and the intended audience in project settings; a protected preview URL is not a public game invitation.

These are checks for you to run after deployment; no live Vercel deployment has been made or verified from this guide.

## 7. Invite testers and collect useful feedback

Share the production homepage so people can create their own rooms. Share a room's Invite link for one particular game. Everyone must join that room before it starts. Anyone with the link can join its lobby until it starts or fills; private here means unlisted, not password-protected.

Start with a few rooms. Ask testers for the map, device/browser, room code, what they tried, what happened, and a screenshot when reporting a bug. Do not ask for their browser tokens. Keep one feedback channel or form so reports are easy to track.

Push later source changes to the production branch to deploy updates. Avoid changing board layouts during active sessions; old rooms may need a fresh game after incompatible updates.

## Usage and troubleshooting

This is a bounded playtest, not a validated 3,000-concurrent-player service. The frontend polls room state every two seconds while visible. Ten visible players generate about 18,000 read requests per hour, before moves, bots, and database overhead. Watch Vercel and Upstash dashboards and close idle tabs. Bots are rule-based, need no paid AI, and pause when no human browser is polling.

| Symptom | First thing to check |
| --- | --- |
| Build cannot find package.json | Wrong Root Directory |
| pnpm install fails | Lockfile included; Node 22/24; inspect the first build-log error |
| Homepage works, room API is 404 | Full source and `api/room.ts` must be deployed, not only `dist` |
| Room service unavailable / 503 | Production REST variables, correct write token, database availability/quota; redeploy after edits |
| Friends see different or missing rooms | Use the same production hostname and database |
| Both tabs show the same player | Use separate browser profiles/devices; ordinary tabs share identity |
| Bots stop when everyone leaves | Expected: bots resume when a human reopens the room |

The code has local automated checks and deployment configuration; only testing the deployed service with your database verifies your actual hosting setup. See [CAPACITY.md](CAPACITY.md) for scaling, [DISCORD.md](DISCORD.md) for Activities, and [HOSTING-ADS.md](HOSTING-ADS.md) for a later ad-supported release.
