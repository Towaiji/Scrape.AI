chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'getHTML') {
    sendResponse({ html: document.documentElement.outerHTML });
  }
});
