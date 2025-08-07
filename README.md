# TraceAssist Instrumentation Service (Backend)

This repository contains the private backend service for TraceAssist, a powerful API that automatically instruments Kubernetes manifests for OpenTelemetry. This service is designed to be deployed to a Kubernetes cluster and consumed by the public `traceassist-action` GitHub Action.

---

## 🏛️ Architecture

This service is a **FastAPI** application that provides a single, critical API endpoint:

* **`POST /workflow/instrument`**: Receives the raw text content of a Kubernetes manifest, intelligently injects the necessary annotations for OpenTelemetry auto-instrumentation, and returns the modified manifest content.

The service itself is stateless, but it requires a **PostgreSQL** database for logging anonymous usage analytics.

---

## 🚀 Production Deployment (Kubernetes)

This service is designed to be deployed as a container in a Kubernetes cluster.

### Prerequisites

* A running Kubernetes cluster (e.g., GKE, EKS, AKS).
* `kubectl` configured to connect to your cluster.
* A running PostgreSQL database accessible from the cluster.
* An Ingress controller (like NGINX) to expose the service to the internet.

### 1. Data Persistence for PostgreSQL (Production)

For a production environment, you must ensure your PostgreSQL database has persistent storage. If you are deploying a PostgreSQL instance within your Kubernetes cluster, you should use a `PersistentVolumeClaim`.

* Create a file named `postgres-pvc.yaml`:
    ```yaml
    apiVersion: v1
    kind: PersistentVolumeClaim
    metadata:
      name: postgres-pvc
      namespace: traceassist # Or your desired namespace
    spec:
      accessModes:
        - ReadWriteOnce
      resources:
        requests:
          storage: 10Gi # Adjust storage size as needed
    ```
* Apply it to your cluster: `kubectl apply -f postgres-pvc.yaml`.
* Ensure your PostgreSQL deployment (e.g., from a Helm chart) is configured to use this `PersistentVolumeClaim`.

### 2. Build and Push the Docker Image

From the root of this repository, build the Docker image and push it to a container registry (e.g., Docker Hub, GCR, GHCR).
```sh
docker build -t your-registry/traceassist-backend:latest ./backend
docker push your-registry/traceassist-backend:latest
```

### 3. Configure and Deploy the Service

* **Create Secrets**: Create a Kubernetes secret named `postgres-secret` containing the `DATABASE_URL` for your production database.
* **Update Deployment**: Modify the `k8s/backend-deployment.yaml` file to use the correct image from your container registry.
* **Apply Manifests**:
    ```sh
    kubectl apply -f ./k8s/backend-deployment.yaml
    kubectl apply -f ./k8s/backend-service.yaml
    ```

### 4. Expose the Service via Ingress

Create an Ingress resource to expose the `traceassist-backend` service to the internet with a stable hostname (e.g., `api.traceassist.io`). This will be the URL your clients use.

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
* Apply the Ingress: `kubectl apply -f ingress.yaml`

---

## 🔧 Local Development

For local development and testing, you can use the provided `docker-compose.yaml` file to quickly spin up a PostgreSQL database. **This is for development only.**

1.  **Start the Local Database**:
    The `docker-compose.yaml` file is configured with a persistent volume, so your local data will be saved across restarts.
    ```sh
    docker-compose up -d
    ```

2.  **Set Environment Variables**:
    Create a `.env` file in the `backend/` directory with the local `DATABASE_URL`:
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
