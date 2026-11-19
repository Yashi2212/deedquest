# Ads, earnings and free hosting

Checked October 5, 2026. DeedQuest supports one optional homepage advertising space below its maps and playing guide. No ads appear in rooms, gameplay, chat or trade dialogs. There are no interstitials, automatic refreshes or rewards for clicking. Ad blockers and declined consent do not prevent play.

## Hosting choice

Use **Cloudflare Workers + static assets + Upstash Free** for a small ad-supported launch. Follow [CLOUDFLARE.md](CLOUDFLARE.md). Cloudflare's [terms](https://www.cloudflare.com/terms/) and [developer terms](https://www.cloudflare.com/service-specific-terms-developer-platform/) do not impose Vercel Hobby's blanket personal/noncommercial restriction; normal terms and quotas apply.

[Vercel Hobby](https://vercel.com/docs/plans/hobby) is for personal, noncommercial projects, so do not use it for the ad-supported version. [Netlify Free](https://www.netlify.com/guides/netlify-vs-vercel/) also permits commercial projects, but uses a shared credit allowance. This release includes Cloudflare and Vercel adapters, not a Netlify API adapter.

[Workers Free](https://developers.cloudflare.com/workers/platform/pricing/) allows 100,000 dynamic requests/day and 10ms CPU/request. Ordinary static assets are free/unlimited. [Upstash Free](https://upstash.com/pricing/redis) includes 500,000 commands/month. At about 1,800 room polls per player-hour, that database allowance covers at most about 278 player-hours before extra commands, writes and bots. This is an arithmetic upper bound, not measured capacity. Public growth needs optimization and a budget; 3,000 concurrent players will not fit the current free design.

## Estimated earnings

No ad account or sponsor is connected yet, so current ad earnings are zero. You need approval, actual visitors, visible filled ads and valid traffic. Income varies with visitor location, advertiser demand, consent, ad blockers, viewability and season.

Use `monthly ad-bearing page views / 1,000 × actual page RPM`. Google defines page RPM from measured earnings and page views. [RPM explanation](https://support.google.com/adsense/answer/190515?hl=en)

These rupee scenarios are **illustrative assumptions**, not observed India gaming rates or promised earnings:

| Monthly ad-bearing page views | ₹50 page RPM | ₹150 page RPM | ₹300 page RPM |
| --- | ---: | ---: | ---: |
| 1,000 | ₹50 | ₹150 | ₹300 |
| 10,000 | ₹500 | ₹1,500 | ₹3,000 |
| 50,000 | ₹2,500 | ₹7,500 | ₹15,000 |
| 100,000 | ₹5,000 | ₹15,000 | ₹30,000 |

For example, 100 people visiting the ad-bearing homepage once daily gives about 3,000 page views in a 30-day month: ₹450 gross at an assumed ₹150 page RPM. Actual income may be zero or outside these scenarios. Hosting, domain costs and taxes reduce net income.

Rolls, room polling and hours on the ad-free board are not ad-bearing page views. A homepage-only slot intentionally produces fewer ad opportunities per long play session. Use the ad network's measured data, not server requests. With just a few friends, expect little or no income initially.

A direct sponsor can pay a negotiated monthly fee instead. The app has no automatic sponsor marketplace or billing; agree a price separately using honest audience measurements.

## Direct sponsor setup

Put these public settings in ignored .env.local (or your host's build variables), replacing every example:

```dotenv
VITE_AD_MODE=sponsor
VITE_CONTACT_EMAIL=your-public-contact@example.com
VITE_SPONSOR_NAME=Your actual sponsor
VITE_SPONSOR_TEXT=An accurate short description.
VITE_SPONSOR_URL=https://your-sponsor.example/
```

The link must use HTTPS with no embedded credentials. The labelled card uses an ordinary link with sponsored/noopener/noreferrer; it loads no advertising script or tracking pixel. Rebuild and redeploy after changes.

Participation in AdSense is free; you do not need to buy advertising to earn as a publisher. Google pays after account/payment requirements and the applicable payout threshold are met. [Free participation](https://support.google.com/adsense/answer/32850?hl=en-GB)

## AdSense setup

1. Publish the functioning game and useful original content. Set your public contact email. Review src/Information.tsx to name your operator/providers and accurately describe any processing you add; the included privacy notice is a starting point, not a legal compliance certification.
2. Apply for [AdSense](https://adsense.google.com/start/). An eligible account owner and site review are required; approval is not guaranteed. [Eligibility](https://support.google.com/adsense/answer/9724/eligibility-requirements-for-adsense?hl=en-uk)
3. Verify your site using the exact method in your account; a supplied meta tag can verify without automatic placements. After approval, create a manual horizontal display unit. Turn **Auto ads off**, including automatic experiments or placement optimization. A single-page room reuses the same document, so Auto ads could otherwise intrude during play. [Manual units](https://support.google.com/adsense/answer/7037624?hl=en), [Auto settings](https://support.google.com/adsense/answer/9305577?hl=en)
4. Set VITE_AD_MODE=adsense, VITE_ADSENSE_CLIENT to your ca-pub- ID (16 digits), and VITE_ADSENSE_SLOT to your 10-digit slot. These are public IDs, not passwords. No borrowed or fake publisher IDs are included.
5. Configure a Google-certified CMP, including applicable EU and US messages. This implementation expects Google Privacy & messaging's googlefc callbacks and the IAB TCF API. Install the actual account-issued CMP bootstrap in index.html before the app. Do not substitute the AdSense ad loader: the app loads that only after consent and when the slot is visible. A different CMP API needs an adapter. [CMP requirements](https://support.google.com/adsense/answer/13554116?hl=en), [Google messaging API](https://developers.google.com/funding-choices/fc-api-docs)
6. The gate fails closed for missing/unknown consent, EU rejection, US opt-out or Global Privacy Control. Missing setup shows a quiet free-to-play message instead of requesting an ad. Privacy-choice buttons immediately suppress this page's slot; reload after changing choices to reconsider ads. This is a conservative gate, not a complete CMP. Test actual withdrawal and regional behavior before live ads.
7. If AdSense provides an ads.txt line, put that exact account-specific line in public/ads.txt, redeploy, and confirm /ads.txt serves it. No fake entry is included. [ads.txt instructions](https://support.google.com/adsense/answer/12171612?hl=en)
8. Rebuild, deploy and check a real served unit. No live ad account or CMP has been configured/tested in this release. Leave ads off until those checks pass.

Google recommends keeping display ads at least 150px away from games or removing them from gameplay pages; this design removes them entirely from gameplay. Never click your own ads, ask friends to click, or reload to manufacture impressions. [Game placement](https://support.google.com/adsense/answer/2768340?hl=en), [Invalid traffic](https://support.google.com/adsense/answer/2660562?hl=en-GB)

Cloudflare supplies a free workers.dev URL for testing but [recommends a custom domain for production](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/). Registration costs separately. Google accepts eligible domains and supported platform subdomains, but do not assume a particular nested Worker URL will be approved. [Site eligibility](https://support.google.com/adsense/answer/12170421?hl=en)

## Safe layout preview

Run pnpm dev and visit http://localhost:5173/?adPreview=1. Scroll below the maps and playing guide. The sample card is marked as a preview and makes no advertising request. It is development-only. VITE_AD_MODE=off hides the entire ad area on the deployed site. Do not use live advertising for automated bot or UI tests.
