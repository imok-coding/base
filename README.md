# Tyler's Collection

My shelves in one place — the manga library, the wishlist and my reading stats. Friends can browse, signed-in visitors can suggest titles, and admins manage everything from the dashboard. Games are next.

Live at **https://imok-coding.github.io/base/**

## What's here

| Page          | Who      | What it does                                                                                                                                           |
| ------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Home**      | everyone | Collection stats, recently added, upcoming releases, recently read                                                                                     |
| **Manga**     | everyone | Library & wishlist with search, filters (status, demographic, genre, publisher, edition), sorting, series or volume view                               |
| **Series**    | everyone | Every owned and wished-for volume of a series, reading progress, next release                                                                          |
| **Games**     | everyone | Placeholder for the upcoming game library                                                                                                              |
| **Dashboard** | admins   | Overview stats & charts, read-next / buy-next picks, release / read / purchase calendar, data-health manager, suggestions inbox, webhooks & user roles |

Admins also get, anywhere a volume appears: add / edit / bulk edit / move / hide / delete (with undo), multi-select, ISBN auto-fill and JSON / CSV / cover exports.

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
  pages/               Home, Games
```

### Firestore collections

| Collection            | Contents                                                                                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `library`, `wishlist` | one document per volume (`title`, `authors`, `publisher`, `date`, `cover`, `isbn`, `pageCount`, `rating`, `read`, `dateRead`, `datePurchased`, `amountPaid`, `msrp`, `specialType`, `hidden`, …) |
| `users`               | `role` (`admin` / `viewer`), `email`, `displayName`                                                                                                                                              |
| `suggestions`         | visitor suggestions                                                                                                                                                                              |
| `settings/webhooks`   | Discord webhook URLs                                                                                                                                                                             |
| `readNextState/{uid}` | read-next snoozes and shuffle seed                                                                                                                                                               |

Series are derived from titles (`"Series Name, Vol. 3"`). Hiding any volume hides its whole series from visitors.

## Adding the game library

`features/manga` is the template: a model (`model.js`), a live provider (`MangaData.jsx`), a write API (`api.js`) and pages built from the shared UI components. A `features/games` module with `games` / `gameWishlist` collections can follow the same shape, then replace `pages/Games.jsx`.

## Notes

- `public/manga-library-wishlist.json` is the offline fallback if Firestore can't be reached. Refresh it from **Dashboard → Settings → Backup**.
- Discord webhook URLs ship to the browser, so treat them as public: rotate them if they're ever abused, or move posting into a Cloud Function.
