// Listen for progress updates from content.js
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message.type === "progress") {
    document.getElementById("status").innerText =
      `Scraping page ${message.page} — ${message.current} of ${message.total}: ${message.name}`;
  }
});


document.getElementById("scrapeBtn").addEventListener("click", async () => {
  document.getElementById("status").innerText = "Scraping...";
  const numPages = parseInt(document.getElementById("numPages").value) || 1;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { action: "scrapeYelp", numPages }, (response) => {
      if (chrome.runtime.lastError || !response) {
        document.getElementById("status").innerText = "Error: Could not scrape. Make sure you're on a Yelp search page.";
        return;
      }
      const data = response.data;
      if (data.length === 0) {
        document.getElementById("status").innerText = "No results found.";
        return;
      }
      document.getElementById("status").innerText = `Found ${data.length} results.`;
      const tbody = document.querySelector("#resultsTable tbody");
      tbody.innerHTML = "";
      data.forEach(row => {
        const phoneCell = row.phone ? row.phone : "<span style='color:#aaa'>(not found)</span>";
        const categoryCell = row.categories ? row.categories : "<span style='color:#aaa'>(none)</span>";
        const profileLink = `<a href="${row.profileUrl}" target="_blank">profile</a>`;
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${row.name}</td><td>${phoneCell}</td><td>${categoryCell}</td><td>${profileLink}</td>`;
        tbody.appendChild(tr);
      });
      document.getElementById("resultsTable").style.display = "";
      document.getElementById("downloadBtn").style.display = "";
      document.getElementById("downloadBtn").onclick = function () {
        const csvRows = [
          ["Name", "Phone", "Categories", "Profile URL"],
          ...data.map(r => [
            `"${r.name}"`,
            `"${r.phone || ''}"`,
            `"${r.categories || ''}"`,
            `"${r.profileUrl}"`
          ])
        ];
        const csv = csvRows.map(row => row.join(",")).join("\n");
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "yelp_results.csv";
        a.click();
        URL.revokeObjectURL(url);
      };
    });
  });
});