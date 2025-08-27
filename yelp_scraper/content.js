// === content.js (keep pagination logic intact) ===

// ---- helpers ----
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const jitter = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

function getCards() {
  return Array.from(document.querySelectorAll('div[data-testid="scrollable-photos-card"]'));
}
function firstResultName() {
  const firstCard = getCards()[0];
  const link = firstCard?.querySelector('div[data-traffic-crawl-id="SearchResultBizName"] a');
  return (link?.textContent || "").trim();
}
async function waitForNewResults(prevUrl, prevFirst, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (location.href !== prevUrl) return true;
    const nowFirst = firstResultName();
    if (nowFirst && nowFirst !== prevFirst) return true;
    await sleep(250);
  }
  return false;
}

function findNextButton() {
  let btn = document.querySelector('button[aria-label="Next page"]');
  if (btn) return btn;
  const candidates = Array.from(document.querySelectorAll('button, a[role="button"]'));
  btn = candidates.find(b => {
    const t = (b.textContent || "").trim().toLowerCase();
    return t === "next" || t === "next page";
  });
  return btn || null;
}
function findNextAnchor() {
  return (
    document.querySelector('a[rel="next"]') ||
    document.querySelector('a[aria-label="Next"], a[aria-label="Next page"]') ||
    null
  );
}

// Synthesize a "next" URL using start= param as a last resort
function synthesizeNextUrl() {
  try {
    const url = new URL(location.href);
    const currentStart = parseInt(url.searchParams.get("start") || "0", 10) || 0;
    const perPage = Math.max(getCards().length, 10);
    const nextStart = currentStart + perPage;
    url.searchParams.set("start", String(nextStart));
    return url.toString();
  } catch {
    return null;
  }
}

// ---- EXISTING: phone from Yelp profile (unchanged) ----
async function getPhoneNumber(profileUrl) {
  await sleep(jitter(120, 420));
  try {
    const response = await fetch(profileUrl, { credentials: "include" });
    const text = await response.text();
    const doc = new DOMParser().parseFromString(text, "text/html");

    let phone =
      doc.querySelector('a[href^="tel:"]')?.getAttribute("href")?.replace(/^tel:/, "").trim() || "";

    if (!phone) {
      phone =
        doc
          .querySelector('span[aria-label="Business phone number"]')
          ?.parentElement?.nextElementSibling?.querySelector('p[data-font-weight="semibold"]')
          ?.innerText.trim() || "";
    }

    return phone;
  } catch {
    return "";
  }
}

// ---- NEW: website from Yelp profile (separate to minimize churn) ----
async function getWebsiteFromProfile(profileUrl) {
  await sleep(jitter(120, 420));
  try {
    const res = await fetch(profileUrl, { credentials: "include" });
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");

    // Common Yelp pattern: /biz_redir?url=...&website_link_type=website
    const a =
      doc.querySelector('a[href*="/biz_redir?"][href*="website_link_type=website"]') ||
      doc.querySelector('a[aria-label="Business website"], a[alt="Business website"]');

    if (a) {
      const raw = a.getAttribute("href") || "";
      try {
        const u = new URL(raw, "https://www.yelp.com");
        const target = u.searchParams.get("url");
        if (target) return decodeURIComponent(target);
        const txt = (a.textContent || "").trim();
        if (txt) return txt.startsWith("http") ? txt : `https://${txt}`;
      } catch { /* ignore */ }
    }
    return "";
  } catch {
    return "";
  }
}

