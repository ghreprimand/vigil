# Contributing

Thanks for taking the time to improve Vigil. Keep contributions focused, reviewable, and suitable for a public repository.

## Non-Negotiable Rules

1. Do not include private or sensitive data in any file, fixture, comment, test, commit message, issue, or pull request. Use placeholders such as `vigil.example.com`, `you@example.com`, `security@example.com`, `conduct@example.com`, and `vigil-push-1`.
2. Public artifacts must be plain ASCII and must not carry AI fingerprints. Use straight quotes, normal hyphens, and ordinary human wording.
3. Commits must be human-authored. Use conventional commit messages, do not add AI attribution, and do not add co-author or generated-by trailers.

## Development Setup

Requirements:

- Node.js 22 or newer
- npm

There are no external services; the database is a local SQLite file.

Install dependencies:

```sh
npm ci
```

Build:

```sh
npm run build
```

Run tests:

```sh
npm test
```

Run the app locally:

```sh
npm run dev
```

Docker Compose deployment files are documented separately when present in the checkout.

## Pull Requests

- Keep changes scoped to one problem.
- Include tests for behavior changes.
- Update documentation when user-facing behavior changes.
- Confirm the build, test suite, denylist scan, and ASCII scan pass before requesting review.
- Do not commit `.env`, local database dumps, logs, or private build notes.

## Reporting Security Issues

Do not open a public issue for a vulnerability report. Email `security@example.com` with enough detail to reproduce and assess the issue.
