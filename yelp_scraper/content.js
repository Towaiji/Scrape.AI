// Helper: fetch phone number from a profile page
async function getPhoneNumber(profileUrl) {
  try {
    const response = await fetch(profileUrl);
    const text = await response.text();
    // Parse the HTML
    const doc = new DOMParser().parseFromString(text, "text/html");
    // Find the phone number under the described structure
    const phone = doc.querySelector('span[aria-label="Business phone number"]')?.parentElement
      ?.nextElementSibling?.querySelector('p[data-font-weight="semibold"]')?.innerText.trim() || "";
    return phone;
  } catch (e) {
    return "";
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "scrapeYelp") {
    (async () => {
      const results = [];
      // Select all business cards
      document.querySelectorAll('div[data-testid="scrollable-photos-card"]').forEach(card => {
        // Extract name
        const name = card.querySelector('div[data-traffic-crawl-id="SearchResultBizName"] a')?.innerText.trim() || "";
        // Extract profile URL (relative)
        const relUrl = card.querySelector('div[data-traffic-crawl-id="SearchResultBizName"] a')?.getAttribute('href') || "";
        // Construct absolute URL
        const profileUrl = relUrl.startsWith("http") ? relUrl : `https://www.yelp.com${relUrl}`;
        if (name && relUrl) {
          results.push({ name, profileUrl });
        }
      });

      // For each business, fetch the phone number from their profile page and send progress updates
      for (let i = 0; i < results.length; i++) {
        const biz = results[i];
        biz.phone = await getPhoneNumber(biz.profileUrl);
        // Send progress update to the popup
        chrome.runtime.sendMessage({
          type: "progress",
          current: i + 1,
          total: results.length,
          name: biz.name
        });
      }

      sendResponse({ data: results });
    })();
    return true; // Indicate async
  }
});