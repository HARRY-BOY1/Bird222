# Bird Messenger

Bird uses a Telegram-style interface and connects directly to the existing `soakalshorja` API and Socket.IO service. Only the reference project's client was used; its separate server, MongoDB, NextAuth, and UploadThing backend are not part of this app.

## Run locally

```bash
npm ci
NEXT_PUBLIC_SERVER_URL=https://soakalshorja-production.up.railway.app npm run dev
```

The client uses username/password authentication, contact lookup and creation, profile updates, avatar/file uploads, message history, and real-time messaging from the existing Bird server.

## Publish

GitHub Actions builds a static export under `/Bird222` and deploys the `out/` directory to GitHub Pages. In repository settings, Pages should use GitHub Actions as the deployment source.
