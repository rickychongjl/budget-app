# Sitting 0: Run it

**Goal:** start the whole app on my laptop and know what each running piece is.
**Files:** `docker-compose.yml`, `.env.example`, `src/Budget.Api/Dockerfile` (skim only)
**Do:** `docker compose up -d --build`, open http://localhost:8080, demo sign-in, add a transaction with DevTools open.

## Notes

### Docker terms, biggest to smallest

```
docker-compose.yml      the recipe: which pieces the app needs
└── Project             one running copy of the recipe (named after the folder by default)
    ├── Service         a role in the recipe: sql, migrate, api
    │   └── Container   the running box for that service, e.g. budget-app-api-1
    ├── Network         private network; services find each other by name (Server=sql)
    └── Volume          disk storage that outlives containers (sql-data holds the database)

Dockerfile --build--> Image --run--> Container
```

| Docker | C# comparison |
|---|---|
| Dockerfile | the build steps |
| Image | the compiled output: read-only, never changes |
| Container | a running process started from that output |
| Volume | the database file on disk: the process can die, the data stays |

A container name is `<project>-<service>-<number>`.

### Commands

| Command | What it does |
|---|---|
| `docker ps` (`-a` adds stopped ones) | list containers |
| `docker compose ls` | list running projects |
| `docker compose up -d --build` | build the image, then start everything in the background |
| `docker compose ps -a` | this project's containers, including ones that exited |
| `docker compose logs <service>` | what a container printed |
| `docker compose stop` | pause; containers are kept |
| `docker compose down` | stop and remove containers and network; **volumes are kept** |
| `docker compose down -v` | same, and **deletes the data** |
| `docker compose -p <name> down` | act on another project, not the one named after this folder |

### How this app starts

- `sql` starts first. Its health check runs `SELECT 1` every 10 seconds. "Started" is not "ready": SQL Server takes a while to boot.
- `migrate` waits for `sql` to be **healthy**, applies the EF Core migrations, makes sure the users exist, seeds the demo, then **exits with 0**.
- `api` waits for `migrate` to **complete successfully**. If a migration fails, the API never starts. Production works the same way.
- `migrate` and `api` use the **same image**. `x-app: &app` is a shared block pasted in with `<<: *app`; `migrate` swaps the entrypoint to run the Jobs app instead.

### Why one container exits and one keeps running

**A container lives exactly as long as its main process.**
- `api` runs the web server. `app.Run()` (`Program.cs:93`) blocks and waits for requests forever.
- `migrate` runs a console app. `Main` does its job and returns, so the container stops.
- What `Main` returns is the exit code: `Exited (0)` is success. Anything else counts as a failure.

### `.env`

- Compose reads `.env` and replaces each `${NAME}` before starting anything. `.env` is gitignored, so secrets stay on my laptop.
- `${X:?message}` is required (stops with the message if missing). `${X:-default}` is optional, with a default.
- `ConnectionStrings__Budget` reaches .NET as `ConnectionStrings:Budget`: `__` stands for the nesting in appsettings.

### What "Try the demo" sends (DevTools, Network tab, Fetch/XHR)

| Request | Status | Why |
|---|---|---|
| `GET /auth/csrf` | 200 | gets an anti-forgery token first; every write must carry it |
| `POST /auth/demo` | 204 (success, no body) | the server signs in as the demo user and sends the cookie in `Set-Cookie` |
| `GET /api/me` | 200 | "who am I?" The cookie is HttpOnly, so the page cannot read it and has to ask |
| `GET /api/cycles/current` | 200 | the dashboard's data |

### Gotchas I hit

- Leftover stacks from old worktrees held port 8080. `docker compose ls` finds them, `docker compose -p <name> down` clears them.
- Red errors in `.tsx` files ("react/jsx-runtime ... could not be found") meant `src/web/node_modules` was missing. Fix it with `npm ci` in `src/web`. The Docker build does its own `npm ci`, so the image never needed it.

### First React bits (to revisit after the tutorial)

- `index.html` has an empty `<div id="root">` and loads `src/main.tsx`, which renders `<App />` into it.
- `.tsx` is TypeScript with JSX (the HTML-like tags); `.ts` has no tags. `.js`/`.jsx` are the same without types. Vite compiles all of them to plain JS.
- `StrictMode` only acts in development: it runs some code twice to expose bugs, so a doubled request under `npm run dev` is expected.
