# Putting nukesim on the internet

This guide turns the app you run with `uv run nukesim-web` into a public website that anyone can
open with a link. You don't need to know about servers. Plan on about 30 minutes the first time.

## What we use, and why

**Render** ([render.com](https://render.com)) runs the website. Here is why:

- **You don't touch a server.** You connect your GitHub repository once. After that, every time you
  push a change, Render rebuilds the site and puts the new version live.
- **It can be free.** The free plan costs nothing. The catch: after 15 minutes with no visitors the
  site goes to sleep, and the next visitor waits about a minute while it wakes up. For $7 a month
  (the "Starter" plan) it stays awake all the time.
- **Everything is set up in one file.** [`render.yaml`](../render.yaml) in this folder holds the
  settings, so there is nothing to look up in menus.
- **HTTPS is included.** You get an address like `https://nukesim.onrender.com` with the padlock
  already working.

The other good choice is **Fly.io**. It has no free plan; a small always-on server costs about
$2–5 a month. You set it up with typed commands instead of a website, which is harder for a first
try. The same [`Dockerfile`](../Dockerfile) works on Fly.io, Railway, Google Cloud Run and most
other hosts, so you aren't locked in.

> Prices are from late 2026. Check the host's pricing page before you choose a plan.

### What it will cost

| Plan | Cost | What you get |
|---|---|---|
| Render Free | $0 | Sleeps after 15 min idle. The first visit after that takes about 1 minute. Good for trying it out and sharing with friends. |
| Render Starter | $7 / month | Always awake, 512 MB of memory. Enough for a few dozen people using it at once. |
| Your own domain (optional) | about $10–15 / year | An address like `whatifanukeexplodedunderwater.com` instead of `nukesim.onrender.com`. You buy it from a domain seller such as Namecheap or Cloudflare. |

The physics runs on the server, so more visitors means more work for it. The built-in limits
(below) stop any one person from using it all up.

## Step by step

### 1. Put the project on GitHub

Render gets your code from GitHub.

1. Make a free account at [github.com](https://github.com) if you don't have one.
2. Click **New repository**. Name it `nukesim` and leave everything else empty. Public or private
   are both fine.
3. GitHub then shows a few commands under "…or push an existing repository". In this project
   folder, run them. They look like this, with your user name:

   ```bash
   git remote add origin https://github.com/YOUR-NAME/nukesim.git
   ```

   ```bash
   git push -u origin main
   ```

Only committed work is uploaded. Commit your changes first.

### 2. (Optional) Try the website version on your own computer

This step checks the setup before anything goes online. It needs
[Docker Desktop](https://www.docker.com/products/docker-desktop/), so you can skip it.

```bash
docker build -t nukesim .
```

```bash
docker run --rm -p 8000:8000 nukesim
```

Open <http://localhost:8000>. This is exactly what Render will run. Press Ctrl+C in the terminal to
stop it.

### 3. Create the site on Render

1. Make an account at [render.com](https://render.com). The easiest way is **Sign in with GitHub**.
2. In the dashboard, click **New +** → **Blueprint**.
3. Pick your `nukesim` repository. Render finds `render.yaml` and shows one web service called
   `nukesim`.
4. Click **Apply**. Render now builds the image. The first build takes about 5 minutes; you can
   watch it in the **Logs** tab.
5. When the status says **Live**, click the address at the top
   (`https://nukesim-….onrender.com`). That's your website.

To change plan (Free ↔ Starter) or region, either edit `render.yaml` and push, or use the
service's **Settings** page on Render.

### 4. (Optional) Use your own domain

The planned address is **whatifanukeexplodedunderwater.com** (the page's link-preview tags in `index.html` already point to it). Add both `whatifanukeexplodedunderwater.com` and `www.whatifanukeexplodedunderwater.com`.

On Render, open the service → **Settings** → **Custom Domains** → **Add**. Render tells you which DNS
record to add at the company where you bought the domain. HTTPS is set up for it automatically.

## How to update the site

1. Change the code and check it locally (`uv run nukesim-web`, and `uv run pytest -q`).
2. Commit, then push:

   ```bash
   git push
   ```

3. Render notices the push and rebuilds. After a few minutes the new version is live. If a build
   fails, the old version keeps running, and the **Logs** tab says what went wrong.

To undo a bad update, open Render → **Events**, find an earlier deploy and click **Rollback**.

Visitors get the new version on their next page load, with no need to clear their browser
(see "How caching works" below).

## Protection that is already built in

Anyone on the internet can send requests to a public site, including automated scripts. The server
has these limits ([`server.py`](../src/nukesim/web/server.py) and
[`protect.py`](../src/nukesim/web/protect.py)):

| Limit | Value | Why |
|---|---|---|
| Animals/people/ships per request | 50 | Each one is a full calculation. |
| Uncertainty runs × receivers | 10,000 (e.g. 2000 runs × 5, or 200 runs × 50) | About 8 seconds of work at most. |
| Overlay grid | 64 × 40 cells (the app uses 48 × 30) | The "zones" overlay is the slowest request. |
| Fallout / timeline length | 365 days | |
| Request size | 64 kB | Normal requests are about 2 kB. |
| Requests per visitor | 180 per minute, 90 at once in a burst | An overlay counts as 6, an assessment as 2. |
| Calculations at the same moment | 8 | Extra visitors briefly see "busy, try again". |

If something unexpected goes wrong, the visitor only sees a short message ("an internal error").
The details go to the server log (Render → **Logs**) and are never shown in the browser.

You can change the per-visitor limit and the "at the same moment" limit without editing code. Set
these under **Environment** on Render, or in `render.yaml`:

- `NUKESIM_RATE_PER_MIN`: requests per visitor per minute (default 180)
- `NUKESIM_RATE_BURST`: how many requests can come in one go (default 90)
- `NUKESIM_MAX_BUSY`: calculations at the same moment (default 8)
- `NUKESIM_PROXY_HOPS`: how the server finds each visitor's address (default `1` in the Docker
  image). Leave it alone unless the next section applies.

### If every visitor gets "too many requests"

This means the server is treating all visitors as one person. It reads the visitor's address from
the `X-Forwarded-For` header, which the host adds. If the host puts more than one proxy in front of
the app, try `NUKESIM_PROXY_HOPS=2`. If it still happens, raise `NUKESIM_RATE_PER_MIN`.

## How caching works (and why it's set up this way)

A browser can keep copies of a site's files so it doesn't download them every time. The catch is
that after you update the site, a browser might keep running the old copy. Here is what this app
does:

- **The app's own files** (`index.html`, `app.js`, `style.css`, …) are sent with `no-cache`. That
  does *not* mean "download every time". It means "ask the server before using your copy". If the
  file hasn't changed, the server answers with a tiny "not modified" message and the browser uses
  its copy. So an update shows up on the very next page load, and an unchanged file costs one small
  round trip.
- **`vendor/`** (the three.js 3D library) only changes when we upgrade it. Browsers keep it for a
  day without asking.
- **Calculation results** (`/api/…`) are never stored, because they depend on the scenario.
- Files are **compressed** (gzip): three.js shrinks from about 670 kB to about 165 kB.

**The other option is versioned file names**, for example `app.3f9a1c.js`, where the name changes
whenever the content changes. Then the browser can keep every file forever and never even ask,
which saves one round trip per file per visit. The price is a build step that renames the files and
rewrites every `import` and `<script>` line on each change. Without that step, one forgotten rename
means visitors run a mix of old and new code. This app has about 14 small JavaScript files and no
build step, so the saving would be a fraction of a second on repeat visits. The current
`no-cache` + "not modified" setup is simpler and always shows the newest version, so we keep it.
Versioned names are worth adding later only if a bundler ever comes in.

## Checking that it's alive

`/healthz` answers `{"status": "ok"}` without doing any physics. Render uses it to check the site
is up and restarts the app if it stops answering. You can open
`https://YOUR-SITE.onrender.com/healthz` yourself.
