# Security

HarnessProof intentionally runs a plugin package inside an isolated temporary DSH profile. Treat a plugin under test as executable code and run it only in a repository and workflow you trust.

- The Action requests no secrets and does not call a model or plugin-owned remote service.
- The isolated DSH installation contacts only the configured HTTPS npm registry.
- The Web health probe binds to loopback and requires HTTP 200.
- The temporary consumer directory is removed after the report is written.
- A passing report does not prove plugin-tool correctness, data safety, or production readiness.

For a possible vulnerability, open a minimal GitHub issue without credentials, private repository content, client data, or exploit secrets. Do not include personal data.
