#!/usr/bin/env bash
docker run --name da_frontend -d --rm --network da_backend -p 13080:13080 -e BACKEND_ORIGIN=http://da_backend:18080 da-frontend:0.0.1
