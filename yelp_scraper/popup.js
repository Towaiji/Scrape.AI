function populateTable(data) {
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
  document.getElementById("resultsTable").style.display = data.length ? "" : "none";
  document.getElementById("downloadBtn").style.display = data.length ? "" : "none";
}

function renderFromStorage() {
  chrome.storage.local.get(["status", "results"], ({ status, results }) => {
    if (status) document.getElementById("status").innerText = status;
    if (results && results.length) {
      populateTable(results);
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  renderFromStorage();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") {
    if (changes.status) {
      document.getElementById("status").innerText = changes.status.newValue || "";
    }
    if (changes.results) {
      populateTable(changes.results.newValue || []);
    }
  }
});

document.getElementById("scrapeBtn").addEventListener("click", async () => {
  document.getElementById("status").innerText = "Scraping...";
  const numPages = parseInt(document.getElementById("numPages").value) || 1;
  chrome.runtime.sendMessage({ action: "startScrape", numPages });
});

document.getElementById("downloadBtn").addEventListener("click", () => {
  chrome.storage.local.get("results", ({ results }) => {
    const data = results || [];
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
  });
});