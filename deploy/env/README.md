# Backend Environment Examples

These files are copy-paste starting points for deployed Symvolia backend services.
They are generated from the committed contract deployment JSON files in
`deployments/`:

```bash
node scripts/generate-backend-env-examples.mjs
```

Use the `*.backend.env.example` file that matches the chain your backend should
index. Replace placeholder RPC, Meilisearch, and CORS values before deploying.

Use `railway-meilisearch.env.example` for each Railway Meilisearch service. See
the full deployment guide in [deploy/README.md](../README.md) for Railway and
Docker Compose setup steps.