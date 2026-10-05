# Tyler's Collection

My shelves in one place — the manga library and wishlist, the game library and backlog, and my reading stats. Friends can browse, signed-in visitors can suggest manga, and admins manage everything from the dashboard.

Live at **https://imok-coding.github.io/base/**

## What's here

| Page          | Who      | What it does                                                                                                                                                                            |
| ------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Home**      | everyone | Collection stats, recently added, upcoming releases, recently read                                                                                                                      |
| **Manga**     | everyone | Library & wishlist with search, filters (status, demographic, genre, publisher, edition), sorting, series or volume view                                                                |
| **Series**    | everyone | Every owned and wished-for volume of a series, reading progress, next release                                                                                                           |
| **Games**     | everyone | Game library & wishlist with search, filters (platform, format, backlog, genre), sorting, grid or by-platform shelves                                                                   |
| **Dashboard** | admins   | Overview stats & charts, read-next / buy-next picks, release / read / purchase calendar, data-health manager, game stats & spreadsheet import, suggestions inbox, webhooks & user roles |

Admins also get, anywhere a volume or game appears: add / edit / bulk edit / move / hide / delete (with undo), multi-select, ISBN auto-fill and JSON / CSV / cover exports.

## Running it

```bash
npm install
npm run dev      # live Firestore data — http://localhost:5173/base/
npm run demo     # sample data + fake admin, nothing touches Firestore
npm run build    # production build into dist/
npm run deploy   # build and publish dist/ to the gh-pages branch
```

**Demo mode** (`npm run demo`) seeds an in-memory store from `public/manga-library-wishlist.json` and signs you in as a fake admin, so every screen can be tried safely. Use the account menu to view the site as an admin, a viewer or signed out.

## How it's built

- **React 18 + Vite**, React Router, plain CSS with design tokens (dark and light themes)
- **Firebase Auth** (Google sign-in) and **Cloud Firestore**
- Mobile-first: bottom tab bar and bottom sheets on phones, installable as an app (web manifest)

```
src/
  lib/                 firebase, data store (+ demo store), formatting, webhooks, ISBN lookup, exports
  components/ui/       Sheet, Menu, toasts & confirm, fields, star rating, covers…
  components/layout/   header, mobile tab bar
  features/auth/       auth context + sign-in page
  features/manga/      data model, live data provider, write API, pages and components
  features/dashboard/  stats, charts, dashboard sections
  features/games/      game model, spreadsheet importer, cover lookup, pages and components
  pages/               Home
```

### Firestore collections

| Collection            | Contents                                                                                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `library`, `wishlist` | one document per volume (`title`, `authors`, `publisher`, `date`, `cover`, `isbn`, `pageCount`, `rating`, `read`, `dateRead`, `datePurchased`, `amountPaid`, `msrp`, `specialType`, `hidden`, …) |
| `users`               | `role` (`admin` / `viewer`), `email`, `displayName`                                                                                                                                              |
| `suggestions`         | visitor suggestions                                                                                                                                                                              |
| `settings/webhooks`   | Discord webhook URLs                                                                                                                                                                             |
| `readNextState/{uid}` | read-next snoozes and shuffle seed                                                                                                                                                               |
| `games`               | one document per game copy (`title`, `platform`, `edition`, `format`, `status`, `backlog`, `priority`, `rating`, `genre`, `acquired`, `price`, hours, `cover`, …)                                |

Series are derived from titles (`"Series Name, Vol. 3"`). Hiding any volume hides its whole series from visitors.

## Game library

Games live in one `games` collection (one document per copy; `status` is Owned / Wishlist / Borrowed / Sold / Traded). Fields mirror the **Backlog** sheet of _Game_Library_and_Backlog_Tracker_Expanded.xlsx_ and the dropdowns mirror its **Lists** sheet.

**Importing:** Dashboard → Games → _Import from spreadsheet_ (or Games → ⋯). The `.xlsx` is read in the browser. Re-importing updates games that already exist (matched on title + platform + edition + format), adds new rows, and never erases a field because a cell is blank. Cover art is looked up on Wikipedia; any cover can be changed from the game's editor (_Find cover_).

**Firestore rule** — the `games` collection needs its own rule (Firebase console → Firestore → Rules, inside `match /databases/{database}/documents`):

```
match /games/{gameId} {
  allow read: if true;
  allow write: if request.auth != null
    && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "admin";
}
```

## Notes

- `public/manga-library-wishlist.json` is the offline fallback if Firestore can't be reached. Refresh it from **Dashboard → Settings → Backup**.
- Discord webhook URLs ship to the browser, so treat them as public: rotate them if they're ever abused, or move posting into a Cloud Function.
