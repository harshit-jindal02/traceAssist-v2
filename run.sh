#!/usr/bin/env bash
set -euo pipefail

# ─── 1. Start Minikube ─────────────────────────────────────────────────────────
echo "🚀 Starting Minikube..."
# minikube delete && minikube start --memory=8192 --cpus=4

# ─── 2. Point Docker to Minikube’s daemon ──────────────────────────────────────
echo "🔧 Configuring Docker to use Minikube..."
eval "$(minikube docker-env)"

# ─── 3. Build TraceAssist Images ───────────────────────────────────────────────
echo "📦 Building TraceAssist backend image..."
docker build -t traceassist-backend:latest backend/
echo "📦 Building TraceAssist frontend image..."
docker build -t traceassist-frontend:latest frontend/

# ─── 4. Create Namespaces ──────────────────────────────────────────────────────
echo "📂 Creating namespaces for observability stack and application..."
kubectl create namespace traceassist || true
kubectl create namespace grafana || true
kubectl create namespace loki || true
kubectl create namespace jaeger || true
kubectl create namespace prometheus || true
kubectl create namespace cert-manager || true

# ─── 5. Install Cert-Manager (dependency for some operators) ───────────────────
echo "🔐 Installing cert-manager..."
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.2/cert-manager.yaml
echo "⏳ Waiting for cert-manager webhook to be ready..."
kubectl -n cert-manager rollout status deployment cert-manager-webhook --timeout=2m

# ─── 6. Install Observability Stack via Helm ───────────────────────────────────
echo "📊 Installing Grafana..."
helm install grafana grafana/grafana -n grafana --set adminPassword='prom-operator' --wait

echo "📜 Installing Loki for logs with custom values..."
helm install loki-stack grafana/loki-stack -n loki -f k8s/loki-values.yaml --wait

echo "⏱️ Installing Prometheus for metrics..."
helm install prometheus prometheus-community/prometheus -n prometheus --wait

echo "🔍 Installing Jaeger for traces..."
helm install jaeger jaegertracing/jaeger -n jaeger --wait

# ─── 7. Install the OpenTelemetry Operator ────────────────────────────────────
echo "🔧 Installing OpenTelemetry Operator..."
helm upgrade --install \
  opentelemetry-operator open-telemetry/opentelemetry-operator \
  --namespace opentelemetry-operator-system --create-namespace \
  --wait --timeout=3m

# ─── 8. Deploy TraceAssist Application and Collector ──────────────────────────
echo "🚀 Deploying TraceAssist application components..."
kubectl -n traceassist apply \
  -f k8s/postgres-secret.yaml \
  -f k8s/backend-secret.yaml \
  -f k8s/traceassist-rbac.yaml \
  -f k8s/otel-collector-config.yaml \
  -f k8s/otel-collector-deployment.yaml \
  -f k8s/backend-deployment.yaml \
  -f k8s/backend-service.yaml \
  -f k8s/frontend-deployment.yaml \
  -f k8s/frontend-service.yaml

# ─── 9. Apply OTel Instrumentation CR ──────────────────────────────────────────
echo "📡 Applying OpenTelemetry Instrumentation resource..."
kubectl apply -f k8s/instrumentation.yaml

# ─── 10. Wait for deployments and start port-forwarding ────────────────────────
echo "⏳ Waiting for TraceAssist deployments to be ready..."
kubectl -n traceassist rollout status deployment traceassist-frontend --timeout=2m
kubectl -n traceassist rollout status deployment traceassist-backend --timeout=2m

echo "🔌 Starting port-forwarding for UI, Backend, and Grafana..."
pkill -f "kubectl port-forward -n" || true

kubectl port-forward -n traceassist svc/traceassist-frontend 5173:5173 &
kubectl port-forward -n traceassist svc/traceassist-backend 8000:8000 &
kubectl port-forward -n grafana svc/grafana 3000:80 &

# ─── 11. Final Instructions ───────────────────────────────────────────────────
echo
echo "✅✅✅ Deployment Complete! ✅✅✅"
echo
echo "🔗 TraceAssist UI is available at: http://localhost:5173"
echo "🔗 Grafana Dashboard is available at: http://localhost:3000"
echo "   (Login: admin / prom-operator)"
echo
echo "NOTE: It may take a few minutes for all services to start."
echo "Use these CORRECTED URLs to configure data sources in Grafana:"
echo "  - Loki: http://loki-stack.loki.svc.cluster.local:3100"
echo "  - Jaeger: http://jaeger-query.jaeger""
echo "  - Prometheus: http://prometheus-server.prometheus"
