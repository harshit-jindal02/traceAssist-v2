FROM python:3.10-slim

# Install git, curl, Docker CLI, and kubectl
RUN apt-get update && \
    apt-get install -y git curl docker.io && \
    # Install kubectl
    curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" && \
    install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl && \
    rm kubectl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies (including OpenTelemetry)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV GIT_PYTHON_GIT_EXECUTABLE=/usr/bin/git

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]