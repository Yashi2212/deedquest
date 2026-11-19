# Verification report

Release packaged October 6, 2026; checks completed October 5–6.

## Passed

- TypeScript: `tsc --noEmit`.
- 122 automated tests, no failures or skips in the final full run. The Windows sandbox blocked an atomic temporary-file rename in an earlier run; the identical full suite passed outside that filesystem sandbox.
- Vite production bundle: 1,595 modules; approximately 348 KB JavaScript before gzip.
- Every state/country monopoly on every map: a lone or incomplete set rejects building; full ownership permits building. India has 12 state sets with three sites each, including Lucknow, Ayodhya, Mathura.
- Trade negotiation: original and counteroffer snapshots stay in one trade; roles reverse; only the current recipient may negotiate; outdated terms cannot be accepted; cash and deeds exchange together on acceptance. Bots respond to the current revision.
- Notification checks: new incoming and table offers appear; viewing clears their notice; a revised offer raises a new notice.
- Earlier local HTTP checks: ten concurrent human sessions, capacity limits, private team chat filtering, authentication, duplicate-action handling, server dice, and throttled bot moves.
- India HTTP test with one human seat and two bots: two turn cycles completed, legal moves, cash/ownership consistency, refresh persistence. Longer seeded simulations cover ten cycles. These are bounded tests, not proof of game balance or a full natural-length match.
- Earlier browser checks: R and Space roll once, shortcuts ignore dialogs/typing, half-price site sale pays once, trades work outside the current turn, one close control, newest-first log preserves a scrolled reading position, and narrow-screen layout has no document-wide horizontal overflow.

- New checks: unanimous kick across teams, session revocation, reconnect/late-join rules, Cloudflare Fetch adapter authentication/origin/body limits, and conservative advertising consent gates.
- Cloudflare dry run passed; local workerd served the homepage and flag assets, returned 503 without database secrets, and kept unknown API routes as JSON 404.
- Browser ad preview: one labelled homepage slot, no advertising loader, no horizontal document overflow; Privacy page opens.

- Browser trade check: incoming offer badge appeared; View trade showed Accept, Decline and Negotiate; changing $50 to $75 kept Offer 1 in the same trade history and displayed the change under Offer 2. The modal had one close control.
- Browser room check: Rules beside Invite, center text/dice/status separated, all four players visible, no room ad slot, and removal dialog correctly required all three other humans.

## Deployment limits

The complete source includes the Vercel API and Redis integration. No live Cloudflare/Vercel deployment, live advertising account/CMP, or real Upstash database has been configured or tested with user credentials. Production requires both Redis REST environment variables.

No 3,000-player load test was performed. See [CAPACITY.md](CAPACITY.md) for the traffic projection and required scaling work. The local file store is for development only.

Older matches on boards whose destinations changed cannot be converted fairly; create a fresh room for the corrected boards. Internal storage keys retain the old project prefix to preserve compatible sessions after the DeedQuest rename.
