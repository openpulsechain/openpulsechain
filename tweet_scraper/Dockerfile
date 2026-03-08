FROM mcr.microsoft.com/playwright/python:v1.49.1-noble
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN playwright install chromium
COPY *.py .
CMD ["python", "scrape_tweets.py"]
