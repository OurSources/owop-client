#!/bin/bash
rsync -vru --checksum --delete --max-delete=1 ./dist/ root@ourworldofpixels.com:/var/www/owop/
