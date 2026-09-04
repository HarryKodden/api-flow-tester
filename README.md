# API Flow Tester

HTTP/API regression facility: suites, scenarios, and one-pass runs with a web UI.

The CLI entrypoint is still `bin/test.sh`. The product is a regression tester, not a load tester.

## Features
- Suite → scenario → step tests with payload templating and named environments
- Public read-only library (`examples/demo`) plus a private workspace per signed-in user
- OIDC sign-in (authorization code + PKCE) and PostgreSQL persistence
- Web UI for browsing, editing, and running suites/scenarios
- One-pass regression: one user, one iteration, fail on errors
- Random data generators and named environments
- Import scenarios from Postman collections or Insomnia exports
- Block-based scenario editor with per-step forms, drag-and-drop reordering, and step/sequence dry-runs
- Live run UX with spinner and a pass/fail list

## Repository Layout
- `bin/test.sh` - runner (use `--regression` for the UI/CLI default)
- `tools/scenario_runner.py` - scenario/suite engine
- `webapp/app.py` - FastAPI backend
- `webapp/templates/` - frontend HTML
- `webapp/static/` - frontend JS/CSS
- `examples/` - public library suites (read-only in the UI)
- `alembic/` - database migrations
- `requirements.txt` - Python deps

## Quick Start

```bash
cd api-flow-tester
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
chmod +x bin/test.sh
```

Run the test suite:

```bash
pip install -r requirements-dev.txt
python -m pytest
```

CI runs these tests on every push and pull request, then builds the container image only if they pass.

Start the web frontend:

```bash
cd api-flow-tester
source .venv/bin/activate
uvicorn webapp.app:app --app-dir . --host 127.0.0.1 --port 9011
```

Then open:

```text
http://127.0.0.1:9011
```

### Container image

Each push to `main` builds `linux/amd64` and `linux/arm64` images and publishes them to GitHub Container Registry:

```bash
docker pull ghcr.io/harrykodden/api-flow-tester:latest
docker run --rm -p 9011:8080 ghcr.io/harrykodden/api-flow-tester:latest
```

Then open `http://127.0.0.1:9011`.

Current web UI capabilities:
- browse the public library under `examples/` (no sign-in required)
- copy a library suite into a private workspace (sign-in required when OIDC is configured)
- edit and save workspace suites, scenarios, and private per-suite environment values
- build/edit scenarios with a block-based step lane and detailed step form
- reorder steps with drag-and-drop tiles
- test a selected step or the full sequence from the editor
- run the open suite or scenario once (regression; no load-test knobs)
- view live running state with spinner + disabled run button
- read the last run’s pass/fail list (not persisted; no markdown report)

### Database and sign-in

The app image does not include a database. Set `DATABASE_URL` to PostgreSQL in production. If it is unset, the app uses SQLite under `data/app.db` for local work.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | SQLAlchemy URL. Production: `postgresql+psycopg://user:pass@host:5432/db` |
| `SESSION_SECRET` | Secret for the `aft_session` cookie |
| `SESSION_SECURE` | Set `true` when serving over HTTPS. Ignored when `OIDC_REDIRECT_URI` is `http://` so local login cookies still work |
| `OIDC_ISSUER` | Issuer URL (discovery at `/.well-known/openid-configuration`) |
| `OIDC_CLIENT_ID` | Confidential or public client id |
| `OIDC_CLIENT_SECRET` | Client secret (optional for public PKCE clients) |
| `OIDC_REDIRECT_URI` | Must match the IdP, e.g. `http://127.0.0.1:9011/auth/callback` |

OIDC uses authorization code + PKCE, scopes `openid profile email`, and an httpOnly `SameSite=Lax` session cookie. Users are stored by `issuer` + `sub`.

If OIDC is not configured, the UI signs in as a local workspace user so Save / Import still persist to the database instead of `examples/`.

Migrations run on startup (`alembic upgrade head`). Runs stay ephemeral and are not stored.

Run a suite (one pass, fail on errors):

```bash
./bin/test.sh \
  --scenario-file ./examples/demo/suite.json \
  --regression \
  --label demo
```

Run a single scenario the same way, pointing `--scenario-file` at a `test_*.json`.

The CLI can still drive optional ApacheBench probes. That is not exposed in the UI.

<details>
<summary>Optional load-probe CLI</summary>

Run default HTTP probe:

```bash
./bin/test.sh --host 192.168.1.10 --port 8080 --label baseline_eventlet
```

Run with custom targets:

