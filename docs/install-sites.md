# Install iPoly on OpenAI Sites

You need a ChatGPT or Codex account with access to the Sites plugin and permission to create a private Site. Clone or download the iPoly source, then open that folder in Codex with Sites enabled. You can give Codex this instruction:

> Use this iPoly checkout to create a new, owner-only private Site in my account. Keep the existing Worker app and the DB, BUCKET, and MCP settings in .openai/hosting.json. Create a Site for my installation, set its new project ID in this checkout, build the default Sites profile and publish it privately. Apply the included schema migrations to the new database.

Sites supplies sign-in and connects a D1 database (`DB`) and R2 bucket (`BUCKET`) to the Site. The source starts without a project ID. Keep the ID assigned to your installation for upgrades. Use the default `npm run build` profile with the Sites publishing workflow. Sites applies pending D1 migrations during publication. Keep the installation owner-only if the memories are for personal use.

Open the private URL, sign in, and pick your first study language. Create a test memory to confirm the database works. Add a sample image to verify attachments.

## Connect ChatGPT

When Sites publishes a Site with the MCP capability, it provisions a private plugin. Open the Site's plugin from ChatGPT or Codex and install or connect it if prompted. In your language chat, choose iPoly and ask it to check which study languages you have configured. A read-only status check uses `ipoly_estado`. For an existing memory, ask ChatGPT to show the proposed addition before saving it. The stored original and the new contribution remain separate.

## Update an existing installation

Keep your installation's project ID, existing D1 and R2 resources, and access settings. Merge the new release into that checkout and republish the same Site. Sites applies pending migrations. Reopen the Site and verify an existing memory and attachment, then use the connected plugin from ChatGPT if you use it.
