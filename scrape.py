import requests
from bs4 import BeautifulSoup
import pandas as pd

def get_html(url):
    response = requests.get(url)
    if response.status_code != 200:
        raise Exception(f"Failed to load page: {url} (status {response.status_code})")
    return response.text

def manual_css_select(soup, selector, fields):
    data = []
    for item in soup.select(selector):
        row = {}
        for field, field_selector in fields.items():
            el = item.select_one(field_selector)
            row[field] = el.get_text(strip=True) if el else None
        data.append(row)
    return data

def main():
    print("=== Universal Python Web Scraper ===")
    url = input("Enter the website URL: ").strip()
    html = get_html(url)
    soup = BeautifulSoup(html, "html.parser")
    print("Tip: Use browser DevTools (right click > Inspect) to find CSS selectors for your items and fields.")
    selector = input("Enter the CSS selector for each item (e.g., 'article.product_pod'): ").strip()
    fields = {}
    while True:
        field = input("Field name to extract (or press Enter to finish): ").strip()
        if not field:
            break
        field_selector = input(f"CSS selector (relative to item) for '{field}': ").strip()
        fields[field] = field_selector
    data = manual_css_select(soup, selector, fields)
    if data and len(data) > 0:
        df = pd.DataFrame(data)
        filename = input("Enter CSV filename (default: output.csv): ").strip() or "output.csv"
        df.to_csv(filename, index=False)
        print(f"Saved {len(df)} rows to {filename}.")
    else:
        print("No data extracted.")

if __name__ == "__main__":
    main()
