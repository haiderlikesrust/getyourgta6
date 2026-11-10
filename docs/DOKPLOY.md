# Deploy gta6fund.xyz on Dokploy (zero-downtime updates)

The app is one Docker image (the [`Dockerfile`](../Dockerfile) at the repo root): a
Next.js server that serves the site and the API and runs the 5-minute worker
(claim + swap creator rewards, then draw). Its data is one SQLite file on a volume.

| Dokploy piece | What it is | Holds |
|---|---|---|
| **Application** `gta6fund` | This repository, built from the `Dockerfile`, run as a Docker Swarm service. Traefik sends `gta6fund.xyz` to port 3000. | Wallet keys, at runtime only |
| **Volume** `gta6fund-data` → `/data` | The SQLite database | Entries, winners, claims, encrypted gift card codes, the ledger |
| **Volume** `gta6fund-static` → `/app/.next/static` | Scripts and styles of this and earlier builds | Nothing secret |

## Why an Application and not Docker Compose

A Dokploy **Docker Compose** service stops the old container and only then starts
the new one, so every deploy takes the site down for the restart.

A Dokploy **Application** runs as a Swarm service. With the settings below, Swarm
starts the new version first and stops the old one only after the new one is healthy.

### What happens on an update

1. **Build.** Dokploy builds the new image while the old version keeps serving. If
   the build fails, nothing changes.
2. **Start.** The new container syncs the database schema, publishes its static
   files to the shared volume, and starts. Its health check (`/api/health`) has to
   pass before anything else happens.
3. **Overlap.** For a few seconds both versions serve requests from the same
   database. That is safe: the database runs in WAL mode, and the draw and the
   treasury job each take a database lock, so only one container does the work.
4. **Hand-over.** Swarm sends the old container SIGTERM. It stops scheduling, lets
   the job and the requests in flight finish (about 25 seconds at most, usually
   under 5), and exits.
5. **Open pages keep working.** Their scripts are still on the shared static
   volume. On their next navigation they load the new version, because every build
   has its own deployment id.
6. **Rollback.** If the new version does not become healthy within a minute, Swarm
   puts the previous one back.

Money steps are safe across the hand-over regardless: a payment's signature is
stored before it is broadcast, and the next attempt resumes it instead of paying again.

## Set up

1. **DNS.** Point `gta6fund.xyz` and `www.gta6fund.xyz` (A records) at the server's IP.
2. **Application.**
   - In your Dokploy project choose **Create Service → Application**, name it `gta6fund`.
   - **General → Provider:** GitHub, repository `haiderlikesrust/getyourgta6`, the
     branch you deploy from.
   - **Build Type:** Dockerfile. **Dockerfile Path:** `Dockerfile`. **Docker Context Path:** `.`
3. **Environment.** Paste [`deploy/dokploy.env.example`](../deploy/dokploy.env.example)
   into the **Environment** tab and fill in the blanks. They are runtime variables;
   never put them in **Build-time Arguments**. Keep `BITREFILL_MODE=test` for the
   first deploy.
4. **Domain.** In **Domains** add `gta6fund.xyz`, path `/`, container port **3000**,
   HTTPS on, certificate **Let's Encrypt**. Add `www.gta6fund.xyz` the same way,
   then a "www to non-www" redirect under **Advanced → Redirects**.
5. **Volumes.** In **Advanced → Volumes** add two **Volume Mounts**:

   | Volume name | Mount path |
   |---|---|
   | `gta6fund-data` | `/data` |
   | `gta6fund-static` | `/app/.next/static` |

   **Do not skip `gta6fund-data`.** Without it the database lives inside the
   container and every update starts from an empty one: winners, unclaimed prizes
   and gift card codes would be gone.
6. **Zero-downtime settings.** In **Advanced → Cluster Settings**:
   - **Replicas:** `1`. SQLite is a single file on this server; a second replica
     buys nothing.
   - **Swarm Settings → Update Config:**
     ```json
     { "Parallelism": 1, "Delay": 0, "FailureAction": "rollback", "Monitor": 60000000000, "MaxFailureRatio": 0, "Order": "start-first" }
     ```
   - **Swarm Settings → Rollback Config:**
     ```json
     { "Parallelism": 1, "Delay": 0, "FailureAction": "pause", "Monitor": 60000000000, "MaxFailureRatio": 0, "Order": "start-first" }
     ```
   - **Swarm Settings → Stop Grace Period:** `30000000000` (30 s), so the old
     container has time to finish instead of being killed after Docker's default 10 s.
   - **Health Check:** the same check that is built into the image. Paste it anyway,
     so an update never starts without one:
     ```json
     { "Test": ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"], "Interval": 5000000000, "Timeout": 3000000000, "StartPeriod": 60000000000, "Retries": 3 }
     ```
   - Durations in these fields are in nanoseconds (5000000000 = 5 s).
7. **Deploy.** Click **Deploy** and follow the build log. Then open
   `https://gta6fund.xyz/api/health`. It should show `"ok": true`,
   `"database": true` and `"worker": { "enabled": true, ... }`.
8. **Optional:** turn on **Autodeploy** so every push to the branch deploys the same way.

## Check an update yourself

Leave this running while you click **Deploy**. It should print only `200`:

```bash
while true; do curl -s -o /dev/null -w '%{http_code} %{time_total}s\n' https://gta6fund.xyz/api/health; sleep 0.5; done
```

The `"build"` value in `/api/health` changes when the new version has taken over.

## Go live

1. First deploy with `BITREFILL_MODE=test` and run one full claim.
2. Fund the treasury wallet with a little SOL for network fees.
3. Set `BITREFILL_MODE=live` and the two `BITREFILL_PRODUCT_*` ids, check what the
   $100 card costs and set `PRIZE_BUFFER_PERCENT` to match, then redeploy.

## Rules that keep updates seamless

- **Database changes must be additive.** Add tables and columns; don't rename or
  drop them in the same release as the code that stops using them. During the
  overlap, and after a rollback, the previous version runs against the new schema.
  A change that would drop data makes the new container fail at start, and the old
  one simply keeps running.
- **Keep one replica.**
- **Changing settings needs a redeploy.** Environment variables are read when the
  server starts; the redeploy goes through the same hand-over.
- **Back up `/data`.** Dokploy's **Volume Backups** can copy `gta6fund-data` to S3
  on a schedule. The file holds unclaimed prizes; `ENCRYPTION_KEY` decrypts the
  stored codes, so keep that key somewhere safe too.
- **Never point two apps at the same volumes.**

Reference: [Dokploy zero downtime](https://docs.dokploy.com/docs/core/applications/zero-downtime),
[Dokploy advanced settings](https://docs.dokploy.com/docs/core/applications/advanced).
