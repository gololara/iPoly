# Install iPoly on Cloudflare Workers

The standalone build uses a Worker with Cloudflare D1 for records and R2 for files. It is a single-user installation protected by HTTPS and HTTP Basic authentication. Use a separate Worker, database, and bucket for each installation. A compatible MCP client can connect using the same credentials. OpenAI Sites provides its own ChatGPT connection, which is specific to that hosting option.

## First deployment

1. Install Node.js 22.15 or later, clone the source, and run `npm run install:ci`.
2. Log in with `npx wrangler login`, create a database with `npx wrangler d1 create ipoly`, and create a bucket with `npx wrangler r2 bucket create ipoly-files`. Enable R2 in your Cloudflare account if required.
3. Copy [the example configuration](../deploy/cloudflare/wrangler.example.jsonc) to `wrangler.self-host.jsonc` at the repository root. Set the Worker name, D1 database name and ID, and R2 bucket name to your resources. The config is ignored by Git. Keep `assets.run_worker_first` enabled.
4. Build, apply the schema, and deploy:

   ```sh
   npm run build:self-host
   npx wrangler d1 migrations apply DB --remote --config wrangler.self-host.jsonc
   npx wrangler deploy --config wrangler.self-host.jsonc
   npx wrangler secret put IPOLY_OWNER_PASSWORD --config wrangler.self-host.jsonc
   ```

5. When prompted, enter a unique secret of 32–128 characters using letters, numbers, underscores, or hyphens. For example, generate one with `openssl rand -hex 32` and save it in your password manager. The Worker serves no private content before the secret is configured. Use your HTTPS Worker URL and sign in as `ipoly` with this secret. Pick a study language and create a sample memory with an attachment.

For an MCP client that supports HTTP Basic authentication or a custom Authorization header, point it to `https://YOUR_WORKER_HOST/mcp`. Supply the secret in the client's credential settings. This endpoint uses the same owner account as the web app. Keep the credentials private and use a client you trust with your learning records.

## Updates and other hosts

Keep the same Worker, credentials, D1 database, and R2 bucket. Review the release notes, build the standalone profile again, apply pending migrations, then deploy with the same configuration. Verify that an existing memory and attachment still open.

iPoly uses a Worker runtime with D1 and R2 bindings. Running it on a different runtime requires equivalent storage adapters and a trusted authentication boundary. The static files alone do not run the app.

[Wrangler deployment](https://developers.cloudflare.com/workers/wrangler/commands/workers/) · [D1 migrations](https://developers.cloudflare.com/workers/wrangler/commands/d1/) · [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
