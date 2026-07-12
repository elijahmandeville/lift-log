# Lift Log — setup

A single-page workout tracker. Runs entirely in your browser, stores data on your device, works offline once installed. No hosting fees, no login.

## What's in this folder
- `index.html` — the whole app
- `manifest.webmanifest`, `sw.js` — make it installable + offline
- `icon-192.png`, `icon-512.png`, `icon-512-maskable.png` — home-screen icons
- `SETUP.md` — this file

Keep all files together in one folder. Do not rename them.

## Publish it free on GitHub Pages

1. Go to github.com and create a new repository, e.g. `lift-log`. Set it **Public**.
2. Upload all the files in this folder to the repo (drag-and-drop on the repo page, then Commit).
3. In the repo: **Settings → Pages**.
4. Under **Build and deployment → Source**, choose **Deploy from a branch**. Pick branch `main`, folder `/ (root)`, then **Save**.
5. Wait ~1 minute. The page shows your live URL, like:
   `https://YOURNAME.github.io/lift-log/`

That URL is your app. It's HTTPS, which is required for the offline/install features.

## Install it on your phone

Open the URL on your phone, then:

- **iPhone (Safari):** tap the Share button → **Add to Home Screen**.
- **Android (Chrome):** tap the ⋮ menu → **Install app** (or **Add to Home Screen**).

It now launches full-screen from your home screen like a normal app and opens even with no signal.

## Using it
- **Log:** start a workout, add exercises, punch in weight × reps, tap the check when a set's done. Your last performance for each exercise shows up as a reference so you know what to beat.
- **History:** every saved session, with volume and a summary.
- **Progress:** pick an exercise to see your estimated 1-rep-max trend and a suggested target for next session. This is your progressive-overload view.
- **Body:** log bodyweight and watch the trend.
- **Data:** switch lb/kg, and **export a backup**.

## Backups (important)
Your data lives only on your phone. On the **Data** tab, tap **Export backup** every couple of weeks and save the `.json` file to Google Drive or Files. If you get a new phone or clear your browser, tap **Import** and pick that file to restore everything. The app nudges you if it's been 2+ weeks since your last export.

## Updating the app later
Edit `index.html` in the repo (or re-upload a new one). Next time you open the app online it pulls the new version automatically. Your logged data is untouched by updates.
