# TraceAssist Instrumentation Service (Backend)

This repository contains the backend service for TraceAssist, a powerful API that automatically instruments Kubernetes manifests for OpenTelemetry. This service is designed to be deployed to a Kubernetes cluster and consumed by the public `traceassist-action` GitHub Action.

---

## 🏛️ Architecture

This service is a **FastAPI** application that provides a single, critical API endpoint:

* **`POST /workflow/instrument`**: Receives the raw text content of a Kubernetes manifest, intelligently injects the necessary annotations for OpenTelemetry auto-instrumentation, and returns the modified manifest content.

The service is stateless by design, but it requires a **PostgreSQL** database for potential future features like API key management, client tracking, or usage metrics.

---

## 🚀 Deployment

This service is designed to be deployed as a container in a Kubernetes cluster.

### Prerequisites

* A running Kubernetes cluster (e.g., GKE, EKS, AKS).
* `kubectl` configured to connect to your cluster.
* A running PostgreSQL database accessible from the cluster.
* An Ingress controller (like NGINX) to expose the service to the internet.

### Setup and Deployment Steps

1.  **Build the Docker Image**
    From the root of this repository, build the Docker image and push it to a container registry (e.g., Docker Hub, GCR, GHCR).
    ```sh
    docker build -t your-registry/traceassist-backend:latest ./backend
    docker push your-registry/traceassist-backend:latest
    ```

2.  **Configure Secrets**
    You must create a Kubernetes secret to hold the database connection string.
    * Create a file named `postgres-secret.yaml`:
        ```yaml
        apiVersion: v1
        kind: Secret
        metadata:
          name: postgres-secret
          namespace: traceassist # Or your desired namespace
        type: Opaque
        stringData:
          DATABASE_URL: "postgresql://USER:PASSWORD@HOST:PORT/DATABASE"
        ```
    * Apply the secret to your cluster:
        ```sh
        kubectl apply -f postgres-secret.yaml
        ```

3.  **Deploy the Backend Service**
    * Modify the `k8s/backend-deployment.yaml` file to use the correct image from your container registry.
    * Apply the deployment and service manifests:
        ```sh
        kubectl apply -f ./k8s/backend-deployment.yaml
        kubectl apply -f ./k8s/backend-service.yaml
        ```

4.  **Expose the Service**
    Create an Ingress resource to expose the `traceassist-backend` service to the internet with a stable hostname (e.g., `api.traceassist.io`). This will be the URL that your clients use in the GitHub Action.

    * Create a file named `ingress.yaml`:
        ```yaml
        apiVersion: networking.k8s.io/v1
        kind: Ingress
        metadata:
          name: traceassist-ingress
          namespace: traceassist
        spec:
          rules:
          - host: api.your-traceassist-service.com
            http:
              paths:
              - path: /
                pathType: Prefix
                backend:
                  service:
                    name: traceassist-backend
                    port:
                      number: 8000
        ```
    * Apply the Ingress to your cluster:
        ```sh
        kubectl apply -f ingress.yaml
        ```

---

## 🔧 Local Development

For local development and testing, you can use the provided `docker-compose.yaml` file to quickly spin up a PostgreSQL database.

1.  **Start the Database**:
    ```sh
    docker-compose up -d
    ```

2.  **Set Environment Variables**:
    Create a `.env` file in the `backend/` directory with the `DATABASE_URL`:
    ```
    DATABASE_URL="postgresql://traceassist_user:your_strong_password@localhost:5432/traceassist_db"
    ```

3.  **Run the FastAPI Server**:
    ```sh
    cd backend/
    uvicorn main:app --reload
    ```
    The API will be available at `http://localhost:8000`.

---

## API Endpoints

* **`POST /workflow/instrument`**: Instruments a Kubernetes manifest.
* **`GET /health`**: A simple health check endpoint that returns `{"status": "ok"}`.






Okay can you also make one readme file for my priv traceAssist code! also i need raw format for it! in canvas ensure -> sing type="text/markdown" was causing the canvas to render the content instead of showing you the raw source. I will now use type="code" to ensure it displays correctly as a raw text block.