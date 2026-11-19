export type ConsentData = { gdprApplies?: boolean; eventStatus?: string; purpose?: { consents?: Record<number, boolean> }; vendor?: { consents?: Record<number, boolean> } };
// Fail closed until a certified CMP reports complete EU and US decisions.
export function mayRequestAd(data: ConsentData | undefined, success: boolean, usStatus: number | undefined, globalPrivacyControl = false): boolean {
  if (!success || !data || globalPrivacyControl || ![1, 2].includes(usStatus ?? 0)) return false;
  if (!['tcloaded', 'useractioncomplete'].includes(data.eventStatus ?? '')) return false;
  if (data.gdprApplies === false) return true;
  return data.gdprApplies === true && data.vendor?.consents?.[755] === true && [1, 3, 4].every(id => data.purpose?.consents?.[id] === true);
}
export function sponsorUrl(value: string | undefined): string | null {
  try { const url = new URL(value ?? ''); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; }
}
