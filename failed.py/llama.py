import ollama

prompt = "Extract all book titles and prices from this HTML: <html> ... </html>"
response = ollama.chat(model='llama3', messages=[{'role':'user', 'content': prompt}])
print(response['message']['content'])
