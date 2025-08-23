// Background worker handling scraping and persistent storage

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startScrape') {
    // reset state
    chrome.storage.local.set({ status: 'Scraping...', results: [] });
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const tab = tabs[0];
      if (!tab) {
        chrome.storage.local.set({ status: 'Error: No active tab' });
        return;
      }
      // forward scrape action to content script
      chrome.tabs.sendMessage(tab.id, { action: message.site === 'yelp' ? 'scrapeYelp' : message.site === 'yellow' ? 'scrapeYellowPages' : 'scrapeGMaps' }, response => {
        if (chrome.runtime.lastError || !response) {
          chrome.storage.local.set({ status: 'Error: Could not scrape.', results: [] });
        } else {
          // final results already accumulated via pageResults
          chrome.storage.local.get('results', ({ results }) => {
            const count = results ? results.length : 0;
            chrome.storage.local.set({ status: `Found ${count} results.` });
          });
        }
      });
    });
    sendResponse({ started: true });
    return true; // keep channel
  } else if (message.type === 'progress') {
    chrome.storage.local.set({ status: `Scraping page ${message.page} — ${message.current} of ${message.total}: ${message.name}` });
  } else if (message.type === 'pageResults') {
    chrome.storage.local.get('results', ({ results }) => {
      const existing = results || [];
      const have = new Set(existing.map(r => r.profileUrl));
      for (const r of message.data) {
        if (!have.has(r.profileUrl)) {
          existing.push(r);
          have.add(r.profileUrl);
        }
      }
      chrome.storage.local.set({ results: existing });
    });
  }
});
