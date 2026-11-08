# Deploying this project (JA Hack 2026)

This repo deploys to **kuso**, a self-hosted platform at https://kuso.junioraccelerator.org.
Every push to `main` rebuilds and redeploys automatically once the service exists.

- kuso project: `duet-code` (the team account can only see this project)
- Main URL: https://duet-code.junioraccelerator.org
- Second URL (optional, e.g. a separate backend): https://duet-code-api.junioraccelerator.org

Those two URLs are the only ones that work. Any other hostname will not resolve or will fail TLS.

## 1. Install the CLI and log in

```sh
curl -fsSL https://kuso.junioraccelerator.org/install-cli.sh | sh
kuso login --api https://kuso.junioraccelerator.org -u duet-code -p cyayeqvndaea
```

The team password above is shared by everyone on the team. Don't copy it anywhere else and never make this repo public.

## 2. Create the service (once)

The main service MUST be named exactly `duet-code`. That name is what gives it https://duet-code.junioraccelerator.org.

```sh
kuso service add duet-code duet-code                 # app at the repo root
kuso service add duet-code duet-code --path web      # app in a subfolder
```

Runtime and port are detected: a `Dockerfile` wins, otherwise `package.json` builds with nixpacks.
The app must listen on `0.0.0.0` and the port in `$PORT` (kuso sets it, 8080 by default).
Next.js (`next start`) does this already.

A second service (for example a C# or Node backend) must be named `api`, then given its URL:

```sh
kuso service add duet-code api --path api
kuso domains add duet-code api duet-code-api.junioraccelerator.org
```

DNS for both URLs is already set up. Ignore the "Point an A record…" hint that `domains add` prints.

## C# / ASP.NET: add a Dockerfile

kuso cannot build .NET without one. Put this next to the `.csproj` (replace `MyApp` with the
`.csproj` name, and match the SDK version to `TargetFramework`):

```dockerfile
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY . .
RUN dotnet publish -c Release -o /out

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /out .
ENV ASPNETCORE_URLS=http://0.0.0.0:8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "MyApp.dll"]
```

Commit and push it, then run `kuso service add` with `--path` pointing at that folder.

## Database

```sh
kuso project addon add duet-code db --kind postgres --version 16
```

`DATABASE_URL` (plus `POSTGRES_HOST`, `POSTGRES_USER`, …) is injected into the services automatically.
Run migrations from the app's start command or build, not from a laptop.

## Env vars

```sh
kuso env set duet-code duet-code KEY=value               # plain value
kuso env set duet-code duet-code API_KEY=... --secret    # secrets
kuso env list duet-code duet-code
```

Changing env vars restarts the service. `NEXT_PUBLIC_*` values are baked in at build time, so trigger a rebuild after changing them.

## When something breaks

```sh
kuso build list duet-code duet-code                       # find the build id and status
kuso logs duet-code duet-code --build <build-id>          # why a build failed
kuso logs duet-code duet-code -f                          # runtime logs of the running app
kuso build trigger duet-code duet-code                    # rebuild without a new commit
kuso status duet-code                                  # overview of the project
```

Read the build log before changing anything. Most failures are a missing start script, the app
listening on the wrong port, or a missing env var.

## Rules

- Only touch the `duet-code` project. Do not create other projects.
- Keep service names to `duet-code` and `api`; other names get URLs that don't work.
- Don't commit secrets. Use `kuso env set --secret`.
