#!/usr/bin/env bash
set -euo pipefail

# A script to deploy the TraceAssist backend service to a production
# Azure Kubernetes Service (AKS) cluster.

# --- ⚠️ CONFIGURATION REQUIRED ⚠️ ---
# Please edit these variables to match your Azure environment.
# ---------------------------------------------------------
ACR_NAME="yourACRName"                # The name of your Azure Container Registry
AKS_CLUSTER_NAME="yourAKSClusterName" # The name of your AKS cluster
RESOURCE_GROUP="yourResourceGroup"    # The Azure resource group for your ACR and AKS
IMAGE_NAME="traceassist-backend"      # The name of the Docker image
NAMESPACE="traceassist"               # The Kubernetes namespace for deployment
# ---------------------------------------------------------

# --- Step 1: Login and Prerequisites Check ---
echo "🔍 Checking for Azure CLI (az) and kubectl..."
if ! command -v az &> /dev/null || ! command -v kubectl &> /dev/null; then
    echo "Error: 'az' and 'kubectl' are required. Please install them first."
    exit 1
fi

echo "🔐 Logging into Azure..."
az login

echo "🔧 Setting the active Azure subscription..."
# You can list subscriptions with `az account list`
# az account set --subscription "Your-Subscription-ID"

# --- Step 2: Build and Push Docker Image to ACR ---
echo "🏗️ Building the Docker image..."
docker build -t $IMAGE_NAME:latest ./backend

echo "🔐 Logging into Azure Container Registry: $ACR_NAME..."
az acr login --name $ACR_NAME

ACR_LOGIN_SERVER=$(az acr show --name $ACR_NAME --query loginServer --output tsv)
IMAGE_TAG="$ACR_LOGIN_SERVER/$IMAGE_NAME:$(date +%Y%m%d%H%M%S)"

echo "🏷️ Tagging image as: $IMAGE_TAG"
docker tag $IMAGE_NAME:latest $IMAGE_TAG

echo "🚀 Pushing image to ACR..."
docker push $IMAGE_TAG

# --- Step 3: Deploy to AKS ---
echo "🔗 Connecting kubectl to your AKS cluster: $AKS_CLUSTER_NAME..."
az aks get-credentials --resource-group $RESOURCE_GROUP --name $AKS_CLUSTER_NAME --overwrite-existing

echo "📂 Creating the '$NAMESPACE' namespace in AKS (if it doesn't exist)..."
kubectl create namespace $NAMESPACE || true

echo "🔐 IMPORTANT: Applying production secrets..."
echo "Please ensure your 'k8s/postgres-secret.yaml' contains the correct production DATABASE_URL."
read -p "Press [Enter] to continue after verifying the secret file..."
kubectl apply -f ./k8s/postgres-secret.yaml

echo "🚀 Deploying the TraceAssist backend to AKS..."
# IMPORTANT: We use sed to replace the placeholder image in the deployment file with our newly pushed image.
# This avoids having to manually edit the file each time.
sed "s|image: your-registry/traceassist-backend:latest|image: $IMAGE_TAG|g" ./k8s/backend-deployment.yaml | kubectl apply -f -

# Apply the service manifest as is
kubectl apply -f ./k8s/backend-service.yaml

echo "⏳ Waiting for the production deployment to be ready..."
kubectl -n $NAMESPACE rollout status deployment traceassist-backend --timeout=5m

# --- Step 4: Final Instructions ---
echo
echo "✅✅✅ Production deployment to AKS is complete! ✅✅✅"
echo
echo "➡️ Next Steps:"
echo "1. Your service is running inside the AKS cluster."
echo "2. To expose it to the internet, you must set up an Ingress controller (like NGINX) and create an Ingress resource."
echo "3. Point your public DNS record (e.g., api.traceassist.io) to the public IP of your Ingress controller."
echo
