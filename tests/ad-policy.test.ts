import test from 'node:test';
import assert from 'node:assert/strict';
import { mayRequestAd, sponsorUrl } from '../src/ad-policy';
test('ads remain blocked for missing, rejected, unknown or opted-out consent', () => {
  const consent = { gdprApplies: true, eventStatus: 'useractioncomplete', vendor: { consents: {755: true} }, purpose: { consents: {1: true,3: true,4: true} } };
  assert.equal(mayRequestAd(consent, true, 1), true);
  for (const data of [undefined, {}, {...consent,eventStatus:'cmpuishown'}, {...consent,gdprApplies:undefined}, {...consent,vendor:{consents:{755:false}}}, {...consent,purpose:{consents:{1:true,3:false,4:true}}}]) assert.equal(mayRequestAd(data, true, 1), false);
  for (const status of [undefined,0,3]) assert.equal(mayRequestAd(consent, true, status), false);
  assert.equal(mayRequestAd(consent, false, 1), false);
  assert.equal(mayRequestAd(consent, true, 2, true), false);
  assert.equal(mayRequestAd({gdprApplies:false,eventStatus:'tcloaded'}, true, 2), true);
});
test('sponsor links permit only credential-free HTTPS URLs', () => {
  assert.equal(sponsorUrl('https://example.com/sponsor'), 'https://example.com/sponsor');
  for (const url of ['javascript:alert(1)','http://example.com','https://user:pass@example.com','/sponsor','bad']) assert.equal(sponsorUrl(url), null);
});
