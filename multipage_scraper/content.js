// Content script for multipage scraper supporting Yelp, Yellow Pages and Google Maps

// ---- helpers ----
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const jitter = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

// -------------------- YELP --------------------
function yelpGetCards() {
  return Array.from(document.querySelectorAll('div[data-testid="scrollable-photos-card"]'));
}
function yelpFirstResultName() {
  const firstCard = yelpGetCards()[0];
  const link = firstCard?.querySelector('div[data-traffic-crawl-id="SearchResultBizName"] a');
  return (link?.textContent || "").trim();
}
async function yelpWaitForNewResults(prevUrl, prevFirst, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (location.href !== prevUrl) return true;
    const nowFirst = yelpFirstResultName();
    if (nowFirst && nowFirst !== prevFirst) return true;
    await sleep(250);
  }
  return false;
}
function yelpFindNextButton() {
  let btn = document.querySelector('button[aria-label="Next page"]');
  if (btn) return btn;
  const candidates = Array.from(document.querySelectorAll('button, a[role="button"]'));
  btn = candidates.find(b => {
    const t = (b.textContent || "").trim().toLowerCase();
    return t === "next" || t === "next page";
  });
  return btn || null;
}
function yelpFindNextAnchor() {
  return (
    document.querySelector('a[rel="next"]') ||
    document.querySelector('a[aria-label="Next"], a[aria-label="Next page"]') ||
    null
  );
}
function yelpSynthesizeNextUrl() {
  try {
    const url = new URL(location.href);
    const currentStart = parseInt(url.searchParams.get("start") || "0", 10) || 0;
    const perPage = Math.max(yelpGetCards().length, 10);
    const nextStart = currentStart + perPage;
    url.searchParams.set("start", String(nextStart));
    return url.toString();
  } catch {
    return null;
  }
}
async function yelpGetPhoneNumber(profileUrl) {
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
function yelpScrapePageOnce() {
  const out = [];
  for (const card of yelpGetCards()) {
    const bizLink = card.querySelector('div[data-traffic-crawl-id="SearchResultBizName"] a');
    const href = bizLink?.getAttribute("href") || "";
    if (!href.startsWith("/biz/")) continue;
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
async function yelpGotoNextPage() {
  const btn = yelpFindNextButton();
  if (btn) {
    btn.scrollIntoView({ behavior: "smooth", block: "center" });
    await sleep(jitter(350, 900));
    btn.click();
    return true;
  }
  const a = yelpFindNextAnchor();
  if (a) {
    a.scrollIntoView({ behavior: "smooth", block: "center" });
    await sleep(jitter(350, 900));
    a.click();
    return true;
  }
  const nextUrl = yelpSynthesizeNextUrl();
  if (nextUrl) {
    window.scrollTo({ top: 0, behavior: "instant" });
    await sleep(jitter(200, 500));
    location.href = nextUrl;
    return true;
  }
  return false;
}
async function scrapeYelp() {
  let currentPage = 1;
  let allResults = [];
  const seenThisSession = new Set();
  let stagnantStrike = 0;
  while (true) {
    const prevUrl = location.href;
    const prevFirst = yelpFirstResultName();
    const pageResults = yelpScrapePageOnce();
    const pageKey = `${prevUrl}|${pageResults.map(r => r.profileUrl).join(",")}`;
    if (seenThisSession.has(pageKey)) {
      stagnantStrike++;
    } else {
      stagnantStrike = 0;
      seenThisSession.add(pageKey);
    }
    for (let i = 0; i < pageResults.length; i++) {
      const biz = pageResults[i];
      biz.phone = await yelpGetPhoneNumber(biz.profileUrl);
      chrome.runtime.sendMessage({
        type: "progress",
        current: i + 1,
        total: pageResults.length,
        name: biz.name,
        page: currentPage
      });
      await sleep(jitter(260, 780));
    }
    const before = allResults.length;
    const have = new Set(allResults.map(r => r.profileUrl));
    for (const r of pageResults) {
      if (!have.has(r.profileUrl)) {
        allResults.push(r);
        have.add(r.profileUrl);
      }
    }
    chrome.runtime.sendMessage({ type: "partial", results: allResults });
    const added = allResults.length - before;
    if (added === 0 || stagnantStrike >= 2) {
      const tried = await yelpGotoNextPage();
      if (!tried) break;
      await sleep(jitter(900, 1600));
      const changed = await yelpWaitForNewResults(prevUrl, prevFirst, 20000);
      if (!changed) break;
      currentPage++;
      await sleep(jitter(900, 2000));
      continue;
    }
    const tried = await yelpGotoNextPage();
    if (!tried) break;
    await sleep(jitter(900, 1600));
    const changed = await yelpWaitForNewResults(prevUrl, prevFirst, 20000);
    if (!changed) break;
    currentPage++;
    await sleep(jitter(1000, 2400));
  }
  return allResults;
}

// -------------------- YELLOW PAGES --------------------
function ypGetCards() {
  return Array.from(
    document.querySelectorAll(
      'div.jsListing, div.listing, div.result, div.business-card, li.listing'
    )
  );
}
function ypScrapePageOnce() {
  const out = [];
  for (const card of ypGetCards()) {
    const link =
      card.querySelector(
        'a.business-name, a.listing__name--link, a[itemprop="url"], a[data-entityname], a[href*="/bus/"]'
      );
    const name = (link?.innerText || "").trim();
    const profileUrl = link?.href || "";
    const phone =
      card
        .querySelector('a[href^="tel:"], .phones, .mlr__contacts__detail, [itemprop="telephone"]')
        ?.innerText.replace(/^Tel\s*/i, "")
        .trim() || "";
    const categories = Array.from(
      card.querySelectorAll(
        '.categories a, .listing__content__tags a, .mlr__tags .mlr__tag, [class*="category"] a'
      )
    )
      .map(a => a.innerText.trim())
      .filter(Boolean)
      .join(', ');
    if (name) out.push({ name, phone, categories, profileUrl });
  }
  return out;
}
async function ypWaitForNewResults(prevUrl, prevFirst, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (location.href !== prevUrl) return true;
    const firstCard = ypGetCards()[0];
    const name =
      firstCard
        ?.querySelector(
          'a.business-name, a.listing__name--link, a[itemprop="url"], a[data-entityname], a[href*="/bus/"]'
        )
        ?.innerText.trim();
    if (name && name !== prevFirst) return true;
    await sleep(250);
  }
  return false;
}
async function scrapeYellowPages() {
  let allResults = [];
  let page = 1;
  while (true) {
    const prevUrl = location.href;
    const firstCard = ypGetCards()[0];
    const prevFirst =
      firstCard
        ?.querySelector(
          'a.business-name, a.listing__name--link, a[itemprop="url"], a[data-entityname], a[href*="/bus/"]'
        )
        ?.innerText.trim() || "";
    const pageResults = ypScrapePageOnce();
    const have = new Set(allResults.map(r => r.profileUrl));
    for (const r of pageResults) {
      if (!have.has(r.profileUrl)) {
        allResults.push(r);
        have.add(r.profileUrl);
      }
    }
    chrome.runtime.sendMessage({ type: "partial", results: allResults });
    const next = document.querySelector('a.next, a[rel="next"], a[aria-label="Next"]');
    if (!next) break;
    next.click();
    const changed = await ypWaitForNewResults(prevUrl, prevFirst);
    if (!changed) break;
    page++;
    await sleep(jitter(800, 1500));
  }
  return allResults;
}

// -------------------- GOOGLE MAPS --------------------
function gmGetCards() {
  return Array.from(document.querySelectorAll('.Nv2PK'));
}
function gmScrapeVisible() {
  const out = [];
  for (const card of gmGetCards()) {
    const name = card.querySelector('.qBF1Pd')?.innerText.trim() || '';
    const profileUrl = card.querySelector('a.hfpxzc')?.href || '';
    if (name) out.push({ name, categories: '', profileUrl, phone: '' });
  }
  return out;
}
async function gmFetchDetails(profileUrl) {
  await sleep(jitter(150, 450));
  try {
    const resp = await fetch(profileUrl, { credentials: 'include' });
    const text = await resp.text();
    const doc = new DOMParser().parseFromString(text, 'text/html');
    let phone =
      doc
        .querySelector('a[href^="tel:"]')
        ?.getAttribute('href')
        ?.replace(/^tel:/, '')
        .trim() || '';
    let category = '';
    const ld = doc.querySelector('script[type="application/ld+json"]');
    if (ld) {
      try {
        const data = JSON.parse(ld.textContent || '{}');
        if (!phone && data.telephone) phone = data.telephone.trim();
        if (Array.isArray(data['@type'])) category = data['@type'].join(', ');
        else if (typeof data['@type'] === 'string') category = data['@type'];
        if (data.servesCuisine) {
          const sc = Array.isArray(data.servesCuisine)
            ? data.servesCuisine.join(', ')
            : data.servesCuisine;
          category = category ? `${category}, ${sc}` : sc;
        }
      } catch {}
    }
    return { phone, categories: category };
  } catch {
    return { phone: '', categories: '' };
  }
}
async function gmScrollToEnd(container) {
  let last = -1;
  while (true) {
    container.scrollTo(0, container.scrollHeight);
    await sleep(1000);
    if (container.scrollHeight === last) break;
    last = container.scrollHeight;
  }
}
async function scrapeGoogleMaps() {
  const allResults = [];
  const seen = new Set();
  const list = document.querySelector('.m6QErb, .DxyBCb');
  if (!list) return allResults;
  await gmScrollToEnd(list);
  const items = gmScrapeVisible();
  for (let i = 0; i < items.length; i++) {
    const r = items[i];
    if (seen.has(r.profileUrl)) continue;
    seen.add(r.profileUrl);
    const details = await gmFetchDetails(r.profileUrl);
    r.phone = details.phone;
    r.categories = details.categories;
    allResults.push(r);
    chrome.runtime.sendMessage({
      type: 'progress',
      current: i + 1,
      total: items.length,
      name: r.name,
      page: 1
    });
    chrome.runtime.sendMessage({ type: 'partial', results: allResults });
    await sleep(jitter(250, 750));
  }
  return allResults;
}

// -------------------- message handler --------------------
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scrape') {
    (async () => {
      try {
        let data = [];
        if (request.site === 'yelp') {
          data = await scrapeYelp();
        } else if (request.site === 'yellowpages') {
          data = await scrapeYellowPages();
        } else if (request.site === 'googlemaps') {
          data = await scrapeGoogleMaps();
        }
        sendResponse({ data });
      } catch (e) {
        sendResponse({ data: [] });
      }
    })();
    return true;
  }
});
