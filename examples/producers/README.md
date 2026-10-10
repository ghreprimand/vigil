# Reference Producers

These scripts show how to submit package manifests to Vigil. Treat them as references, not as the only supported ingestion path.

- `pacman-push.sh` reads installed packages from pacman.
- `plaintext-push.sh` reads `name version` lines from a file or standard input.

For another package manager, a pure source-built system, or a custom build database, write a producer that emits the same JSON shape and HMAC headers.

See [the manifest contract](../../docs/manifest-contract.md).
