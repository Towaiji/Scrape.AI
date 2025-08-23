// === yellowpages.js (scrape all result pages) ===

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const jitter = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

function getCards() {
  return Array.from(document.querySelectorAll('div.result, div.listing')); // basic selector
}

function firstResultName() {
  const first = getCards()[0];
  const link = first?.querySelector('a[href*="/bus/"]');
  return (link?.textContent || '').trim();
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

async function getPhoneNumber(profileUrl) {
  await sleep(jitter(120, 420));
  try {
    const res = await fetch(profileUrl, { credentials: 'include' });
    const text = await res.text();
    const doc = new DOMParser().parseFromString(text, 'text/html');
    const tel = doc.querySelector('a[href^="tel:"]')?.getAttribute('href')?.replace(/^tel:/,'').trim()
      || doc.querySelector('span[itemprop="telephone"]')?.textContent.trim() || '';
    return tel;
  } catch {
    return '';
  }
}

function scrapePageOnce() {
  const out = [];
  for (const card of getCards()) {
    const linkEl = card.querySelector('a[href*="/bus/"]');
    const href = linkEl?.href || '';
    const name = (linkEl?.textContent || '').trim();
    const categories = Array.from(card.querySelectorAll('.listing__categories a, .categories a'))
      .map(a => a.textContent.trim()).filter(Boolean).join(', ');
    if (name) out.push({ name, profileUrl: href, categories });
  }
  return out;
}

async function gotoNextPage() {
  const a = document.querySelector('a[rel="next"], a.pagination__next, a.next');
  if (!a) return false;
  a.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await sleep(jitter(350, 900));
  a.click();
  return true;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scrapeYellowPages') {
    (async () => {
      let allResults = [];
      let currentPage = 1;
      while (true) {
        const prevUrl = location.href;
        const prevFirst = firstResultName();
        const pageResults = scrapePageOnce();
        for (let i=0;i<pageResults.length;i++) {
          const biz = pageResults[i];
          biz.phone = await getPhoneNumber(biz.profileUrl);
          chrome.runtime.sendMessage({ type: 'progress', current: i+1, total: pageResults.length, name: biz.name, page: currentPage });
          await sleep(jitter(260,780));
        }
        chrome.runtime.sendMessage({ type: 'pageResults', data: pageResults });
        allResults.push(...pageResults);
        const moved = await gotoNextPage();
        if (!moved) break;
        await sleep(jitter(900,1600));
        const changed = await waitForNewResults(prevUrl, prevFirst, 20000);
        if (!changed) break;
        currentPage++;
        await sleep(jitter(900,2000));
      }
      sendResponse({ data: allResults });
    })();
    return true;
  }
});
