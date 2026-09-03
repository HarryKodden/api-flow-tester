FROM python:3.12-slim

ARG TARGETARCH
ARG SOPS_VERSION=v3.10.2

RUN apt-get update && apt-get install -y --no-install-recommends \
        apache2-utils \
        ca-certificates \
        curl \
    && curl -fsSL -o /usr/local/bin/sops \
        "https://github.com/getsops/sops/releases/download/${SOPS_VERSION}/sops-${SOPS_VERSION}.linux.${TARGETARCH}" \
    && chmod +x /usr/local/bin/sops \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY bin/ bin/
COPY tools/ tools/
COPY webapp/ webapp/
COPY examples/ examples/

RUN mkdir -p /app/results \
    && chmod +x /app/bin/loadtest.sh

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app

EXPOSE 9011

CMD ["uvicorn", "webapp.app:app", "--host", "0.0.0.0", "--port", "9011"]
