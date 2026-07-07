/**
 * 🔗 adReferral.ts — extrai UTM/fbclid do referral de clique em anúncio (Click-to-WhatsApp)
 *
 * Usado por webhooks de WhatsApp para descobrir de qual campanha/anúncio Meta
 * um lead veio. Mesma lógica usada pelo webhook Z-API, extraída para reuso.
 */

export type AdReferral = {
  utm_source:   string | null;
  utm_campaign: string | null;
  utm_medium:   string | null;
  utm_adset:    string | null;
  utm_ad:       string | null;
  fbclid:       string | null;
};

/** Faz parse de UTMs a partir da source_url do referral + ctwa_clid (equivalente ao fbclid no WhatsApp) */
export function parseAdReferral(
  sourceUrl?: string | null,
  ctwaClid?:  string | null,
): AdReferral {
  const url = sourceUrl ?? "";
  try {
    const parsed = new URL(url.includes("?") ? url : `https://x.com?${url}`);
    return {
      utm_source:   parsed.searchParams.get("utm_source")   ?? (url ? "meta" : null),
      utm_campaign: parsed.searchParams.get("utm_campaign") ?? null,
      utm_medium:   parsed.searchParams.get("utm_medium")   ?? null,
      utm_adset:    parsed.searchParams.get("utm_adset")    ?? null,
      utm_ad:       parsed.searchParams.get("utm_ad")       ?? null,
      fbclid:       parsed.searchParams.get("fbclid")       ?? ctwaClid ?? null,
    };
  } catch {
    return {
      utm_source: url ? "meta" : null, utm_campaign: null, utm_medium: null,
      utm_adset: null, utm_ad: null, fbclid: ctwaClid ?? null,
    };
  }
}
