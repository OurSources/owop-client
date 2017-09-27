#!/bin/bash
cd dist/
rsync -vru --checksum --delete --max-delete=2 * root@ourworldofpixels.com:/var/www/html/beta/
