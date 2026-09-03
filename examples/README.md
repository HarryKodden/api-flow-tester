# OAuth2 Server Regression Scenarios

Translated copies of all `tests/test_*.sh` scripts into [loadtester](../../loadtester) scenario JSON
(`../loadtester` relative to this repo).

## Layout

| File | Purpose |
|------|---------|
| `test_*.json` | One scenario per shell test (37 files) |
| `suite-local.json` | Local AS (no upstream) |
| `suite-proxy.json` | Proxy AS + mock upstream |
| `suite-proxy-dpop.json` | Proxy AS with DPoP required |
| `suite-cimd.json` | Local AS with CIMD |
| `suite-register.json` | Registers clients first, then runs local tests with collected `client_id` / `client_secret` |
| `suite.json` | All 37 (not expected to pass on one server) |
| `README.md` | This file |

## How to run

Start the OAuth2 server (and mock upstream for `proxy` / `tags: ["proxy"]` scenarios) yourself — these scenarios do **not** manage process lifecycle the way `scripts/run-test-script.sh` does.

From the loadtester repo:

```bash
cd ../loadtester
./bin/test.sh \
  --scenario-file ./examples/oauth2-server/test_introspection.json \
  --scenario-environment local \
  --regression \
  --label oauth2_introspection
```

Or open the web UI, pick a suite, then Run Tests.

Useful filters from `suite.json`:

- `translation_status: full` — runnable as-is against a stock local server
- `partial` — HTTP core present; some shell assertions omitted or stubbed
- `stub` — needs loadtester extensions or external fixtures (DPoP proofs, FINAL_URL, JWT mint, CIMD metadata server, Go/docker)

## Environments

Each scenario embeds:

- `local` — AS on port 8080; set `server` to an IP or FQDN (not localhost)
- `proxy` — proxy AS on port 8090 and mock upstream on 9999; set `server` and `mock_provider` to IPs or FQDNs

Optional stubs in env (replace before expecting success):

| Key | Used by |
|-----|---------|
| `dpop_proof` / `dpop_jkt` | DPoP scenarios |
| `client_assertion` | Attestation / private_key_jwt scenarios |
| `pkce_verifier` / `pkce_challenge` | Fixed RFC 7636 sample pair |

## Translation fidelity

Loadtester today supports: `method`, `path`, `headers`, `json`, `data`, `expected_status`, `expected_json_contains`, `save` (json/headers), random generators, environments.

**Not supported** (hence stubs/partials):

1. DPoP ES256 proof generation / nonce retry  
2. Redirect follow + `FINAL_URL` / `code=` extraction  
3. HTML scrape / form login / consent  
4. PKCE generation (fixed pair provided)  
5. JWT attestation builders  
6. Poll/sleep loops (device grant)  
7. Multi-host (AS + mock) in one scenario  
8. Non-HTTP suites (`test_storage_consistency.sh`)

## Suggested next runner extensions

To promote most `partial`/`stub` scenarios to `full`:

1. DPoP helper step (or `${dpop:...}` secret/tool)  
2. `follow_redirects` + save final URL / query params  
3. `expected_body_contains` for HTML/text  
4. `poll` / `retry` step for device flow  
5. JWT / attestation fixture helper  

## Counts

See `suite.json` → `summary` (regenerated with the scenarios).
