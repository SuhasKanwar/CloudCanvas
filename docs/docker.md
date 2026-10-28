# Running CloudCanvas with Docker Compose

Run commands from the repository root. Docker Engine and Docker Compose with
BuildKit support are required. The Compose stack includes the client, Express
server, Python AI service, and a dedicated PostgreSQL 16 database.

## Environment files

Create any missing files from the examples, then fill in their values:

```bash
cp client/.env.example client/.env
cp server/.env.example server/.env
cp service/.env.example service/.env
```

Do not overwrite existing env files. Compose reads exactly `client/.env`,
`server/.env`, and `service/.env`; it does not read `client/.env.local`.
No root `.env` file is needed. Configure Google credentials and the NextAuth
secret in the client file, JWT and AWS encryption secrets in the server file,
and model-provider keys in the AI service file.

The client file also supplies build-time public settings through a temporary
BuildKit secret mount. `NEXT_PUBLIC_HTTP_SERVER_BASE_URL` must be reachable from
the user's browser, normally `http://localhost:9000`. After changing `NEXT_PUBLIC_*`
settings, run `docker compose build --no-cache client` and recreate the client.
BuildKit secret contents do not invalidate the build cache, and runtime env alone
cannot update the compiled browser bundle. The env file itself is excluded from image layers.
See [Next.js environment variables](https://nextjs.org/docs/app/guides/environment-variables)
and [Docker build secrets](https://docs.docker.com/build/building/secrets/).

Compose intentionally overrides these values from the per-service files:

| Service | Override | Reason |
| --- | --- | --- |
| Client | `HTTP_SERVER_BASE_URL=http://server:9000` | NextAuth/server-side API calls use Docker DNS; browser calls retain the public API URL |
| Client | `NEXTAUTH_URL=http://localhost:3000` | Local browser callback URL |
| Server | `DATABASE_URL=postgresql://postgres:dev@postgres:5432/cloudcanvas` | Use the bundled database, leaving the host database untouched |
| Server | `MICROSERVICE_BASE_URL=http://service:8000` | Reach FastAPI on the internal network |
| AI service | `CLOUDCANVAS_SERVER_URL=http://server:9000` | Catalog tools call back to Express |
| Applications | Fixed internal ports, production Node environment, bind hosts | Match published ports and container networking |

All other settings come from each service's env file via
[Compose `env_file`](https://docs.docker.com/compose/how-tos/environment-variables/set-environment-variables/).
For a different public hostname, update the public client URL, server
`FRONTEND_URL`, and Compose `NEXTAUTH_URL`/published ports together, then rebuild.
The database credentials above are local-development defaults, not production
secrets; change both the PostgreSQL environment and server URL before deploying
elsewhere. PostgreSQL and FastAPI are only exposed on the internal Compose network.

## Start, inspect, and stop

```bash
docker compose config --quiet
docker compose up --build -d
docker compose ps
docker compose logs -f server service
```

Open `http://localhost:3000`; the browser API is at `http://localhost:9000`.
The server waits for healthy PostgreSQL and FastAPI, then runs
`prisma migrate deploy` before starting. This applies the checked-in migrations
to the bundled database and preserves its data in the `postgres_data` volume.
The client starts after the server health check passes. Health checks establish
process readiness; they do not verify model credentials or AWS permissions.

```bash
docker compose down
```

Stopping the stack retains database data. `docker compose down --volumes` deletes
the bundled database volume and all data in it. It does not clean up AWS resources;
delete managed AWS resources through CloudCanvas before discarding their records.

## Image builds

Every build uses the repository root as context. Client/server images build
`contracts` first, preserving the `/app/contracts` sibling location required by
their `file:../contracts` dependency. The checked-in npm locks drive installation;
no client Bun lock exists. The server generates Prisma before TypeScript compilation.

```bash
docker build -f docker/Dockerfile.server -t cloudcanvas-server:local .
docker build --secret id=client_env,src=client/.env -f docker/Dockerfile.client -t cloudcanvas-client:local .
docker build -f docker/Dockerfile.service -t cloudcanvas-service:local .
```

The root `.dockerignore` excludes env files, local dependencies, generated Prisma,
logs, and build outputs. Prisma migration tooling remains installed in the server
image because Compose runs it at startup. Provider requests and AWS provisioning
still require valid credentials and network access.
