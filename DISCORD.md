# DeedQuest as a Discord Activity

Research checked 7 October 2026. This is an integration plan, not a claim that the current build runs inside Discord.

## Can I start for free?

Discord's documented Activity setup has no developer subscription, Nitro purchase, or publication payment step. You can start building and testing without buying Nitro; this is based on the documented process, not a promise that all future costs are zero. Your game still needs hosting and a database. [Official setup](https://docs.discord.com/developers/activities/building-an-activity).

You can already share the ordinary game URL in Discord and play in a browser while chatting. Being playable *inside* the Activity launcher requires an integration.

## What the current game needs

DeedQuest is currently a standalone Vite/React website with a room API and Redis persistence. Its Vercel configuration sends `X-Frame-Options: DENY`, and it has no Embedded App SDK or Discord login exchange. Simply setting a URL in the Developer Portal is insufficient.

The implementation should:

- Add a Discord-specific entry mode with the Embedded App SDK handshake while preserving normal browser play.
- Add a server-side OAuth exchange and verified Discord identity. Keep the client secret on the server. Never trust a client-supplied Discord user ID to own a seat or purchase.
- Connect participants in the same Activity instance to the same private room, preserve reconnects, and enforce the existing no-new-seats-after-start rule.
- Review iframe/CSP headers for the Activity entry, API origin validation, proxy URL mappings, and proxy-aware rate limiting. Do not globally disable origin checks or iframe protection.
- Adapt invites, external links, storage, and layout to the Discord sandbox; test desktop and mobile, two human accounts, and bots.

Discord routes Activity requests through its proxy and requires mapped external resources. This matters to our current host/origin checks and browser identity storage. [Networking documentation](https://docs.discord.com/developers/activities/development-guides/networking).

## Private testing, after the integration exists

1. Create a DeedQuest application in the [Discord Developer Portal](https://discord.com/developers/applications).
2. Enable Activities, configure the installation contexts and OAuth settings, and map `/` to the deployed Activity host. Use the actual integration's environment names for its public app ID and private server secret.
3. Deploy the integrated build. Launch it through Discord's App Launcher and confirm the SDK connects.
4. Invite friends using **App Testers**, not developer-team membership. Testers accept their invitations. Follow Discord's Developer Mode / Application Test Mode instructions if the test app is not visible.

Currently an unverified app can have up to **50 App Testers** and can launch in servers with **fewer than 25 members**. Those are Discord testing limits, separate from DeedQuest's 8- or 10-player room limits. [Tester setup and restrictions](https://support-dev.discord.com/hc/en-us/articles/21204493235991-How-Can-Users-Discover-and-Play-My-Activity).

## Public discovery

Private tester access does not automatically put the game in the public Activity catalogue. Apply for app verification, satisfy the current criteria in the Developer Portal, and then enable Discovery. Verification and Discovery are separate steps; being verified does not guarantee featured placement. Keep a separate unverified development app for subsequent testing. [Verified and unverified Activities](https://support-dev.discord.com/hc/en-us/articles/26576097154199-What-are-Verified-and-Unverified-Activities).

## Future payments and ads

Discord Premium Apps currently lists supported developer locations as the US, UK, and EU. India is not listed, so an India-based developer should not assume native subscriptions or payouts are available. Recheck before building payment integration. [Current eligibility](https://support-dev.discord.com/hc/en-us/articles/17297949965079-How-Do-I-Monetize-My-App).

External payments are not categorically prohibited: Discord says unsupported regions are exempt from its Premium Apps purchase-support requirement until supported. When applicable, that requirement includes offering supported paid features through Discord at a price no higher than elsewhere. This is separate from payment-provider onboarding, taxes, and app review. [Monetization FAQ](https://support-dev.discord.com/hc/en-us/articles/23810643331735-Premium-Apps-Required-Support-for-Monetizing-Apps).

Discord's [Ads Policy](https://support.discord.com/hc/en-us/articles/25516720403223-Ads-Policy) covers third-party ads in Activities. That does not establish Google AdSense approval or compatibility inside Discord's iframe/proxy. Its [Developer Policy](https://support-dev.discord.com/hc/en-us/articles/8563934450327-Discord-Developer-Policy) also forbids disclosing Discord API Data to ad networks. Keep Activity ads off until the integration, consent flow, and both platforms' requirements are checked. Website AdSense setup does not automatically carry over.

## Suggested product sequence

These are recommendations, not implemented entitlements or prices:

1. **Feedback beta:** leave every current map, teams, and basic avatar selection unlocked. Find out whether people finish matches, return with friends, and understand trades/building.
2. **Identity and ownership:** add recoverable accounts and server-held purchase records before taking payments. The current browser identity and expiring room store are not a permanent account or purchase system.
3. **First optional purchases:** themed token/board cosmetics and new map expansions. Let the host's map ownership unlock that map for everyone in their room. Keep basic play, team formation and readable player colors free.
4. **DeedQuest points:** a separate cosmetic/unlock balance, never the cash used to buy properties during a match. Purchases and balances need server validation, a transaction ledger, and payment-webhook handling. Keep dice odds and match advantages independent of spending.
5. **Subscriptions:** add only when there is recurring value, such as new cosmetic collections or access to an expanding map library. Test willingness to pay before promising regular content.
6. **Website ads:** retain the optional homepage slot so a match is never interrupted. Follow [HOSTING-ADS.md](HOSTING-ADS.md); approval and earnings are not guaranteed.

For the immediate web beta, use [VERCEL-PLAYTEST.md](VERCEL-PLAYTEST.md), including its Vercel plan eligibility note.
