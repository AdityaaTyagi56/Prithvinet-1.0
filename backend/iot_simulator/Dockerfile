FROM python:3.11-slim

WORKDIR /app

# Install build deps for asyncpg, then clean up
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

# State volume mount point (mapped from docker-compose simulator_state volume)
RUN mkdir -p /sim_state

# Run as non-root
RUN useradd -m simuser && chown -R simuser /app /sim_state
USER simuser

CMD ["python", "main.py"]
