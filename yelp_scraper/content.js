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
      let allResults = [];
      let pagesToScrape = request.numPages || 1;
      let currentPage = 1;
      let keepGoing = true;

      while (currentPage <= pagesToScrape && keepGoing) {
        // SCRAPE CURRENT PAGE
        const results = [];
        document.querySelectorAll('div[data-testid="scrollable-photos-card"]').forEach(card => {
          const bizLink = card.querySelector('div[data-traffic-crawl-id="SearchResultBizName"] a');
          const href = bizLink?.getAttribute('href') || "";

          // Only include real business cards (skip ads/sponsored)
          if (!href.startsWith("/biz/")) return;

          const name = bizLink?.innerText.trim() || "";
          const profileUrl = `https://www.yelp.com${href}`;

          // ==== NEW: Scrape categories ====
          let categories = "";
          const categoriesDiv = card.querySelector('div[data-testid="serp-ia-categories"]');
          if (categoriesDiv) {
            const categoryList = Array.from(categoriesDiv.querySelectorAll('a > button > span'))
              .map(span => span.innerText.trim())
              .filter(Boolean);
            categories = categoryList.join(", ");
          }

          if (name) {
            results.push({ name, profileUrl, categories });
          }
        });

        // Fetch phone for each business
        for (let i = 0; i < results.length; i++) {
          const biz = results[i];
          biz.phone = await getPhoneNumber(biz.profileUrl);
          chrome.runtime.sendMessage({
            type: "progress",
            current: i + 1,
            total: results.length,
            name: biz.name,
            page: currentPage
          });
        }

        allResults = allResults.concat(results);

        // If more pages to scrape, click "Next"
        if (currentPage < pagesToScrape) {
          const nextBtn = Array.from(document.querySelectorAll('button.pagination-button__09f24__kbFYf'))
            .find(btn => btn.innerText.trim().toLowerCase() === "next page");

          if (nextBtn) {
            nextBtn.click();
            await new Promise(res => setTimeout(res, 3500)); // or longer if Yelp is slow
          } else {
            keepGoing = false; // No more pages
          }
        }
        currentPage++;
      }

      // Remove duplicates by profileUrl
      const uniqueResults = [];
      const seen = new Set();
      for (const biz of allResults) {
        if (!seen.has(biz.profileUrl)) {
          seen.add(biz.profileUrl);
          uniqueResults.push(biz);
        }
      }
      sendResponse({ data: uniqueResults });

    })();
    return true; // Indicate async
  }
});
