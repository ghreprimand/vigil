#!/bin/sh
set -e

# The server auto-applies database migrations at startup, so no separate
# migrate step is needed here.
exec node dist/server.js
