#!/usr/bin/env bash
# Build the static app and ship it (plus any infra change) via CDK: S3 upload
# and CloudFront invalidation. Whether the stack owns bike-my-day.korist.se is
# the `cutover` value in infra/cdk.json, not a flag, so no deploy can flip it
# by accident.
set -euo pipefail
cd "$(dirname "$0")/../apps/web"
npm ci
npm run check
npm test
npm run build
cd ../../infra
npx aws-cdk deploy BikeMyDayCert BikeMyDay --require-approval never
