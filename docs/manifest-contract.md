# Manifest Contract

Vigil receives installed package state through an authenticated manifest push.

## Endpoint

```text
POST /api/v1/manifest
Content-Type: application/json
```

The request body must be a JSON object with a `packages` array.

```json
{"packages":[{"name":"zlib","version":"1.3.1"}]}
```

## Package Shape

Each package object has two required fields:

- `name`: string, required, non-empty
- `version`: string, required, non-empty

Optional fields:

- `description`: string
- `depends`: array of strings
- `provides`: array of strings
- `groups`: array of strings
- `architecture`: string
- `build_date`: string
- `install_date`: string

Example:

```json
{"packages":[{"name":"openssl","version":"3.5.0","description":"TLS toolkit","depends":["zlib"],"provides":["libssl"],"groups":["base"],"architecture":"x86_64","build_date":"2026-01-02T03:04:05+00:00","install_date":"2026-01-03T03:04:05+00:00"}]}
```

## HMAC Authentication

Each request must include these headers:

- `X-Api-Key-Id`: the configured API key id, for example `vigil-push-1`
- `X-Signature`: lowercase hex HMAC-SHA256
- `X-Timestamp`: Unix timestamp in milliseconds

The server checks:

1. The key id equals the configured API key id.
2. The timestamp is within the configured timestamp window.
3. The signature matches the signed payload.

The signed payload is:

```text
${timestamp}.${body}
```

Where:

- `timestamp` is exactly the `X-Timestamp` header value.
- `body` is the JSON body as the server reconstructs it with `JSON.stringify(request.body)`.
- The HMAC algorithm is SHA-256.
- The digest encoding is lowercase hex.
- The HMAC secret is the configured API key secret for that key id.

Important: sign the same bytes the server reconstructs. Producers should use compact JSON with no extra whitespace. `jq -c` is the recommended final step before signing and sending.

## Worked Curl Example

```sh
VIGIL_URL="https://vigil.example.com"
API_KEY_ID="vigil-push-1"
API_KEY_SECRET="replace-with-random-shared-secret"

BODY="$(printf '%s\n' '{"packages":[{"name":"zlib","version":"1.3.1"}]}' | jq -c .)"
TIMESTAMP="$(date +%s%3N)"
SIGNATURE="$(printf '%s' "${TIMESTAMP}.${BODY}" | openssl dgst -sha256 -hmac "$API_KEY_SECRET" | awk '{print $NF}')"

curl -sS \
  -X POST "${VIGIL_URL}/api/v1/manifest" \
  -H "Content-Type: application/json" \
  -H "X-Api-Key-Id: ${API_KEY_ID}" \
  -H "X-Signature: ${SIGNATURE}" \
  -H "X-Timestamp: ${TIMESTAMP}" \
  --data-binary "$BODY"
```

## Response

A successful request returns HTTP 200 with a push id and package diff counts:

```json
{"pushId":"example","diff":{"added":1,"removed":0,"updated":0,"unchanged":0},"details":{"added":[],"removed":[],"updated":{},"unchanged":0}}
```

The exact `details` fields reflect the package changes found during that push.
