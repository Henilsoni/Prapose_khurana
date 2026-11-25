# Love Proposal — GitHub Pages + Telegram

This repository is arranged so the website frontend can be hosted free on **GitHub Pages**. Telegram messages and media uploads are handled by a separate **Cloudflare Worker**, so the Telegram bot token is never placed in public GitHub files.

## 1. Deploy the website with GitHub Pages

1. Create a GitHub repository and upload the contents of this folder (keep `index.html`, `script.js`, `style.css`, `config.js`, and the `animations/` folder at the repository root).
2. In GitHub, open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select branch `main` and folder `/ (root)`, then Save.
5. Wait for GitHub Pages to publish your site. Your link will look like `https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/`.

## 2. Deploy the Telegram backend with Cloudflare Workers

GitHub Pages cannot run Python or hide a Telegram bot token. Deploy the included Worker separately:

1. Create/sign in to a Cloudflare account.
2. Install Node.js, then open a terminal in the `worker` folder.
3. Run `npx wrangler login`.
4. Deploy with `npx wrangler deploy`.
5. Add the three secrets (replace the values when prompted):

   ```bash
   npx wrangler secret put BOT_TOKEN
   npx wrangler secret put CHAT_ID
   npx wrangler secret put ALLOWED_ORIGIN
   ```

   `BOT_TOKEN`: your Telegram bot token.  
   `CHAT_ID`: your Telegram numeric chat ID (not your phone number).  
   `ALLOWED_ORIGIN`: your exact GitHub Pages origin, for example `https://YOUR-USERNAME.github.io` (no repository path and no trailing slash).

6. Deploy again: `npx wrangler deploy`.
7. Cloudflare will show a Worker URL ending in `.workers.dev`.

## 3. Connect GitHub Pages to your Worker

Open `config.js` in the repository and replace the placeholder with your Worker URL:

```js
window.TELEGRAM_API_BASE = 'https://YOUR-WORKER-NAME.YOUR-SUBDOMAIN.workers.dev';
```

Commit and push the change. GitHub Pages will publish the updated website automatically.

## 4. Test

1. Open your published GitHub Pages link using HTTPS.
2. First, message your Telegram bot and press Start so it can message you.
3. Accept the clearly worded first-screen notice only if you agree to the described activity reporting and media uploads.
4. Check that a `session_started` message arrives, then navigate screens and test a photo/video upload.

## Important notes

- The first screen explains what is sent to Telegram. Activity reporting and media uploads start only after the visitor accepts. If they skip, those features remain disabled.
- Camera/microphone access is requested by the browser. A visitor can deny it; the rest of the website should still be usable.
- The Telegram bot token belongs only in Cloudflare Worker secrets. **Never paste it into `config.js`, `script.js`, or any GitHub file.**
- Uploads are limited to 48 MB by this implementation. Large videos may fail; keep recordings short.
- Telegram sends the final recording as a document attachment so the original WebM file is preserved.
- Browser camera/microphone access requires HTTPS or localhost. GitHub Pages provides HTTPS.
- This Worker checks the allowed website origin. Origin checks are not a complete anti-abuse system; if you share the site widely, add Cloudflare rate limiting/WAF rules to the Worker route.
- This is a static frontend plus a hosted Worker; there is no need to run `python app.py` on your own computer after deployment.
