# Backend / Supabase setup guide

Covers getting this repo running locally against a local Supabase stack, and deploying it to a
real Supabase project. For what each file in `supabase/` does, see `SUPABASE_LAYOUT.md`.

## 1. Prerequisites

- **Node.js 22+** (`package.json`'s `engines` requires it).
- **A container runtime**, for the local Supabase stack only (not needed if you only deploy to a
  remote project): Docker Desktop/Engine, or Podman on Linux.
- **A Supabase account** (free tier), only needed for remote/production setup.
- **If your host is an immutable/atomic Linux distro** (Fedora Silverblue, Bazzite, etc.) and
  therefore can't install Podman/Docker directly:
  ```
  distrobox create --name bluebook-engine --image registry.fedoraproject.org/fedora:43
  distrobox enter bluebook-engine
  sudo dnf install -y nodejs podman    # inside the container
  systemctl --user enable --now podman.socket
  ```
  Run everything below inside that container. It shares the host's network namespace, so
  `127.0.0.1:<port>` reaches the local Supabase stack with no port-forwarding needed.

## 2. Install

```
git clone <this repo>
cd bluebook-companion-be
npm install          # pulls in the Supabase CLI (npx supabase), vitest, tsx — no global installs
npx supabase --version
```

## 3. Local Supabase setup

```
export CONTAINER_HOST=unix:///run/user/$(id -u)/podman/podman.sock   # podman only, not Docker Desktop
export DOCKER_HOST=$CONTAINER_HOST

sudo chcon -Rt container_file_t supabase/functions/   # SELinux hosts only, once per checkout

npx supabase start
npm run sync-engine          # vendors engine/review-planner's compiled output into
                              # supabase/functions/_shared/engine/
npm run seed:catalog
npm run seed:answer-key
```

Without the `chcon` step on an SELinux-enforcing host, the edge runtime container fails with a
generic `BOOT_ERROR`/"failed to determine entrypoint" — check `podman logs
supabase_edge_runtime_<project>` and `podman exec <container> ls <mounted path>` ("Permission
denied") to confirm before assuming it's a code bug.

`npx supabase stop`/`status` need the same two env vars exported.

## 4. Remote (production) Supabase setup

```
npx supabase login                      # opens a browser; use --token <access-token> on a
                                         # headless host (generate one at supabase.com/dashboard
                                         # under your account's Access Tokens)
```

Create a project at [supabase.com/dashboard](https://supabase.com/dashboard) (or `npx supabase
projects create`), then:

```
npx supabase link --project-ref <project-ref>
npx supabase config push                # syncs config.toml (e.g. anonymous sign-ins) to the project
npx supabase db push --linked           # applies supabase/migrations/ in order
npm run sync-engine
npx supabase functions deploy plan-gateway --use-api
```

Seed the remote database — point `DB_URL` at the remote connection string (Dashboard → Project
Settings → Database → Connection string) instead of the local default:

```
export DB_URL="postgresql://postgres.<project-ref>:<password>@<pooler-host>:6543/postgres"
npm run seed:catalog
npm run seed:answer-key
```

Get the publishable (anon) key the Android app needs — Dashboard → Project Settings → API, or:

```
npx supabase projects api-keys --project-ref <project-ref>
```

## 5. Verify end to end

```
curl -s https://<project-ref>.supabase.co/rest/v1/v_sheet_catalog \
  -H "apikey: <publishable-key>"   # expect 401 (no auth yet), not a 5xx
```

A full check needs a real anonymous session:

```
TOKEN=$(curl -s -X POST https://<project-ref>.supabase.co/auth/v1/signup \
  -H "apikey: <publishable-key>" -H "Content-Type: application/json" -d '{}' \
  | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

curl -s "https://<project-ref>.supabase.co/rest/v1/v_sheet_catalog?limit=3" \
  -H "apikey: <publishable-key>" -H "Authorization: Bearer $TOKEN"   # expect published exam sets
```

## 6. Next

- `SUPABASE_LAYOUT.md` — what every file in `supabase/` does.
- `MILESTONE1_CHECKLIST.md` / `MILESTONE2_CHECKLIST.md` / `MILESTONE3_CHECKLIST.md` — how each
  claim about this backend was actually verified.
- `bluebook-companion-fe/README.md` — pointing the Android app at whichever project you set up
  here (`SUPABASE_URL`/`SUPABASE_ANON_KEY` in its `.env` or `local.properties`).