```bash
./bin/test.sh \
  --host 192.168.1.10 \
  --port 8080 \
  --concurrency 100 \
  --requests 10000 \
  --target-rps 3000 \
  --target-users 150 \
  --endpoints "/health,/config,/api/users/me" \
  --label gthread_workers_8
```

Run a scenario as a load test (not regression):

```bash
./bin/test.sh \
  --host 192.168.1.10 \
  --port 8080 \
  --scenario-file ./examples/scenario.json \
  --scenario-users 30 \
  --scenario-duration 45 \
  --scenario-iterations 0 \
  --label scenario_run
```

</details>

Scenario file capabilities:
- Define ordered API steps (GET/POST/PUT/DELETE)
- Set `expected_status` and optional `expected_json_contains`
- Save response fields using `save` (for chaining)
- Reuse values in subsequent requests via placeholders
- Generate random values with `random_generators`

Placeholder examples:
- `{{ vars.some_id }}` from saved response data
- `{{ random.request_id }}` from random generator config
- `{{ meta.now }}` current UTC timestamp

## Importing Scenarios

The web UI supports importing scenarios from existing API collections so you don't have to build steps from scratch.

### Supported formats

| Format | How to export |
|---|---|
| **Postman** | Export collection as *Collection v2.1* JSON |
| **Insomnia JSON** | Export as *Insomnia v4* JSON |
| **Insomnia YAML** | Export as *Insomnia v5* YAML (the default in recent Insomnia versions) |

### How to import

1. Open the web UI and click **Import** (top-right of the scenario list panel).
2. Choose a `.json`, `.yaml`, or `.yml` file.
3. The file is converted server-side and loaded as an editable scenario.
4. Review the imported steps, adjust the base URL and any headers, then **Save**.

### What gets converted

