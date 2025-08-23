// === gmaps.js (scrape all result pages) ===

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const jitter = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

function getCards() {
  return Array.from(document.querySelectorAll('div.Nv2PK')); // each result card
}

function firstResultName() {
  const first = getCards()[0];
  const link = first?.querySelector('a.hfpxzc');
  return (link?.textContent || '').trim();
}

async function waitForNewResults(prevUrl, prevFirst, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const nowFirst = firstResultName();
    if (nowFirst && nowFirst !== prevFirst) return true;
    await sleep(250);
  }
  return false;
}

async function getPhoneNumber(profileUrl) {
  await sleep(jitter(200, 600));
  try {
    const res = await fetch(profileUrl, { credentials: 'include' });
    const text = await res.text();
    const doc = new DOMParser().parseFromString(text, 'text/html');
    const tel = doc.querySelector('a[href^="tel:"]')?.getAttribute('href')?.replace(/^tel:/,'').trim() || '';
    return tel;
  } catch {
    return '';
  }
}

function scrapePageOnce() {
  const out = [];
  for (const card of getCards()) {
    const link = card.querySelector('a.hfpxzc');
    const href = link?.href || '';
    const name = (link?.textContent || '').trim();
    if (name) out.push({ name, profileUrl: href, categories: '' });
  }
  return out;
}

function findNextButton() {
  return document.querySelector('button[aria-label=" Next page "], button[aria-label="Next page"]');
}

async function gotoNextPage() {
  const btn = findNextButton();
  if (!btn) return false;
  btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await sleep(jitter(350,900));
  btn.click();
  return true;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scrapeGMaps') {
    (async () => {
      let allResults = [];
      let currentPage = 1;
      while (true) {
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
        const changed = await waitForNewResults('', prevFirst, 20000);
        if (!changed) break;
        currentPage++;
        await sleep(jitter(900,2000));
      }
      sendResponse({ data: allResults });
    })();
    return true;
  }
});