// ---- NEW: small email discovery from business website (background fetch) ----
function normalizeObfuscated(text) {
  return text
    .replace(/\s*\[at\]\s*|\s+at\s+/gi, '@')
    .replace(/\s*\[dot\]\s*|\s+dot\s+/gi, '.')
    .replace(/\s*\(at\)\s*/gi, '@')
    .replace(/\s*\(dot\)\s*/gi, '.');
}
function extractEmailsFromHTML(html) {
  const emails = new Set();

  // mailto:
  (html.match(/href\s*=\s*["']mailto:([^"'>\s]+)["']/gi) || []).forEach(m => {
    const addr = m.replace(/^[^:]*:/, '').replace(/["']/g, '').trim();
    if (addr) emails.add(addr);
  });

  // JSON-LD
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    Array.from(doc.querySelectorAll('script[type="application/ld+json"]')).forEach(s => {
      try {
        const data = JSON.parse(s.textContent || 'null');
        const scan = (obj) => {
          if (!obj || typeof obj !== 'object') return;
          if (typeof obj.email === 'string') emails.add(obj.email.trim());
          Object.values(obj).forEach(scan);
        };
        Array.isArray(data) ? data.forEach(scan) : scan(data);
      } catch {}
    });
  } catch {}

  // plain text
  const text = normalizeObfuscated(
    html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
  );
  (text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi) || []).forEach(e => emails.add(e.trim()));

  // de-dupe
  const out = [];
  for (const e of emails) {
    const lc = e.toLowerCase();
    if (!out.some(x => x.toLowerCase() === lc)) out.push(e);
  }
  return out;
}
function bgFetchHTML(url) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'externalFetch', url }, (res) => {
      if (!res || !res.ok) return resolve('');
      resolve(res.html || '');
    });
  });
}
function sameOriginUrl(base, path) {
  try {
    const u = new URL(base);
    return `${u.origin}${path.startsWith('/') ? path : '/' + path}`;
  } catch { return null; }
}
async function discoverEmailsFromWebsite(websiteUrl) {
  if (!websiteUrl) return [];
  let base = websiteUrl.trim();
  if (!/^https?:\/\//i.test(base)) base = 'https://' + base;

  const tried = new Set();
  const queue = [];
  ['/','/contact','/contact-us','/about','/about-us','/team','/support'].forEach(p => {
    const u = sameOriginUrl(base, p);
    if (u && !tried.has(u)) { tried.add(u); queue.push(u); }
  });

  const emails = new Set();
  const MAX_PAGES = 5;
  for (let i = 0; i < queue.length && i < MAX_PAGES; i++) {
    const url = queue[i];
    await sleep(jitter(250, 800));
    const html = await bgFetchHTML(url);
    if (!html) continue;
    extractEmailsFromHTML(html).forEach(e => emails.add(e));

    if (queue.length < MAX_PAGES) {
      try {
        const doc = new DOMParser().parseFromString(html, "text/html");
        for (const a of Array.from(doc.querySelectorAll('a[href]'))) {
          const t = (a.textContent || '').toLowerCase();
          const h = a.getAttribute('href') || '';
          if (!/^https?:\/\//i.test(h) && /(contact|support|about|team)/.test(t)) {
            const nu = sameOriginUrl(base, h);
            if (nu && !tried.has(nu)) { tried.add(nu); queue.push(nu); if (queue.length >= MAX_PAGES) break; }
          }
        }
      } catch {}
    }
  }
  return Array.from(emails);
}

// ---- scrape one page of cards ----
function scrapePageOnce() {
  const out = [];
  for (const card of getCards()) {
    const bizLink = card.querySelector('div[data-traffic-crawl-id="SearchResultBizName"] a');
    const href = bizLink?.getAttribute("href") || "";
    if (!href.startsWith("/biz/")) continue; // skip ads/sponsored

    const name = (bizLink?.innerText || "").trim();
    const profileUrl = `https://www.yelp.com${href}`;

    let categories = "";
    const categoriesDiv = card.querySelector('div[data-testid="serp-ia-categories"]');
    if (categoriesDiv) {
      const categoryList = Array.from(categoriesDiv.querySelectorAll('a > button > span'))
        .map(s => s.innerText.trim())
        .filter(Boolean);
      categories = categoryList.join(", ");
    }
    if (name) out.push({ name, profileUrl, categories });
  }
  return out;
}

// ---- go to next page (unchanged) ----
async function gotoNextPage() {
  const btn = findNextButton();
  if (btn) {
    btn.scrollIntoView({ behavior: "smooth", block: "center" });
    await sleep(jitter(350, 900));
    btn.click();
    return true;
  }
  const a = findNextAnchor();
  if (a) {
    a.scrollIntoView({ behavior: "smooth", block: "center" });
    await sleep(jitter(350, 900));
    a.click();
    return true;
  }
  const nextUrl = synthesizeNextUrl();
  if (nextUrl) {
    window.scrollTo({ top: 0, behavior: "instant" });
    await sleep(jitter(200, 500));
    location.href = nextUrl;
    return true;
  }
  return false;
}

// ---- main listener (pagination loop left intact) ----
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "scrapeYelp") {
    (async () => {
      const hardPageLimit = Number.isFinite(request.numPages) && request.numPages > 0 ? request.numPages : 999;
      let currentPage = 1;

      let allResults = [];
      const seenThisSession = new Set();
      let stagnantStrike = 0;

      while (currentPage <= hardPageLimit) {
        const prevUrl = location.href;
        const prevFirst = firstResultName();

        const pageResults = scrapePageOnce();

        const pageKey = `${prevUrl}|${pageResults.map(r => r.profileUrl).join(",")}`;
        if (seenThisSession.has(pageKey)) {
          stagnantStrike++;
        } else {
          stagnantStrike = 0;
          seenThisSession.add(pageKey);
        }

        // === Minimal additions below ===
        for (let i = 0; i < pageResults.length; i++) {
          const biz = pageResults[i];

          // phone (existing)
          biz.phone = await getPhoneNumber(biz.profileUrl);

          // website (new)
          biz.website = await getWebsiteFromProfile(biz.profileUrl);

          // emails (new; tiny same-origin crawl via background)
          biz.emails = [];
          if (biz.website) {
            try { biz.emails = await discoverEmailsFromWebsite(biz.website); } catch {}
          }

          chrome.runtime.sendMessage({
            type: "progress",
            current: i + 1,
            total: pageResults.length,
            name: biz.name,
            page: currentPage
          });

          await sleep(jitter(260, 780));
        }
        // === End minimal additions ===

        const before = allResults.length;
        const have = new Set(allResults.map(r => r.profileUrl));
        for (const r of pageResults) {
          if (!have.has(r.profileUrl)) { allResults.push(r); have.add(r.profileUrl); }
        }
        const added = allResults.length - before;

        if (added === 0 || stagnantStrike >= 2) {
          const tried = await gotoNextPage();
          if (!tried) break;
          await sleep(jitter(900, 1600));
          const changed = await waitForNewResults(prevUrl, prevFirst, 20000);
          if (!changed) break;
          currentPage++;
          await sleep(jitter(900, 2000));
          continue;
        }

        if (currentPage >= hardPageLimit) break;
        const tried = await gotoNextPage();
        if (!tried) break;

        await sleep(jitter(900, 1600));
        const changed = await waitForNewResults(prevUrl, prevFirst, 20000);
        if (!changed) break;

        currentPage++;
        await sleep(jitter(1000, 2400));
      }

      sendResponse({ data: allResults });
    })();
    return true; // async
  }
});