- HTTP method, path, request headers, and JSON body
- Bearer token / basic auth → `Authorization` header
- URL query parameters → appended to the step path
- Insomnia environment variables (see [Environments](#environments) below)

Steps that cannot be mapped (e.g. GraphQL, WebSocket) are skipped with a warning in the server log.

### CLI import

There is no CLI import command. Import is only available through the web UI.

---

## Environments

Environments let you run the same scenario against different servers or with different credentials without editing the scenario file each time.

### How environments are stored

Environments are stored inside the scenario JSON file under the `environments` key:

```json
{
  "base_url": "https://prod.example.org",
  "selected_environment": "staging",
  "environments": {
    "staging": {
      "server": "https://staging.example.org",
      "token": "Bearer eyJhbGc...",
      "SRAMGroup": "some-group-id"
    },
    "prod": {
      "server": "https://prod.example.org",
      "token": "Bearer eyJhbGc..."
    }
  },
  "steps": [...]
}
```

`selected_environment` records which environment was last active in the UI; it is used as the default when a run is started.

### Environment selector in the UI

When a scenario has one or more named environments a **Select environment** dropdown appears in the scenario meta panel. Changing the selection immediately affects:

- The **base URL** shown/used for "Test Step" and runs (derived from the `server` key of the selected environment)
- The variable values injected into request placeholders

### Editing environments

Click the **Environments (JSON)** textarea to view and edit the raw environment map. The field is validated on focus-out; invalid JSON is rejected and the previous value is restored.

### Placeholder resolution

Use Insomnia-style placeholders in your step URLs, headers, and bodies:

| Placeholder syntax | Resolved from |
|---|---|
| `{{ _.token }}` | `token` key in the selected environment |
| `{{ env.token }}` | `token` key in the selected environment |
| `{{ token }}` | `token` key in the selected environment |
| `{{ server : "https://api.example.org" }}` | `server` from the environment, or the quoted default if unset |
| `{{ vars.some_id }}` | saved response field from a previous step |
| `{{ random.gen_name }}` | configured random generator |
| `{{ meta.now }}` | current UTC timestamp |

A colon after the name sets a default: `{{ name : "value" }}` or `{{ name : 0 }}`. That works in step fields and inside environment values, for example `"user_id": "{{ uid : 0 }}"`. Fill `uid` in **Environment values** to override it; leave it alone to keep `0`.

Environment values can also reference other keys in the same environment. Set a host once and reuse it:

```json
{
  "environments": {
    "staging": {
      "base_url": "https://staging.example.org",
      "issuer": "{{ base_url }}",
      "token_url": "{{ base_url }}/oauth/token",
      "redirect_uri": "{{ base_url }}/callback"
    }
  }
}
```

`{{ server }}`, `{{ env.base_url }}`, and `{{ _.base_url }}` work the same way. Nested references are expanded (up to 10 passes); `vars.`, `random.`, and `meta.` placeholders are left for step rendering.

If a referenced environment variable has no value, the Run panel lists it and **Run Tests** stays disabled until you fill it in. On a library suite those values stay in the browser session. After you copy the suite to your workspace they are stored privately per suite and environment, not inside the exportable suite JSON.

The `server` key in an environment overrides `base_url` for URL construction. All other keys are available as template variables. After a host is chosen, `server` and `base_url` are both set so either name works in templates.

### Using a named environment from the CLI

Pass `--scenario-environment` to the shell runner:

```bash
./bin/test.sh \
  --scenario-file ./examples/SCIM.json \
  --scenario-environment staging \
  --scenario-users 10 \
  --scenario-duration 30 \
  --label scim_staging
```

If `--scenario-environment` is omitted the value of `selected_environment` in the scenario file is used.

Put sensitive values in the suite environment, or fill them in **Missing environment values** before a run. Run stdout/stderr returned by the API is redacted for Authorization/Bearer patterns.

### Insomnia import and environments

When you import an Insomnia YAML or JSON export that contains sub-environments, each sub-environment is converted to a named entry in the `environments` map. The base environment variables are merged into every sub-environment so inherited values are available everywhere.

---

## Scenario Patterns

Use these patterns to model realistic API workflows.

1. Chain two requests by saving response fields from step 1 and injecting into step 2.
2. Save response headers and reuse them in later calls (for auth/session style flows).
3. Save full response objects and read nested fields using dot paths.
4. Use random generators to vary emails, UUIDs, and choices per request.

### Pattern 1: Two-step JSON chaining

```json
{
  "base_url": "http://192.168.1.10:8080",
  "random_generators": {
    "request_id": { "type": "uuid" },
    "email": { "type": "email", "prefix": "loadtest", "domain": "example.org" }
  },
  "steps": [
    {
      "name": "create_mock_user",
      "method": "POST",
      "path": "/api/mock",
      "headers": {
        "X-Request-ID": "{{ random.request_id }}"
      },
      "json": {
        "uid": "urn:john",
        "email": "{{ random.email }}"
      },
      "expected_status": [200, 201, 204],
      "save": {
        "saved_uid": "json.uid",
        "saved_email": "json.email"
      },
      "save_response_as": "mock_response"
    },
    {
      "name": "follow_up_request",
      "method": "POST",
      "path": "/api/some-followup-endpoint",
      "json": {
        "uid": "{{ vars.saved_uid }}",
        "email": "{{ vars.mock_response.email }}"
      },
      "expected_status": [200, 201]
    }
  ]
}
```

### Pattern 2: Header chaining

```json
{
  "steps": [
    {
      "name": "login",
      "method": "POST",
      "path": "/api/login",
      "json": { "username": "demo", "password": "secret" },
      "expected_status": 200,
      "save": {
        "auth_header": "headers.Authorization"
      }
    },
    {
      "name": "use_auth_header",
      "method": "GET",
      "path": "/api/users/me",
      "headers": {
        "Authorization": "{{ vars.auth_header }}"
      },
      "expected_status": 200
    }
  ]
}
```

### Pattern 3: Randomized request input

```json
{
  "random_generators": {
    "uid_choice": {
      "type": "choice",
      "items": ["urn:john", "urn:jane", "urn:mark"]
    },
    "ticket": {
      "type": "string",
      "length": 10
    },
    "amount": {
      "type": "float",
      "min": 0.1,
      "max": 99.9,
      "decimals": 2
    }
  },
  "steps": [
    {
      "name": "randomized_call",
      "method": "POST",
      "path": "/api/mock",
      "json": {
        "uid": "{{ random.uid_choice }}",
        "reference": "{{ random.ticket }}",
        "value": "{{ random.amount }}",
        "created_at": "{{ meta.now }}"
      },
      "expected_status": [200, 201, 204]
    }
  ]
}
```

### Save/placeholder reference cheat sheet

- Save JSON field: `"my_var": "json.data.id"`
- Save header: `"token": "headers.Authorization"`
- Save entire response: `"save_response_as": "response_obj"`
- Reuse saved var: `{{ vars.my_var }}`
- Reuse nested object field: `{{ vars.response_obj.data.id }}`
- Random generator value: `{{ random.generator_name }}`
- Timestamp placeholder: `{{ meta.now }}`

## Output
The web UI keeps only the last run in the page: a pass/fail list. It does not write `results/` folders or markdown reports.

CLI runs write a folder under `results/` (summary.json and optional ApacheBench output). `--regression` skips ApacheBench.

## Notes
- API hosts (`server`, `mock_provider`, `--host`) must be an IP or FQDN. Do not use localhost.
