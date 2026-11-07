// Fetches a product page and extracts price. Works on most stores via JSON-LD / meta tags,
// with fallbacks for Amazon & Flipkart. Native fetch has no CORS, so this runs on-device.
const UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';

export type ScrapeResult = { price: number; title?: string };

const num = (s: any) => {
  const n = parseFloat(String(s).replace(/[^\d.]/g, ''));
  return isFinite(n) && n > 0 ? n : undefined;
};
const decode = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();

function fromJsonLd(html: string): ScrapeResult | undefined {
  const blocks = html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const b of blocks) {
    try {
      const json = JSON.parse(b.replace(/^<script[^>]*>|<\/script>$/gi, ''));
      const stack = [json];
      while (stack.length) {
        const o = stack.pop();
        if (!o || typeof o !== 'object') continue;
        if (Array.isArray(o)) { stack.push(...o); continue; }
        const type = [].concat(o['@type'] || []).join(',');
        if (/Product/i.test(type) && o.offers) {
          const offers = [].concat(o.offers);
          for (const of of offers as any[]) {
            const p = num(of.price ?? of.lowPrice ?? of.priceSpecification?.price);
            if (p) return { price: p, title: o.name };
          }
        }
        if (o['@graph']) stack.push(o['@graph']);
        Object.values(o).forEach((v) => typeof v === 'object' && stack.push(v));
      }
    } catch {}
  }
}

function fromMeta(html: string): number | undefined {
  const pats = [
    /<meta[^>]+(?:property|name|itemprop)=["'](?:product:price:amount|og:price:amount|price)["'][^>]+content=["']([^"']+)/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name|itemprop)=["'](?:product:price:amount|og:price:amount|price)["']/i,
    /itemprop=["']price["'][^>]*content=["']([^"']+)/i,
  ];
  for (const p of pats) { const m = html.match(p); if (m && num(m[1])) return num(m[1]); }
}

function fromSiteSpecific(html: string): number | undefined {
  const pats = [
    /class="a-price-whole">([\d,]+)/,                 // Amazon
    /id="priceblock_(?:ourprice|dealprice)"[^>]*>[^\d]*([\d,]+)/, // old Amazon
    /class="Nx9bqj[^"]*"[^>]*>₹([\d,]+)/,             // Flipkart (class names change often)
    /"sellingPrice"\s*:\s*\{?[^}]*?"value"\s*:\s*(\d+)/, // Flipkart JSON
    /class="woocommerce-Price-amount[^>]*>(?:<bdi>)?(?:<span[^>]*>[^<]*<\/span>)?([\d,]+)/, // WooCommerce
  ];
  for (const p of pats) { const m = html.match(p); if (m && num(m[1])) return num(m[1]); }
}

function title(html: string) {
  const m = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i)
    || html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? decode(m[1]).slice(0, 140) : undefined;
}

export async function scrapePrice(url: string): Promise<ScrapeResult> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-IN,en;q=0.9', Accept: 'text/html' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  if (/captcha|robot check/i.test(html) && !/price/i.test(html)) throw new Error('Blocked by captcha — try again later');

  const ld = fromJsonLd(html);
  const price = ld?.price ?? fromMeta(html) ?? fromSiteSpecific(html);
  if (!price) throw new Error('Price not found on page');
  return { price, title: ld?.title ? decode(ld.title) : title(html) };
}