window.startYelpScraper = async function() {
  let results = [];
  let businessCards = Array.from(document.querySelectorAll('div[data-testid="searchResult"]'));
  // Filter out sponsored cards
  businessCards = businessCards.filter(card => !card.innerText.includes("Sponsored"));

  async function scrapeBusiness(card, idx) {
    card.scrollIntoView({behavior: 'smooth'});
    await new Promise(res => setTimeout(res, 800 + Math.random() * 700)); // Random delay

    // Find and click the business link
    let link = card.querySelector('a[href^="/biz/"]');
    if (!link) return;
    link.target = "_self"; // Ensure opens in same tab
    link.click();

    // Wait for navigation
    await new Promise(res => setTimeout(res, 1800 + Math.random() * 1200));
    // Scrape data
    let name = document.querySelector('h1')?.innerText || "";
    let address = document.querySelector('address')?.innerText || "";
    let phone = "";
    let phoneEl = Array.from(document.querySelectorAll('p')).find(p => /\(\d{3}\)\s?\d{3}-\d{4}/.test(p.innerText));
    if(phoneEl) phone = phoneEl.innerText;
    let reviews = document.querySelector('[data-testid="reviewCount"]')?.innerText || "";

    results.push({name, address, phone, reviews});

    // Go back to results page
    window.history.back();
    await new Promise(res => setTimeout(res, 1800 + Math.random() * 900));
    // Re-select cards after navigation
    businessCards = Array.from(document.querySelectorAll('div[data-testid="searchResult"]')).filter(card => !card.innerText.includes("Sponsored"));
  }

  for (let i = 0; i < businessCards.length; i++) {
    await scrapeBusiness(businessCards[i], i);
  }

  // Save results
  chrome.storage.local.set({yelpResults: results}, () => {
    chrome.runtime.sendMessage({scrapingDone: true});
  });
};
