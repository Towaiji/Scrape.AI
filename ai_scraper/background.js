chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'aiScrape') {
    fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3',
        prompt: `Extract structured data from this HTML and return JSON:\n${msg.html}`
      })
    })
      .then(res => res.json())
      .then(data => sendResponse({ result: data.response || data } ))
      .catch(err => sendResponse({ error: err.toString() }));
    return true; // keep port open for async response
  }
});
