#!/bin/bash
set -euo pipefail
echo "Going to build and PUBLISH the OWOP client, press enter to confirm!"
read
set -x
npm run release
rsync -vr --delete --max-delete=1 ./dist/ /var/www/owop/
