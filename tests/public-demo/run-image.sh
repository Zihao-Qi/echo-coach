#!/usr/bin/env bash
set -euo pipefail

# Run only on the GitHub Actions image runner. No cloud/registry configuration.
image="$1"
dir=$(mktemp -d "$RUNNER_TEMP/public-demo.XXXXXX")
net=echo-public-demo-ci
name=echo-public-demo
proxy_pid=
cleanup() {
  if [[ -n "$proxy_pid" ]]; then kill "$proxy_pid" 2>/dev/null || true; fi
  docker rm -f "$name" >/dev/null 2>&1 || true
  docker network rm "$net" >/dev/null 2>&1 || true
}
trap cleanup EXIT
fail() { printf 'Public demo verification failed: %s\n' "$1" >&2; exit 1; }

# Don't publish app logs until they've been checked for synthetic sensitive data.
safe_app_logs() {
  if ! docker logs "$name" > "$1" 2>&1; then
    fail 'could not collect container logs.'
  fi
  if grep -Fq PUBLIC_DEMO_UNEXPECTED_OUTBOUND "$1"; then
    fail 'the app attempted a server-side network connection (PUBLIC_DEMO_UNEXPECTED_OUTBOUND).'
  fi
  if grep -Fqf "$PUBLIC_DEMO_LOG_MARKERS" "$1"; then
    fail 'a synthetic request, answer, feedback or cookie marker leaked into app logs; output withheld.'
  fi
}

docker network create --internal "$net"
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=localhost \
  -keyout "$dir/key.pem" -out "$dir/cert.pem" 2>/dev/null
export PUBLIC_DEMO_LOG_MARKERS="$dir/markers"
printf '%s\n' DEMO_ANSWER_MARKER DEMO_REQUEST_BODY_MARKER \
  'This demo shows sample feedback. It does not assess whether your answer is correct.' > "$PUBLIC_DEMO_LOG_MARKERS"

# The baked demo image must not start without the explicit runtime selection.
rc=0
timeout 15s docker run --rm --network none "$image" > "$dir/invalid-config" 2>&1 || rc=$?
printf 'Invalid-config probe exit: %s (expected 1)\n' "$rc"
tail -n +1 "$dir/invalid-config"
test "$rc" -eq 1 || fail "invalid-config probe exited $rc instead of 1."
grep -Fq 'Public demo requires matching build and production runtime flags.' "$dir/invalid-config" ||
  fail 'invalid-config probe did not print the expected build/runtime mismatch message.'

exercise() {
  criterion="$1" label="$2"
  shift 2
  docker run -d --name "$name" --network "$net" \
    -e HOSTNAME=0.0.0.0 -e AUTH_URL=https://127.0.0.1:8443 \
    -e ECHO_PUBLIC_DEMO=true -e USE_MOCK=true -e PRACTICE_AUTH_MODE=demo -e PRACTICE_STORAGE=memory \
    -e PRACTICE_TRANSCRIPTION_MODE=disabled -e ALLOW_LOCAL_TRANSCRIPTION=false -e ALLOW_LOCAL_GEMINI=false \
    -e NODE_OPTIONS=--import=/tmp/deny-egress.mjs \
    -v "$PWD/tests/public-demo/deny-egress.mjs:/tmp/deny-egress.mjs:ro" "$@" "$image"
  ip=$(docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$name")
  node tests/public-demo/tls-proxy.mjs "$ip" "$dir/key.pem" "$dir/cert.pem" &
  proxy_pid=$!
  readiness=0
  curl --fail --silent --show-error --insecure --retry 20 --retry-all-errors --retry-delay 1 --retry-max-time 40 \
    https://127.0.0.1:8443/ > /dev/null || readiness=$?
  if [[ "$readiness" -ne 0 ]]; then
    printf 'HTTPS readiness (%s) exited %s.\n' "$label" "$readiness" >&2
    safe_app_logs "$dir/app-$label"
    tail -n 30 "$dir/app-$label" >&2
    fail "HTTPS readiness ($label) did not pass."
  fi
  result=0
  npx --no-install playwright test --config tests/public-demo/playwright.config.ts "$criterion" 'retained cookie' || result=$?
  printf 'Public demo Playwright (%s) exit: %s\n' "$label" "$result"
  safe_app_logs "$dir/app-$label"
  if [[ "$result" -ne 0 ]]; then
    tail -n 30 "$dir/app-$label" >&2
    fail "Playwright ($label) exited $result."
  fi
  kill "$proxy_pid"
  wait "$proxy_pid" || true
  proxy_pid=
  docker rm -f "$name"
}

exercise --grep-invert regenerated
exercise --grep retained -e DEMO_SESSION_SECRET=ci-only-fabricated-demo-secret
printf 'Public demo HTTPS browser checks passed; zero outbound socket attempts or log markers. Image %s.\n' "$image" | tee -a "$GITHUB_STEP_SUMMARY"
