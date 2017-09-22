#!/bin/bash
cd dist/
rsync -vru --delete --max-delete=1 * root@ourworldofpixels.com:/var/www/html/beta/
