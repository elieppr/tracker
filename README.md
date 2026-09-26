# Tracker

A personal dashboard for tracking habits, health metrics and time, with your data stored in your own Google Sheet.

- **Overview**: log entries and see each tracker's latest value.
- **Timeline**: a scrollable hour-by-hour view with a colored lane per category (plus a day-by-day list). Trackers can be moments (a coffee) or time spans with a start and end (sleep, work).
- **Insights**: find what goes along with something (like headaches), weekly patterns, how two trackers relate, and trends over time.
- **Manage**: create and edit trackers (each can record several values, e.g. distance and duration) and categories.

## Try it

Open `index.html?demo` to explore the app with sample data. Nothing is saved.

To try the app with realistic made-up data in your own sheet, use **Manage → Sample data → Add sample data**. It adds about 4 months of entries with patterns worth finding (for example, headaches after low-water days, short nights or drinks the evening before). **Remove sample data** takes them all out again without touching your own entries.

## Set up with Google Sheets

1. Create a blank Google Sheet.
2. In the sheet, open **Extensions → Apps Script**, replace the sample code with the contents of [`apps-script/Code.gs`](apps-script/Code.gs), and save.
3. Open **Project Settings** (gear icon) → **Script Properties** → add a property named `SECRET`, with a password you choose as its value.
4. Click **Deploy → New deployment**, choose type **Web app**, set *Execute as* to **Me** and *Who has access* to **Anyone**, then deploy and authorize.
5. Open `index.html` in your browser, paste the web app URL (ending in `/exec`), enter your password, and connect.

The script creates **Entries**, **Trackers** and **Categories** tabs in the sheet the first time it connects. You can view and edit them directly. Press **Refresh** in the app to pick up your changes.

After changing `Code.gs`, go to **Deploy → Manage deployments → ✏️ → Version: New version** so the same URL runs the new code. Sheets made by older versions of the script are upgraded automatically.

## Deploying from the terminal

Instead of pasting `Code.gs` by hand, you can push it with [clasp](https://github.com/google/clasp):

```bash
npm run deploy
```

This uploads `apps-script/` and updates the existing web app deployments, so their URLs don't change. One-time setup:

1. `npm install`, then turn on the **Google Apps Script API** at https://script.google.com/home/usersettings.
2. `npx clasp login` and sign in with the Google account that owns the sheet.
3. Create `.clasp.json` with your script's ID (Apps Script → Project Settings → IDs):
   `{"scriptId": "YOUR_SCRIPT_ID", "rootDir": "apps-script"}`
4. Run `npx clasp deployments` and put the web app deployment IDs (not `@HEAD`) in `.deployment.json`:
   `{"deploymentIds": ["AKfy..."]}`

Both files are git-ignored.

## Project layout

```
index.html           Page structure
css/styles.css       Styles (light and dark mode)
js/utils.js          Dates, formatting, storage helpers
js/api.js            Requests to the Apps Script backend, loading states, messages
js/app.js            App state, connection, Overview and the entry form
js/timeline.js       Timeline tab (hour-by-hour view and list)
js/insights.js       Insights charts and analysis
js/manage.js         Tracker and category editing
apps-script/Code.gs  Backend that runs in your Google Sheet
apps-script/appsscript.json  Apps Script project settings
dev/gas-mock.js      In-memory stand-in for Google Sheets (demo mode and tests)
dev/demo.js          Sample data for demo mode
dev/server.test.js   Backend tests
dev/deploy.sh        Pushes and redeploys the backend (npm run deploy)
```

The scripts are plain `<script>` files rather than modules, so the app works when you open `index.html` straight from disk.

## Tests

```bash
npm test
```
