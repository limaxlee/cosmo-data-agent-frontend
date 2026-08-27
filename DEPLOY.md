# Deploying the frontend

Runs on **port 13080**, next to `da-backend` on 18080.

## On the server

```bash
cd ~/projects/<your-repo-dir>
git clone <cosmo-data-agent-frontend-url>
cd cosmo-data-agent-frontend

sudo docker build -t da-frontend:0.0.1 .
sudo bash ./run_da_frontend.sh
```

Open `http://10.240.35.173:13080` from any machine on the network.

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

`NEXT_PUBLIC_*` values are inlined into the JavaScript bundle by Next.js, so
changing them needs a rebuild. `BACKEND_ORIGIN` is read on every request and
only needs a container restart.

## Why there is no CORS to configure

The browser never calls the backend. Every request goes to the frontend's own
origin and is forwarded server-side:

```
browser -> 10.240.35.173:13080/backend/apps/users/... -> BACKEND_ORIGIN/apps/users/...
browser -> 10.240.35.173:13080/api/chat              -> BACKEND_ORIGIN/apps/users/.../run
```

The proxy is `src/app/backend/[...path]/route.ts`. Because everything is
same-origin, there are no preflight requests and the backend needs no
`allow_origins` entry for the frontend, in any browser.

The run script joins the `da_backend` Docker network and reaches the backend as
`http://da_backend:18080`, so backend traffic never leaves the host. If the
backend ever moves off that network, drop `--network da_backend` and use
`-e BACKEND_ORIGIN=http://10.240.35.173:18080`.

## Operations

```bash
sudo docker logs -f da_frontend      # application logs (stdout)
sudo docker stop da_frontend         # --rm means stopping also removes it
```

To rebuild after a change: `git pull`, `sudo docker stop da_frontend`, then
build and run again.

The container runs with `--rm`, matching the backend, so it does **not** survive
a reboot. To make it persistent, swap `--rm` for `--restart unless-stopped` in
`run_da_frontend.sh`.

## If the port is not reachable from other machines

```bash
sudo ss -lntp | grep 13080                              # container port published?
sudo firewall-cmd --add-port=13080/tcp --permanent      # RHEL / CentOS
sudo firewall-cmd --reload
sudo ufw allow 13080/tcp                                # Ubuntu
```
