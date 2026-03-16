#!/bin/bash
set -euo pipefail

# Echo Coach - GCP Setup Script

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
  echo "Usage: ./setup-gcp.sh <your-desired-project-id> [--assume-billing-linked]"
  exit 1
fi

PROJECT_ID=$1
REGION="us-central1"
ASSUME_BILLING_LINKED="${2:-}"

if [ -n "$ASSUME_BILLING_LINKED" ] && [ "$ASSUME_BILLING_LINKED" != "--assume-billing-linked" ]; then
  echo "Usage: ./setup-gcp.sh <your-desired-project-id> [--assume-billing-linked]"
  exit 1
fi

echo "=== Starting GCP Setup for $PROJECT_ID ==="

# 1. Create the project (Will fail if it already exists, which is fine)
echo "Creating GCP project $PROJECT_ID..."
gcloud projects create $PROJECT_ID || echo "Project might already exist. Continuing..."

# 2. Set the active project
gcloud config set project $PROJECT_ID

echo "IMPORTANT: Before continuing, please ensure you have linked a Billing Account to this project."
echo "You can do this in the Google Cloud Console: https://console.cloud.google.com/billing"

if [ "$ASSUME_BILLING_LINKED" != "--assume-billing-linked" ]; then
  read -r -p "Press enter to continue once billing is linked..."
fi

# 3. Enable necessary APIs
echo "Enabling required APIs (Cloud Run, Firestore, Gemini API, Speech-to-Text)..."
gcloud services enable \
  run.googleapis.com \
  firestore.googleapis.com \
  speech.googleapis.com \
  generativelanguage.googleapis.com

# 4. Create Firestore Database (Native mode)
echo "Creating Firestore database..."
gcloud firestore databases create --location=$REGION --type=firestore-native || echo "Database might already exist. Continuing..."

# 5. Create a Service Account for the backend
SA_NAME="echo-coach-backend"
SA_EMAIL="$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"

echo "Creating Service Account: $SA_NAME..."
gcloud iam service-accounts create $SA_NAME \
    --description="Backend service account for Echo Coach" \
    --display-name="Echo Coach Backend" || echo "Service account might already exist."

# 6. Grant necessary roles to the Service Account
echo "Granting roles to Service Account..."
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SA_EMAIL" \
    --role="roles/datastore.user"

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SA_EMAIL" \
    --role="roles/speech.client"

echo "=== GCP Setup Complete ==="
echo "Your project $PROJECT_ID is ready for deployment."
echo "Backend service account: $SA_EMAIL"
echo "Tip: Re-run non-interactively with: ./setup-gcp.sh $PROJECT_ID --assume-billing-linked"
