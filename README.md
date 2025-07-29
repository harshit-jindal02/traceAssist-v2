# TraceAssist: Automated Observability for Kubernetes

**TraceAssist is a powerful automation tool for SREs and DevOps engineers designed to dramatically simplify the process of instrumenting and deploying applications into a Kubernetes environment.**

Gone are the days of manually creating Dockerfiles, wrestling with Kubernetes manifests, and figuring out how to inject observability. TraceAssist takes your existing application source code from a Git repository, intelligently modifies its deployment configurations for auto-instrumentation with OpenTelemetry, and deploys it to a local Minikube cluster—all through a simple web interface.

---

## ✨ Core Features

* **Git-Powered Workflow**: Simply provide a URL to a public or private GitHub repository.
* **Bring Your Own Config**: Uses your application's own `Dockerfile` and `deployment.yaml` files, adapting to your existing setup.
* **Intelligent Manifest Modification**: Automatically injects the necessary OpenTelemetry annotations and a `serviceAccountName` into your Kubernetes `Deployment` manifests for seamless instrumentation.
* **Persistent Deployment History**: All deployment activities are logged in a PostgreSQL database, providing a complete history of instrumented applications directly in the UI.
* **Local-First Environment**: Deploys everything to a local Minikube cluster, perfect for safe and rapid development and testing.
* **Automated Setup & Cleanup**: Comes with simple `run.sh` and `cleanup.sh` scripts to build, deploy, and tear down the entire environment with single commands.

---

## 🛠️ Tech Stack

* **Frontend**: React, Material-UI, Axios
* **Backend**: Python 3.10, FastAPI, SQLAlchemy
* **Database**: PostgreSQL
* **Orchestration**: Kubernetes (Minikube), Docker, Docker Compose
* **Observability**: OpenTelemetry Operator

---

## ⚙️ How It Works

TraceAssist follows a simple, automated workflow:

1.  **Input**: A user provides a Git repository URL, a unique deployment name, and an optional GitHub PAT for private repos.
2.  **Clone & Record**: The backend clones the repository and creates a record of the deployment in the PostgreSQL database.
3.  **Build**: It finds the `Dockerfile` in the user's repo and builds a new Docker image, tagging it with the unique deployment name.
4.  **Analyze & Modify**: The backend locates the Kubernetes manifest files (`*.yaml`) in the repository. It intelligently parses these files to:
    * Rename the `Deployment` and `Service` resources to match the user's unique deployment name.
    * Update all necessary labels and selectors.
    * Inject the correct Docker image name and set `imagePullPolicy: Never`.
    * Inject the `serviceAccountName: traceassist-sa` for RBAC permissions.
    * Inject the OpenTelemetry annotations (`instrumentation.opentelemetry.io/inject: "true"`) into the pod template.
5.  **Deploy**: The modified manifests are applied to the `traceassist` namespace in the Minikube cluster.
6.  **Instrument**: The OpenTelemetry Operator detects the annotations and automatically injects the instrumentation sidecar into the application's pods as they start.

---

## 🚀 Getting Started

Follow these steps to get TraceAssist running on your local machine.

### Prerequisites

Ensure you have the following tools installed:
* Docker & Docker Compose
* Minikube
* `kubectl` (Kubernetes CLI)
* Helm (Kubernetes Package Manager)

### Setup Instructions

1.  **Clone the Repository**
    ```bash
    git clone <your-repo-url>
    cd traceAssist
    ```

2.  **Start the Local PostgreSQL Database**
    This command will start a PostgreSQL container in the background.
    ```bash
    docker-compose up -d
    ```

3.  **Configure Secrets**
    You need to provide credentials for your database and GitHub.
    * **PostgreSQL**: Open `k8s/postgres-secret.yaml` and ensure the `DATABASE_URL` matches the credentials in your `docker-compose.yaml` file. For Docker Desktop on Mac/Windows, `host.docker.internal` is the correct hostname.
        ```yaml
        # k8s/postgres-secret.yaml
        stringData:
          DATABASE_URL: "postgresql://traceassist_user:your_strong_password@host.docker.internal:5432/traceassist_db"
        ```
    * **GitHub PAT**: Open `k8s/backend-secret.yaml` and paste your GitHub Personal Access Token. This is required for cloning private repositories and avoiding rate limits on public ones.
        ```yaml
        # k8s/backend-secret.yaml
        stringData:
          PAT_TOKEN: "<your_github_pat>"
        ```

4.  **Run the Deployment Script**
    This script will build all the necessary images, set up the Kubernetes cluster, and deploy TraceAssist.
    ```bash
    ./run.sh
    ```

5.  **Access the Application**
    Once the script finishes, it will provide the URL to access the TraceAssist UI.
    ```
    ✅ All components are up and port-forwarding is active.
    🔗 Access the TraceAssist UI at:
       http://localhost:5173
    ```
    Open `http://localhost:5173` in your browser to start using the application.

---

## 🧹 Cleanup

To stop the application and remove all created resources (Kubernetes deployments, Docker images, etc.), simply run the cleanup script:

```bash
./cleanup.sh
To stop the PostgreSQL container, run:docker-compose down
