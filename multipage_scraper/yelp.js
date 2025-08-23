// === yelp.js (robust "all pages" + human-like) ===

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
  // Buttons
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
    // Use cards on current page; default to 10 if ambiguous
    const perPage = Math.max(getCards().length, 10);
    const nextStart = currentStart + perPage;
    url.searchParams.set("start", String(nextStart));
    return url.toString();
  } catch {
    return null;
  }
}

async function getPhoneNumber(profileUrl) {
  // tiny delay per request to avoid uniform cadence
  await sleep(jitter(120, 420));
  try {
    const response = await fetch(profileUrl, { credentials: "include" });
    const text = await response.text();
    const doc = new DOMParser().parseFromString(text, "text/html");

    // Primary: tel: link
    let phone =
      doc.querySelector('a[href^="tel:"]')?.getAttribute("href")?.replace(/^tel:/, "").trim() || "";

    // Fallback: your older selector
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

function scrapePageOnce() {
  const out = [];
  for (const card of getCards()) {
    const bizLink = card.querySelector('div[data-traffic-crawl-id="SearchResultBizName"] a');
    const href = bizLink?.getAttribute("href") || "";
    if (!href.startsWith("/biz/")) continue; // skip ads/sponsored

    const name = (bizLink?.innerText || "").trim();
    const profileUrl = `https://www.yelp.com${href}`;

    // categories
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

// Attempt to go to the next page using multiple strategies
async function gotoNextPage() {
  // 1) Try button click
  const btn = findNextButton();
  if (btn) {
    btn.scrollIntoView({ behavior: "smooth", block: "center" });
    await sleep(jitter(350, 900));
    btn.click();
    return true;
  }
  // 2) Try anchor click
  const a = findNextAnchor();
  if (a) {
    a.scrollIntoView({ behavior: "smooth", block: "center" });
    await sleep(jitter(350, 900));
    a.click();
    return true;
  }
  // 3) Synthesize URL with start= param
  const nextUrl = synthesizeNextUrl();
  if (nextUrl) {
    window.scrollTo({ top: 0, behavior: "instant" }); // optional
    await sleep(jitter(200, 500));
    location.href = nextUrl;
    return true;
  }
  // No way to go next
  return false;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "scrapeYelp") {
    (async () => {
      const hardPageLimit = Number.isFinite(request.numPages) && request.numPages > 0 ? request.numPages : 999; // "all pages"
      let currentPage = 1;

      let allResults = [];
      const seenThisSession = new Set(); // to guard against accidental repeats/loops
      let keepGoing = true;
      let stagnantStrike = 0; // if we see the same page twice, increment; stop after a couple

      while (keepGoing && currentPage <= hardPageLimit) {
        const prevUrl = location.href;
        const prevFirst = firstResultName();

        // ---- scrape current page ----
        const pageResults = scrapePageOnce();

        // Detect if we somehow re-landed on an identical page (no organic cards)
        const pageKey = `${prevUrl}|${pageResults.map(r => r.profileUrl).join(",")}`;
        if (seenThisSession.has(pageKey)) {
          stagnantStrike++;
        } else {
          stagnantStrike = 0;
          seenThisSession.add(pageKey);
        }

        // fetch phones with small per-item jitters
        for (let i = 0; i < pageResults.length; i++) {
          const biz = pageResults[i];
          biz.phone = await getPhoneNumber(biz.profileUrl);

          chrome.runtime.sendMessage({
            type: "progress",
            current: i + 1,
            total: pageResults.length,
            name: biz.name,
            page: currentPage
          });

          await sleep(jitter(260, 780));
        }

        // store partial results so far
        chrome.runtime.sendMessage({ type: "pageResults", data: pageResults });

        // merge (dedupe by profileUrl, just in case)
        const before = allResults.length;
        const have = new Set(allResults.map(r => r.profileUrl));
        for (const r of pageResults) {
          if (!have.has(r.profileUrl)) {
            allResults.push(r);
            have.add(r.profileUrl);
          }
        }
        const added = allResults.length - before;

        // ---- decide if we should continue ----
        // If we hit a repeated page twice or added nothing, we’re likely at the end or looping.
        if (added === 0 || stagnantStrike >= 2) {
          // Try one last time to navigate next; if we fail or page doesn't change, we stop
          const tried = await gotoNextPage();
          if (!tried) break;
          await sleep(jitter(900, 1600));
          const changed = await waitForNewResults(prevUrl, prevFirst, 20000);
          if (!changed) break;
          currentPage++;
          await sleep(jitter(900, 2000));
          continue;
        }

        // normal next
        if (currentPage >= hardPageLimit) break;
        const tried = await gotoNextPage();
        if (!tried) break; // no more pages available

        // wait for real change
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
