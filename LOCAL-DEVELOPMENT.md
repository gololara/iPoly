# Local development

Use Node.js 22.15 or later and npm. From a fresh clone:

```sh
npm run install:ci
npm run build
npm run db:migrate:local
npm run dev
```

Open the loopback URL printed by the dev server. Sign in with the simulated local account at `/signin-with-chatgpt?return_to=/` on the same origin if prompted. Add a learning language, then create a sample memory. The preview uses local D1 and R2 emulators. The mock sign-in exists only in development and the local data lives in `.wrangler/state`.

`npm run check:local` builds and checks the Sites profile using synthetic D1 and R2 fixtures. `npm run check:self-host` builds and checks the standalone profile. The build output is shared, so rerun the appropriate build before deploying or starting another profile.

For schema changes, edit `db/schema.ts` and run `npm run db:generate` to append a migration. Keep applied migrations intact. Run the local migration command again to apply only pending migrations.

## Interface translation

Add a message catalog next to `lib/ui-en.ts` and register it in `lib/ui-locale.ts` with its language code and native label. Use the Spanish source text as each message key. Add localized metadata and a manifest in `app/layout.tsx` and `public/`, and extend `tests/ui-locale-integration.mjs`. The interface language and the user's study languages are separate.
