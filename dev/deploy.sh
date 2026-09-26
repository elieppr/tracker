#!/bin/sh
# Pushes apps-script/ to Google and points the existing web app deployments at the new
# code, so their URLs stay the same. Run with: npm run deploy
# Needs .clasp.json (which script) and .deployment.json (which deployments); see README.
set -e
cd "$(dirname "$0")/.."

if [ ! -f .clasp.json ] || [ ! -f .deployment.json ]; then
    echo "Missing .clasp.json or .deployment.json. See 'Deploying from the terminal' in README.md." >&2
    exit 1
fi

npx clasp push --force
DESCRIPTION="Deployed $(date '+%Y-%m-%d %H:%M')"
for ID in $(node -p "require('./.deployment.json').deploymentIds.join(' ')"); do
    npx clasp redeploy "$ID" --description "$DESCRIPTION"
done
echo "Done. Web app URLs are unchanged; reload the tracker to use the new version."
