# Backend / Supabase setup guide

Covers getting this repo running locally against a local Supabase stack, and deploying it to a
real Supabase project. For what each file in `supabase/` does, see `SUPABASE_LAYOUT.md`.

## 1. Prerequisites

- **Node.js 22+** (`package.json`'s `engines` requires it).
- **Docker**, installed and running — only needed for the local Supabase stack, not for deploying
  straight to a remote project.
- **A Supabase account** (free tier), only needed for remote/production setup.

## 2. Install

```
git clone <this repo>
cd bluebook-companion-be
npm install          # pulls in the Supabase CLI (npx supabase), vitest, tsx — no global installs
npx supabase --version
```

## 3. Local Supabase setup

```
npx supabase start
npm run sync-engine          # vendors engine/review-planner's compiled output into
                              # supabase/functions/_shared/engine/
npm run seed:catalog
npm run seed:answer-key
```

On an SELinux-enforcing host, if the edge runtime container fails with a generic
`BOOT_ERROR`/"failed to determine entrypoint", run `sudo chcon -Rt container_file_t
supabase/functions/` once per checkout and retry.

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

Seed the remote database — copy `.env.sample` to `.env` and set `DB_URL` from Dashboard → Project
Settings → Database → Connect. That page offers three connection strings; for a one-off script
run from your own machine:
- Try **Direct connection** first (plain `postgres` user, full Postgres compatibility).
- If it times out — its host is IPv6-only, which most home/corporate networks can't reach — use
  **Session pooler** instead (IPv4-compatible, same session-mode behavior as Direct, username
  becomes `postgres.<project-ref>` since that host is shared across projects).
- Skip **Transaction pooler**: it's built for many brief, concurrent, stateless connections
  (serverless/Edge Functions), not a single manual script run.

Then:

```
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
