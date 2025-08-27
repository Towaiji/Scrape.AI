function populateTable(data) {
  const tbody = document.querySelector("#resultsTable tbody");
  tbody.innerHTML = "";
  data.forEach(row => {
    const phoneCell = row.phone ? row.phone : "<span style='color:#aaa'>(not found)</span>";
    const categoryCell = row.categories ? row.categories : "<span style='color:#aaa'>(none)</span>";
    const profileLink = row.profileUrl ? `<a href="${row.profileUrl}" target="_blank">profile</a>` : "<span style='color:#aaa'>(none)</span>";
    const websiteLink = row.website ? `<a href="${row.website}" target="_blank">website</a>` : "<span style='color:#aaa'>(none)</span>";
    const emailsCell = (row.emails && row.emails.length) ? row.emails.join('<br>') : "<span style='color:#aaa'>(none)</span>";

    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${row.name}</td><td>${phoneCell}</td><td>${categoryCell}</td><td>${profileLink}</td><td>${websiteLink}</td><td>${emailsCell}</td>`;
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
      ["Name", "Phone", "Categories", "Profile URL", "Website", "Emails"],
      ...data.map(r => [
        `"${(r.name || '').replace(/"/g,'""')}"`,
        `"${(r.phone || '').replace(/"/g,'""')}"`,
        `"${(r.categories || '').replace(/"/g,'""')}"`,
        `"${(r.profileUrl || '').replace(/"/g,'""')}"`,
        `"${(r.website || '').replace(/"/g,'""')}"`,
        `"${((r.emails || []).join(' | ')).replace(/"/g,'""')}"`
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
