# Exposing the backend with ngrok

`home-services-app` (and `home-services-company-app`) run on a phone or emulator, which cannot reach `localhost:4000` on your development machine — `localhost` from the phone's perspective is the phone itself. ngrok opens a public HTTPS tunnel to your local backend so a physical device (over Wi-Fi, or over the internet via Expo Go) can reach it.

## One-time setup

1. Install the ngrok CLI — [ngrok.com/download](https://ngrok.com/download), or `choco install ngrok` on Windows.
2. Create a free ngrok account and grab your authtoken from the [ngrok dashboard](https://dashboard.ngrok.com/get-started/your-authtoken).
3. Authenticate the CLI once:
   ```bash
   ngrok config add-authtoken <your-token>
   ```

## Every dev session

1. Start the backend as usual:
   ```bash
   npm run dev
   ```
2. In a second terminal, start the tunnel:
   ```bash
   npm run tunnel
   ```
3. ngrok prints a `Forwarding` line — copy the `https://` URL (something like `https://a1b2-c3d4.ngrok-free.app`). That's your backend's public address for this session.
4. Put it in the mobile app's `.env` as `EXPO_PUBLIC_API_BASE_URL=https://a1b2-c3d4.ngrok-free.app/api/v1` (see the app's own README) and restart the Expo dev server so it picks up the new value.

## Why you don't need to touch `CORS_ORIGINS`

`src/app.js` allows any `*.ngrok-free.app` / `*.ngrok.app` / `*.ngrok.io` / `*.ngrok.dev` origin automatically whenever `NODE_ENV` isn't `production` — on top of whatever's explicitly listed in `CORS_ORIGINS`. A free ngrok tunnel gets a new random subdomain every time it restarts; without this, you'd have to edit `.env` and restart the backend every single session. This is intentionally scoped to non-production only — see the comment in `app.js`.

## The one gotcha: the ngrok warning page

Free ngrok tunnels show an HTML interstitial ("this site is served by ngrok, click to continue") on the **first** request from a given browser — and by default, on *every* request from a non-browser client, since there's no cookie to remember past it. If your app suddenly starts getting HTML back instead of JSON, this is why.

Fix: send this header on every request (already wired into `home-services-app`'s API client):
```
ngrok-skip-browser-warning: true
```

## Production

None of this applies in production — a real deployment gets a stable domain and doesn't need a tunnel. The ngrok-origin allowance in `app.js` is compiled out (`env.isProduction` check) specifically so it can never accidentally apply there.
