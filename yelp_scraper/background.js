// Handle background scraping and persist state
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startScrape') {
    chrome.storage.local.set({ status: 'Scraping...', results: [] });
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (!tabs[0]) {
        chrome.storage.local.set({ status: 'Error: No active tab' });
        return;
      }
      chrome.tabs.sendMessage(
        tabs[0].id,
        { action: 'scrapeYelp', numPages: message.numPages },
        response => {
          if (chrome.runtime.lastError || !response) {
            chrome.storage.local.set({ status: "Error: Could not scrape. Make sure you're on a Yelp search page.", results: [] });
          } else {
            chrome.storage.local.set({ status: `Found ${response.data.length} results.`, results: response.data });
          }
        }
      );
    });
    sendResponse({ started: true });
    return true; // keep message channel open for async response
  } else if (message.type === 'progress') {
    chrome.storage.local.set({ status: `Scraping page ${message.page} — ${message.current} of ${message.total}: ${message.name}` });
  }
});
