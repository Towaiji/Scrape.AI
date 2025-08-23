function display(text) {
  document.getElementById('result').innerText = text;
}

document.getElementById('scrapeBtn').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (!tabs[0]) return;
    chrome.tabs.sendMessage(tabs[0].id, { action: 'getHTML' }, response => {
      if (!response || !response.html) {
        display('Could not get page HTML');
        return;
      }
      chrome.runtime.sendMessage({ action: 'aiScrape', html: response.html }, res => {
        if (res.error) {
          display('Error: ' + res.error);
        } else {
          display(typeof res.result === 'string' ? res.result : JSON.stringify(res.result, null, 2));
        }
      });
    });
  });
});
