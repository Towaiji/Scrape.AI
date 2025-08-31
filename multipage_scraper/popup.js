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

document.getElementById("openBtn").addEventListener("click", () => {
  const site = document.getElementById("siteSelect").value;
  const keyword = encodeURIComponent(document.getElementById("keyword").value || "");
  const location = encodeURIComponent(document.getElementById("location").value || "");
  let url = "";
  if (site === "yelp") {
    url = `https://www.yelp.com/search?find_desc=${keyword}&find_loc=${location}`;
  } else if (site === "yellowpages") {
    url = `https://www.yellowpages.com/search?search_terms=${keyword}&geo_location_terms=${location}`;
  } else if (site === "googlemaps") {
    url = `https://www.google.com/maps/search/${keyword}+${location}`;
  }
  if (url) {
    chrome.tabs.create({ url });
  }
});

document.getElementById("scrapeBtn").addEventListener("click", async () => {
  document.getElementById("status").innerText = "Scraping...";
  const site = document.getElementById("siteSelect").value;
  chrome.runtime.sendMessage({ action: "startScrape", site });
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
        `"${r.profileUrl || ''}"`
      ])
    ];
    const csv = csvRows.map(row => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "scrape_results.csv";
    a.click();
    URL.revokeObjectURL(url);
  });
});