# API Flow Tester

HTTP/API regression facility: suites, scenarios, and one-pass runs with a web UI.

The CLI entrypoint is still `bin/loadtest.sh`. The product is a regression tester, not a load tester.

## Features
- Suite → scenario → step tests with payload templating and named environments
- Web UI for browsing, editing, and running suites/scenarios
- One-pass regression: one user, one iteration, fail on errors, skip diagrams
- Random data generators and secret files (`${secret:name}`, JSON/YAML/SOPS)
- Import scenarios from Postman collections or Insomnia exports
- Block-based scenario editor with per-step forms, drag-and-drop reordering, and step/sequence dry-runs
- Live run UX with spinner and pass/fail result tables

## Repository Layout
- `bin/loadtest.sh` - runner (use `--regression` for the UI/CLI default)
- `tools/scenario_runner.py` - scenario/suite engine
- `webapp/app.py` - FastAPI backend
- `webapp/templates/` - frontend HTML
- `webapp/static/` - frontend JS/CSS
- `examples/` - suites and scenarios
- `results/` - run output
- `requirements.txt` - Python deps

## Quick Start

### Docker Compose

```bash
docker compose up --build
```

Then open:

```text
http://127.0.0.1:9011
```

To target a service running on the host machine, use `host.docker.internal` as the host (for example `http://host.docker.internal:8080`).

CLI runs use the same image:

```bash
docker compose run --rm api-flow-tester ./bin/loadtest.sh \
  --host host.docker.internal \
  --port 8080 \
  --scenario-file ./examples/oauth2-server/suite-local.json \
  --regression \
  --label oauth2_regression
```

### Local Python

```bash
cd api-flow-tester
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
chmod +x bin/loadtest.sh
```

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

Current web UI capabilities:
- browse suites from `examples/` (open a suite, then a scenario)
- edit and save suite/scenario files from the browser
- build/edit scenarios with a block-based step lane and detailed step form
- reorder steps with drag-and-drop tiles
- test a selected step or the full sequence from the editor
- run the open suite or scenario once (regression; no load-test knobs)
- view live running state with spinner + disabled run button
- read cleaned run logs and pass/fail result tables

Run a suite (one pass, fail on errors):

```bash
./bin/loadtest.sh \
  --host localhost \
  --port 8080 \
  --scenario-file ./examples/oauth2-server/suite-proxy.json \
  --regression \
  --label oauth2_regression
```

Run a single scenario the same way, pointing `--scenario-file` at a `test_*.json`.

The CLI can still drive ApacheBench / Socket.IO load probes. That is optional and not exposed in the UI.

<details>
<summary>Optional load-probe CLI</summary>

Run default HTTP probe:

```bash
./bin/loadtest.sh --host localhost --port 8080 --label baseline_eventlet
```

Run with custom targets:

```bash
./bin/loadtest.sh \
  --host localhost \
  --port 8080 \
  --concurrency 100 \
  --requests 10000 \
  --websockets 150 \
  --duration 20 \
  --target-rps 3000 \
  --target-users 150 \
  --endpoints "/health,/config,/api/users/me" \
  --label gthread_workers_8
```

Run a scenario as a load test (not regression):

```bash
./bin/loadtest.sh \
  --host localhost \
  --port 8080 \
  --scenario-file ./examples/scenario.json \
  --scenario-users 30 \
  --scenario-duration 45 \
  --scenario-iterations 0 \
  --label scenario_run
```

</details>

Run the SBS representative scenario:

```bash
./bin/loadtest.sh \
  --host localhost \
  --port 8080 \
  --scenario-file ./examples/scenario_sbs_representative.json \
  --scenario-users 30 \
  --scenario-duration 60 \
  --scenario-iterations 0 \
  --label sbs_representative
```

This scenario includes a representative mix of SBS operations:
- platform health/config checks
- mock login/session bootstrap
- current user profile retrieval
- organisation/service/collaboration optimized listings
- audit log retrieval
- system statistics lookup
- chained request using `current_user_id` from `/api/users/me` into `/api/audit_logs/other/{{ vars.current_user_id }}`

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
| `{{ vars.some_id }}` | saved response field from a previous step |
| `{{ random.gen_name }}` | configured random generator |
| `{{ meta.now }}` | current UTC timestamp |

The `server` key in an environment overrides `base_url` for URL construction. All other keys are available as template variables.

### Using a named environment from the CLI

Pass `--scenario-environment` to the shell runner:

```bash
./bin/loadtest.sh \
  --scenario-file ./examples/SCIM.json \
  --scenario-environment staging \
  --scenario-users 10 \
  --scenario-duration 30 \
  --label scim_staging
```

If `--scenario-environment` is omitted the value of `selected_environment` in the scenario file is used.

### Secrets and SOPS

Do not store bearer tokens directly in scenario files. Use secret references in your environment values:

```json
{
  "environments": {
    "live": {
      "server": "https://oauth2.live.surfresearchcloud.nl",
      "token": "${secret:oauth.live.bearer_token}"
    }
  }
}
```

Supported runtime sources:

- `--secrets-file <path>` when running `bin/loadtest.sh`
- `scenario_secrets_file` in the web UI run payload (Secrets File field)
- `LTI_SECRETS_FILE` environment variable (fallback)
- `LTI_SECRET_<NAME>` environment variables (for direct injection)

Secrets file format:

- JSON or YAML object
- Optional top-level `secrets` object
- SOPS-encrypted files are supported when `sops` CLI is installed

Example:

```yaml
secrets:
  oauth.live.bearer_token: "Bearer eyJhbGciOi..."
```

Security behavior:

- Secret references are resolved server-side only during run/test execution.
- Secret values are never written back into scenario files.
- Run stdout/stderr returned by the API is redacted for Authorization/Bearer patterns.

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
  "base_url": "http://localhost:8080",
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
Each run creates a folder in `results/`:
- `summary.json` - normalized metrics for automation/comparison
- `scenario.json` - scenario execution metrics (when scenario mode is used)
- `report.md` - markdown report
- `http_rps.png` - throughput chart
- `http_latency.png` - latency chart
- `targets_vs_achieved.png` - target comparison chart
- `scenario_step_latency_p95.png` - scenario step tail latency chart
- raw `ab` outputs (`*.txt`, `*_percentiles.csv`)

## Compare Two Runs
For now, compare key values from summaries:

```bash
jq '.headline' results/<run1>/summary.json
jq '.headline' results/<run2>/summary.json
```

You can also diff full summaries:

```bash
diff -u results/<run1>/summary.json results/<run2>/summary.json
```

## Notes
- Put local secrets in a `*.local.json` file next to the suite; those files are gitignored.
- Set `LTI_TARGET_HOST` when scenarios use `localhost` but the server is on another machine.
