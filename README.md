# Tyler's Collection

My manga and game collection site. It has my manga library and wishlist, my game library and backlog, and some reading stats. Anyone can browse, people who sign in can suggest manga, and I manage everything from the dashboard.

Live site: https://imok-coding.github.io/base/

## Pages

- **Home**: stats, recently added, upcoming releases, recently read
- **Manga**: library and wishlist with search, filters and sorting. Click a series to see all of its volumes.
- **Games**: game library and wishlist, as a grid or grouped by platform
- **Dashboard** (admins only): stats and charts, read next / buy next picks, a release calendar, a manager for filling in missing info, game stats and the spreadsheet import, suggestions, and settings

Only admins can edit anything, including ratings and game review videos.

## Running it locally

```bash
npm install
npm run dev     # uses the real Firestore data
npm run demo    # sample data and a fake admin login, nothing gets saved
npm run deploy  # builds and pushes to the gh-pages branch
```

## Stack

React + Vite, React Router and plain CSS. Firebase handles Google sign-in and Firestore stores the data.

## Data

Firestore collections:

- `library` / `wishlist`: one doc per manga volume
- `games`: one doc per game copy
- `users`: role is `admin` or `viewer`
- `suggestions`, `settings/webhooks`, `readNextState`

Series are grouped by title ("Series Name, Vol. 3"). Hiding one volume hides the whole series.

### Games import

Dashboard > Games > Import from spreadsheet. It reads the Backlog tab of my `Game_Library_and_Backlog_Tracker_Expanded.xlsx`. Re-importing updates games that match (title + platform + edition + format) and adds new ones, and blank cells don't erase anything.

Covers come from the PlayStation Store for PlayStation games (its old search API still allows calls from any site) and from Wikipedia for everything else, or when the store has nothing. Any cover can be changed in the game editor.

Games can be hidden from the game page, the editor, or by selecting a few. Hidden games don't show up for visitors and don't count as missing covers, but they still count toward money spent on the dashboard.

The `games` collection needs this Firestore rule:

```
match /games/{gameId} {
  allow read: if true;
  allow write: if request.auth != null
    && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "admin";
}
```

### Other notes

- `public/manga-library-wishlist.json` is a backup that gets used if Firestore can't be reached. You can download a fresh one from Dashboard > Settings > Backup.
- The Discord webhook URLs end up in the browser code, so they're basically public.
