# Deploying the frontend

Runs on **port 13080**, next to `da-backend` on 18080.

The port is chosen to pair mnemonically with the backend's 18080 and to sit
in the 10000-32767 band: above the registered-service range, and below the
Linux ephemeral range (32768-60999), so the kernel will never assign it to an
outbound connection and take it from us. Confirm it is free before the first
run -- `sudo ss -lntp | grep 13080` should print nothing.

## Before you deploy: login

People log in through the DICE single sign-on, and the app is served under the
path `/data-agent`. Two things follow.

**Deploy this version only after the backend with authorization is running.**
This version makes the backend reachable from the DICE address, through
`/data-agent/backend/...`. Nothing in this app checks who is calling: it
passes the caller's pass on, and the backend decides. A backend that does not
check passes yet would answer anyone.

**The app works only behind the DICE address.** Open it as

```
https://dice.gtrai.sec.samsung.net/data-agent
```

The gateway sends `/data-agent` and `/data-agent/...` to this container on port
13080 with the path unchanged, and `/auth/...` to the DICE login service.
Opened directly as `http://10.240.35.173:13080/data-agent`, the page loads but
stops at "Could not check your login": the login service and its cookie exist
only on the DICE address. That direct address is still good for one thing,
checking that the container is up:

```bash
curl -I http://10.240.35.173:13080/data-agent/chat/new   # 200 when it is running
```

How the login works is described in [`STRUCTURE.md`](STRUCTURE.md#login).

## On the server

```bash
cd ~/projects/<your-repo-dir>
git clone <cosmo-data-agent-frontend-url>
cd cosmo-data-agent-frontend

sudo docker build -t da-frontend:0.0.1 .
sudo bash ./run_da_frontend.sh
```

Then open `https://dice.gtrai.sec.samsung.net/data-agent` (see
[Before you deploy: login](#before-you-deploy-login)).

### Compared to the backend

Same two commands, in the same order. The only difference is where you stand
when you run them.

| | Backend | Frontend |
| --- | --- | --- |
| clone | `git clone <cosmo-da-backend-url>` | `git clone <cosmo-data-agent-frontend-url>` |
| | *(stay in the parent directory)* | **`cd cosmo-data-agent-frontend`** |
| build | `sudo docker build -t da-backend:0.0.1 .` | `sudo docker build -t da-frontend:0.0.1 .` |
| run | `sudo bash ./run_da_backend.sh` | `sudo bash ./run_da_frontend.sh` |
| port | 18080 | 13080 |
| config | `config.yaml`, placed by hand beside the repo | build args and `-e` flags, already in the run script |

The backend builds from the parent directory because its `Dockerfile`,
`config.yaml`, and run script sit *beside* the cloned repo. The frontend's
`Dockerfile` and `run_da_frontend.sh` are committed *inside* the repo, so
`git clone` brings them along and the build context is the repo itself -- hence
the extra `cd`.

## Configuration

| Variable | When it applies | How to set |
| --- | --- | --- |
| `BACKEND_ORIGIN` | run time | `-e BACKEND_ORIGIN=...` in `run_da_frontend.sh` |
| `NEXT_PUBLIC_APP_TITLE` | build time | `--build-arg NEXT_PUBLIC_APP_TITLE="..."` |
| `NEXT_PUBLIC_MAX_INPUT_LENGTH` | build time | `--build-arg NEXT_PUBLIC_MAX_INPUT_LENGTH=...` |
| `NEXT_PUBLIC_BASE_PATH` | build time | `--build-arg NEXT_PUBLIC_BASE_PATH=...`, default `/data-agent` |

`NEXT_PUBLIC_*` values are inlined into the JavaScript bundle by Next.js, so
changing them needs a rebuild. `BACKEND_ORIGIN` is read on every request and
only needs a container restart.

`NEXT_PUBLIC_BASE_PATH` is the path the app is served under. The default,
`/data-agent`, is what the gateway is set up for, so a plain `docker build`
needs no build arg. It has to match the gateway rule exactly: the gateway does
not remove the path, and the app answers under that path only -- every other
address, the top of the site included, is a 404. Leading slash, no trailing
slash.

There is no login setting. This app holds no secret and checks no pass; it
passes the `Authorization` header of each request on to the backend.

## Why there is no CORS to configure

The browser never calls the backend. Every request goes to the frontend's own
origin and is forwarded server-side:

```
browser -> <DICE address>/data-agent/backend/apps/users/... -> BACKEND_ORIGIN/apps/users/...
browser -> <DICE address>/data-agent/backend/auth/me        -> BACKEND_ORIGIN/auth/me
browser -> <DICE address>/data-agent/api/chat               -> BACKEND_ORIGIN/apps/users/.../run
```

The proxy is `src/app/backend/[...path]/route.ts`. Because everything is
same-origin, there are no preflight requests and the backend needs no
`allow_origins` entry for the frontend, in any browser.

Both routes pass three request headers on to the backend unchanged:
`Authorization` (the pass), and `User-Agent` and `X-Forwarded-For`, which the
backend records with each visit. Neither route logs the `Authorization`
header.

The run script joins the `da_backend` Docker network and reaches the backend as
`http://da_backend:18080`, so backend traffic never leaves the host. If the
backend ever moves off that network, drop `--network da_backend` and use
`-e BACKEND_ORIGIN=http://10.240.35.173:18080`.

## Logging

There is no `logs/` directory and no volume mount, unlike the backend. Nothing
in this app writes log files -- Next.js logs to stdout, which Docker captures.

```bash
sudo docker logs -f da_frontend
```

What you will and will not see there:

- **Server-side**, and therefore in `docker logs`: the `console` calls in
  `src/app/api/chat/route.ts` and `src/app/backend/[...path]/route.ts`, plus
  Next.js's own request logging.
- **Browser-side**, and therefore *not* on the server at all: the `console.error`
  calls in `src/components/**`. Those are `"use client"` components, so they run
  in the visitor's browser and land in their devtools console. No volume mount
  can capture them; ask the user for a devtools screenshot instead.

Note that `--rm` deletes the captured log file when the container stops, so
frontend logs do not survive a restart the way the backend's do. See below.

## Operations

```bash
sudo docker logs -f da_frontend      # follow logs
sudo docker stop da_frontend         # --rm means stopping also removes it
```

To deploy a change:

```bash
cd ~/projects/<your-repo-dir>/cosmo-data-agent-frontend
git pull
sudo docker stop da_frontend
sudo docker build -t da-frontend:0.0.1 .
sudo bash ./run_da_frontend.sh
```

### Making it survive reboots

The container runs with `--rm`, matching the backend, so it does **not** come
back after a reboot, and its logs are discarded on every stop. `--rm` and
`--restart` cannot be combined, so fixing both means replacing the `docker run`
line in `run_da_frontend.sh` with:

```bash
docker run --name da_frontend -d --restart unless-stopped \
  --log-opt max-size=10m --log-opt max-file=3 \
  --network da_backend -p 13080:13080 \
  -e BACKEND_ORIGIN=http://da_backend:18080 da-frontend:0.0.1
```

The `--log-opt` flags cap log growth at 30 MB; without `--rm` to clean up, the
default `json-file` driver would otherwise grow without bound. Redeploying then
needs `sudo docker rm -f da_frontend` instead of `sudo docker stop`.

## If the port is not reachable from other machines

The gateway has to reach port 13080 on this host.

```bash
sudo ss -lntp | grep 13080                              # container port published?
sudo firewall-cmd --add-port=13080/tcp --permanent      # RHEL / CentOS
sudo firewall-cmd --reload
sudo ufw allow 13080/tcp                                # Ubuntu
```
