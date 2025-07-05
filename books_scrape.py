import requests
from bs4 import BeautifulSoup
import pandas as pd

url = 'https://books.toscrape.com/'
response = requests.get(url)
soup = BeautifulSoup(response.text, 'html.parser')

data = []
for item in soup.select('article.product_pod'):
    title = item.h3.a['title']
    price = item.select_one('.price_color').get_text(strip=True)
    data.append({'title': title, 'price': price})

df = pd.DataFrame(data)
df.to_csv('output.csv', index=False)
print("Scraping done! Check output.csv.")
