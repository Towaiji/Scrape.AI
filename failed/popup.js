document.getElementById('start').onclick = async function() {
  document.getElementById('status').innerText = 'Scraping...';
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      function: () => { window.startYelpScraper && window.startYelpScraper(); }
    });
  });
};

document.getElementById('download').onclick = function() {
  chrome.storage.local.get('yelpResults', function(result) {
    const rows = result.yelpResults || [];
    let csv = 'Name,Address,Phone,Reviews\n';
    for (const r of rows) {
      csv += `"${r.name.replace(/"/g,'""') || ''}","${r.address.replace(/"/g,'""') || ''}","${r.phone.replace(/"/g,'""') || ''}","${r.reviews || ''}"\n`;
    }
    const blob = new Blob([csv], {type: 'text/csv'});
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({
      url: url,
      filename: 'yelp_results.csv'
    });
  });
};

// Listen for completion from content script
chrome.runtime.onMessage.addListener((msg) => {
  if(msg && msg.scrapingDone) {
    document.getElementById('status').innerText = 'Done!';
    document.getElementById('download').style.display = 'block';
  }
});
