#!/usr/bin/env bash
set -euo pipefail

# A script to set up the local development environment for the TraceAssist backend.
# It starts a PostgreSQL database on the host using Docker Compose and deploys
# the backend service to a local Minikube cluster.

echo "🚀 Starting local PostgreSQL database via Docker Compose..."
docker-compose up -d

echo "📦 Starting Minikube..."
minikube start

echo "🔧 Pointing Docker CLI to Minikube's Docker daemon..."
eval "$(minikube docker-env)"

echo "🏗️ Building the TraceAssist backend Docker image..."
# This builds the image directly inside Minikube's Docker environment
docker build -t traceassist-backend:latest ./backend

echo "📂 Creating the 'traceassist' namespace in Minikube..."
kubectl create namespace traceassist || true

echo "🔐 Applying the local PostgreSQL secret to the cluster..."
# We use a separate secret file for local development that points to the host
kubectl apply -f ./k8s/postgres-secret.local.yaml

echo "🚀 Deploying the TraceAssist backend service to Minikube..."
kubectl apply -f ./k8s/backend-deployment.yaml
kubectl apply -f ./k8s/backend-service.yaml

echo "⏳ Waiting for the backend deployment to be ready..."
kubectl -n traceassist rollout status deployment traceassist-backend --timeout=2m

echo "🔌 Starting port-forward to make the service accessible..."
# Kill any previous port-forward processes to avoid conflicts
pkill -f "kubectl port-forward -n traceassist svc/traceassist-backend" || true
kubectl port-forward -n traceassist svc/traceassist-backend 8000:8000 &

echo
echo "✅✅✅ Local setup complete! ✅✅✅"
echo
echo "🔗 The TraceAssist API is now available at: http://localhost:8000"
echo "🔍 You can test the health endpoint with: curl http://localhost:8000/health"
echo "📦 Your local PostgreSQL database is running and accessible on port 5432."
echo
