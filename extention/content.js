window.startYelpScraper = async function() {
  let results = [];
  let businessCards = Array.from(document.querySelectorAll('div.toggle__09f24__fZMQ4[data-testid="scrollable-photos-card"]'));
  for (let i = 0; i < businessCards.length; i++) {
    let card = businessCards[i];
    card.scrollIntoView({behavior: 'smooth'});
    await new Promise(res => setTimeout(res, 900 + Math.random() * 700));

    // Get business link
    let link = card.querySelector('h3 a.y-css-1x1e1r2');
    if(!link) continue;

    // Open in this tab (simulate click)
    link.target = "_self";
    link.click();

    // Wait for navigation
    await new Promise(res => setTimeout(res, 2000 + Math.random() * 1200));

    // SCRAPE on business page using only 100% confirmed selectors:
    let name = document.querySelector('h1')?.innerText || "";
    let address = document.querySelector('address')?.innerText || "";
    let website = "";
    let websiteEl = document.querySelector('a[href^="/biz_redir?url="]');
    if (websiteEl) {
      website = decodeURIComponent(websiteEl.href.split('url=')[1].split('&')[0]);
    }
    let phone = document.querySelector('p.y-css-qn4gww[data-font-weight="semibold"]')?.innerText || "";

    results.push({name, address, website, phone});

    // Go back
    window.history.back();
    await new Promise(res => setTimeout(res, 2200 + Math.random() * 900));

    // Re-select cards (in case page reloaded)
    businessCards = Array.from(document.querySelectorAll('div.toggle__09f24__fZMQ4[data-testid="scrollable-photos-card"]'));
  }
  // Save results
  chrome.storage.local.set({yelpResults: results}, () => {
    chrome.runtime.sendMessage({scrapingDone: true});
  });
};
