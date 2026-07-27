#!/bin/sh
set -eu

chown -R app:app /data /logs
exec su -s /bin/sh app -c 'exec dotnet ND.ProjectionService.Api.dll'
