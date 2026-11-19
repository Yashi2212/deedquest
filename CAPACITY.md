# Capacity and hosting costs

This release is intended for private games with friends. It has not been load-tested with 3,000 simultaneous players. A room holds up to 8 or 10 players; that limit is unrelated to the total number of players the deployment can sustain.

## What 3,000 simultaneous players would mean

Visible browsers poll the room API approximately every two seconds, after the previous request completes. With low latency, 3,000 visible player tabs would produce about:

| Workload | Estimate |
| --- | --- |
| Concurrent full ten-player rooms | 300 |
| Room reads per second | 1,500 |
| Room reads per hour | 5,400,000 |
| Room reads per day at constant usage | 129,600,000 |

These are arithmetic projections from the polling interval, **not measured throughput**. They exclude moves, chat, retries, rate-limit commands, and bot requests. Background tabs poll every 12 seconds and reduce traffic. A 304 response still invokes the function and reads Redis.

## Can this be free?

For occasional personal games, deployment can stay within the free plans. Sustained 3,000-player use will not fit this design's free allowances:

- [Vercel Hobby](https://vercel.com/docs/plans/hobby) currently includes 1 million function invocations per month and restricts use to personal, non-commercial projects. At the projected read rate, that allowance alone lasts about 11 minutes, before counting other operations or limits.
- [Upstash Redis Free](https://upstash.com/pricing/redis) currently includes 500,000 commands/month, 256 MB storage, and 10 GB bandwidth. Even assuming only one database command per poll, the command allowance lasts about 5.6 minutes at that projected rate. Actual consumption can be higher.

- [Cloudflare Workers Free](https://developers.cloudflare.com/workers/platform/pricing/) has 100,000 dynamic requests/day and 10ms CPU/request. At 1,500 reads/second, the daily allowance is consumed in about 67 seconds. Static asset serving does not make API polls free. Long-game CPU use still needs production measurement.

Plan details checked October 5, 2026. Check the providers' current limits before launch. Function concurrency limits do not establish application performance or free usage capacity. This project does not automatically upgrade plans.

## What a public launch needs

Before targeting 3,000 concurrent players:

1. Replace frequent polling with room subscriptions that push changes to connected players, and reconnect clients from a versioned snapshot.
2. Send changed data, and paginate/archive game logs and trade history. Currently each saved room contains its full history; long games increase serialization work, storage, and response size.
3. Assign one authoritative scheduler per room for bot moves and timers. Currently each open human browser can request bot ticks; the server safely throttles them, but the requests still cost resources.
4. Select database and compute capacity using measured payload sizes and active-game traffic, with budget alerts and application monitoring.
5. Run a staged load test on the actual deployment across hundreds of rooms. Measure p95/p99 action latency, error rates, retries, concurrent-action correctness, reconnections, and several-hour games before making a capacity claim.

Rooms already have separate storage keys, server validation, authenticated chat, idempotent requests, and atomic revision checks. Those protect correctness; they are not a substitute for a production capacity test.
