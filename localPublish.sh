#!/bin/bash
set -euo pipefail
echo "Going to build and PUBLISH the OWOP client, press enter to confirm!"
read
set -x
npm run release
su -c "rsync -vr --delete --max-delete=1 $(pwd)/dist/ /var/www/ourworldofpixels.com/" -
