FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
        apache2-utils \
        ca-certificates \
        curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY bin/ bin/
COPY tools/ tools/
COPY webapp/ webapp/
COPY examples/ examples/

RUN mkdir -p /app/results \
    && chmod +x /app/bin/test.sh

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app

EXPOSE 8080

CMD ["uvicorn", "webapp.app:app", "--host", "0.0.0.0", "--port", "8080"]
