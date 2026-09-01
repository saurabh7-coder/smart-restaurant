# 🍽️ Smart Restaurant Menu & Table Reservation System

A full-stack web application that replaces paper menus and phone bookings with a
digital menu and an online table-reservation system.

**Stack:** React (Vite) · Node.js + Express · MongoDB (Mongoose) · JWT + bcrypt

---

## Contents

1. [What it does](#what-it-does)
2. [The core design decision](#the-core-design-decision)
3. [Prerequisites](#prerequisites)
4. [Installation](#installation)
5. [Running it](#running-it)
6. [Demo accounts](#demo-accounts)
7. [Verifying it works](#verifying-it-works)
8. [Environment variables](#environment-variables)
9. [Project structure](#project-structure)
10. [API reference](#api-reference)
11. [Data model](#data-model)
12. [Security](#security)
13. [Deployment](#deployment)
14. [Known limitations](#known-limitations)

---

## What it does

### Customers
Browse the menu with photos, prices, descriptions, ingredients, allergens and
veg/non-veg/vegan labels · search, filter by category, dietary type and price ·
sort by price, rating or popularity · register and log in · check **live table
availability** for a date, time and party size · pick a table · book · get a
unique booking ID · view, modify and cancel their own bookings · leave reviews
after dining.

**Order food** three ways — pre-order against a booking so it is ready on
arrival, order from the table by scanning its QR code, or order takeaway for
collection · a persistent cart · promo codes · a bill with GST calculated by the
server · pay online (card, UPI, netbanking, wallet), **cash on delivery**, or at
the restaurant · live order tracking from placed → accepted → preparing → ready
→ out for delivery → delivered.

**Rewards** — earn points on every completed order, climb Bronze → Platinum
tiers, and redeem points against a bill · **recommendations** built from order
history, each explaining why it was suggested · **rate the dishes you actually
ate**, prompted from your completed orders.

**Smart features** — a **meal planner** that builds a full meal inside a budget
and calorie target · **voice or typed ordering** ("two paneer tikka and one
coke") · a **menu chatbot** that answers only from tonight's menu · **allergy
warnings** on every dish once you declare what you react to · **substitutions**
when a dish is unavailable.

### Staff
A service board grouped by seating time · confirm bookings · mark guests arrived,
completed or no-show · update live table status on the floor · a **kitchen board**
of live order tickets in four columns, auto-refreshing, with tickets flagged red
after 25 minutes.

### Admins
Dashboard with live metrics · full CRUD for menu items, categories, tables,
reservations, orders, customers, staff accounts, reviews and promo codes ·
reservation workflow actions including moving a booking to another table or slot ·
order workflow plus refunds · printable per-table QR codes · reports covering
booking trends, peak seating times, party sizes, best-selling dishes and revenue
by ordering channel · restaurant and ordering settings.

---

## The core design decision

**One table can hold at most one active reservation per seating slot, and this is
enforced by the database — not by application code.**

Reservations use a **fixed, non-overlapping seating grid** (90 minutes by default,
configurable). A booking is therefore identified by the pair `(table, slotStart)`,
which can be expressed as a unique index:

```js
// server/src/models/Reservation.js
reservationSchema.index(
  { table: 1, slotStart: 1 },
  { unique: true, partialFilterExpression: { isActive: true } },
);
```

`isActive` is true for every status that still holds the table (pending, confirmed,
arrived, completed) and false once cancelled or marked a no-show — so a released
table becomes instantly re-bookable, while an occupied one physically cannot be
booked twice.

**Why not just check availability before inserting?** Because a `findOne()` check
followed by a `create()` is a race: two simultaneous requests can both pass the
read before either performs the write, and both get the table. Here the *insert
itself is the check*. When two customers race, MongoDB accepts exactly one and
rejects the other with error `E11000`, which the controller turns into a clean
`409 Conflict` with a readable message. When the customer chose "any table", the
controller retries against the next free table instead of failing.

This is verified by an actual test — see [Verifying it works](#verifying-it-works).

**Trade-off:** fixed slots mean a guest cannot book at, say, 7:15 PM if the grid
runs 6:30 / 8:00. That is the price of an airtight guarantee, and it matches how
most restaurants actually run sittings. Change `SLOT_MINUTES` to adjust.

---

## How money is handled

Two rules govern every rupee in this system.

**1 — Prices are never trusted from the browser.**
The cart sends dish ids and quantities. Nothing else. Subtotal, discount, GST and
total are all recomputed server-side from current database prices in
[`utils/pricing.js`](server/src/utils/pricing.js), for both the checkout quote and
the real order. Posting `{"menuItem": "…", "quantity": 1, "price": 1}` gets you a
dish at its real price — the `price` field is simply ignored.

**2 — Money is stored as integer paise, never floating-point rupees.**
`0.1 + 0.2 !== 0.3` in binary floating point, and a bill is a sum of many such
numbers plus a percentage tax. Every amount is an integer (`34900`, not `349.00`),
so the arithmetic is exact — and paise is also the unit Razorpay expects, so
nothing is converted at the payment boundary. The division by 100 happens once,
at display time.

### Online payment (Razorpay)

Optional. With `PAYMENT_PROVIDER=none` the whole app works and every order is
pay-at-restaurant; no keys are needed to run or demo the project.

When it is switched on, the flow is:

```
browser                    this server                      Razorpay
   │  POST /payments/session    │                               │
   ├───────────────────────────►│  create order (amount from    │
   │                            │  the DB, not the request) ───►│
   │◄─── gateway order id ──────┤                               │
   │  opens Razorpay Checkout ──┼──────────────────────────────►│
   │◄─── order_id, payment_id, signature ──────────────────────┤
   │  POST /payments/verify     │                               │
   ├───────────────────────────►│  HMAC_SHA256(order|payment,   │
   │                            │  key_secret) === signature ?  │
   │                            │  ── only then: mark PAID ──   │
   │                            │◄─── webhook (safety net) ─────┤
```

The security-critical points:

- **The browser saying "paid" counts for nothing.** An order is marked paid only
  when the HMAC signature verifies against the key secret, which never leaves the
  server. Signatures are compared in constant time.
- **An unpaid order is invisible to the kitchen.** It sits in `awaiting_payment`
  until a verified payment promotes it to `placed`.
- **Replay is blocked.** The signed gateway order id must be the one created for
  *this* order, so a valid signature from a cheaper order cannot be reused.
- **The webhook is verified over the raw request body**, which is why
  `express.raw()` is mounted on that path before the JSON parser — re-serialising
  parsed JSON would change the bytes and break the HMAC.
- **Marking paid is idempotent.** The browser callback and the webhook routinely
  both arrive; a conditional update means whichever lands first wins and the
  other is a no-op, so a promo code is never double-counted.

### Enabling it

1. Create a free Razorpay account and copy your **test** keys (they start with
   `rzp_test_` and move no real money).
2. In `server/.env`:
   ```
   PAYMENT_PROVIDER=razorpay
   RAZORPAY_KEY_ID=rzp_test_xxxxxxxx
   RAZORPAY_KEY_SECRET=xxxxxxxx
   ```
3. Restart the API. "Pay online now" appears at checkout automatically.
4. *(Recommended)* Add a webhook in the Razorpay dashboard pointing at
   `POST https://<your-api>/api/payments/webhook` for the events
   `payment.captured` and `payment.failed`, and put its secret in
   `RAZORPAY_WEBHOOK_SECRET`. This is what rescues an order when the customer
   closes the tab mid-payment. A localhost API needs a tunnel (ngrok, Cloudflare
   Tunnel) to receive webhooks.

Keys live in the environment only — they are deliberately **not** editable from
the admin Settings screen, because secrets do not belong in a database.

---

## Prerequisites

| Requirement | Version | Check with |
| --- | --- | --- |
| Node.js | 18.17 or newer | `node -v` |
| npm | 9 or newer | `npm -v` |
| MongoDB | 6.0 or newer (local or Atlas) | `mongod --version` |

**Installing Node** — download the LTS installer from <https://nodejs.org>, or on
macOS with Homebrew: `brew install node`.

**Installing MongoDB** — either:
- **Local:** follow <https://www.mongodb.com/docs/manual/administration/install-community/>
  (macOS: `brew tap mongodb/brew && brew install mongodb-community && brew services start mongodb-community`), or
- **Cloud (no install):** create a free cluster at <https://www.mongodb.com/atlas>
  and use its connection string as `MONGO_URI`.

<details>
<summary><strong>No Homebrew, no admin rights? Install both into your home directory</strong></summary>

This is how the development machine for this project is set up — everything lives
under `~/.local/opt`, nothing needs `sudo`, and removing the two folders undoes it.

```bash
mkdir -p ~/.local/opt && cd ~/.local/opt

# Node (macOS arm64 — change the slug for your platform)
curl -fsSL https://nodejs.org/dist/v24.19.0/node-v24.19.0-darwin-arm64.tar.gz | tar -xz
mv node-v24.19.0-darwin-arm64 node

# MongoDB Community (macOS arm64)
curl -fsSL https://fastdl.mongodb.org/osx/mongodb-macos-arm64-8.3.7.tgz | tar -xz
mv mongodb-macos-aarch64--8.3.7 mongodb

# put both on PATH for every shell
cat >> ~/.zshenv <<'EOF'
export PATH="$HOME/.local/opt/node/bin:$HOME/.local/opt/mongodb/bin:$PATH"
EOF
```

Start the database (macOS builds do **not** support `--fork`, so run it in its own
terminal or with `&`):

```bash
mkdir -p ~/.local/var/mongodb/data
mongod --dbpath ~/.local/var/mongodb/data --bind_ip 127.0.0.1 --port 27017
```

</details>

> **macOS note:** the API defaults to port **5050**, not 5000, because the AirPlay
> Receiver in System Settings occupies port 5000 and would cause `EADDRINUSE`.

---

## Installation

```bash
# 1 — from the project root, install both workspaces
npm install

# 2 — create the server environment file
cp server/.env.example server/.env

# 3 — set a real JWT secret
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
#    paste the output into JWT_SECRET in server/.env
#    (and set MONGO_URI if you are using Atlas)

# 4 — load the demo restaurant, menu, tables and accounts
npm run seed
```

---

## Running it

```bash
npm run dev
```

- API → <http://localhost:5050>
- Web → <http://localhost:5173>

The Vite dev server proxies `/api` and `/uploads` to Express, so the browser sees
a single origin and no CORS configuration is needed while developing.

Run them separately if you prefer:

```bash
npm run dev:server
npm run dev:client
```

Other scripts:

```bash
npm run seed                  # add demo data (keeps existing records)
npm run seed -- --fresh       # wipe the collections, then seed
npm run test:concurrency      # prove the double-booking guarantee
npm run build                 # production build of the React app
```

---

## Demo accounts

Created by `npm run seed`, which loads **63 dishes across 12 categories**, 12
tables, promo codes and the accounts below. All seeded content is **fictional
demo data**; the dish photographs are real, CC-licensed images from Wikimedia
Commons — see [`server/uploads/dishes/CREDITS.md`](server/uploads/dishes/CREDITS.md)
for per-image attribution.

The menu itself lives in
[`server/src/data/menuData.js`](server/src/data/menuData.js), shared by the
seeder so there is one source of truth for it.

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@restaurant.test` 
| Staff | `staff@restaurant.test` 
| Customer | `rahul@example.test`

Change these in `server/.env` before seeding, and never use them in production.

---

## Verifying it works

### The double-booking test

With the API running and the database seeded:

```bash
npm run test:concurrency
```

This fires **8 simultaneous booking requests for the same table in the same slot**
from 8 different accounts, against the real HTTP API and the real database, and
asserts:

1. exactly **one** request returns `201 Created`
2. the other **seven** return `409 Conflict`
3. no request returns a `5xx`
4. every rejection carries a readable message
5. the table then reads as unavailable for that slot
6. cancelling the winner releases the slot for re-booking

It exits `0` on pass and `1` on failure. Adjust the load with
`ATTEMPTS=20 npm run test:concurrency`.

### Manual walkthrough

**Customer journey:** register → browse `/menu` → search and filter → open a dish →
`/reservation` → pick date, guests, slot and table → confirm → note the booking ID →
`/my-bookings` → modify it → cancel it.

**Admin journey:** log in as admin → `/admin` dashboard → Menu → add a dish with an
image → Tables → add a table → Reservations → confirm, move and complete a booking →
Customers → Reports → Settings.

**Role enforcement:** log in as a customer and open `/admin` — you are refused. Then
confirm the API refuses too, not just the UI:

```bash
curl -i http://localhost:5050/api/stats/dashboard          # 401
curl -i -X POST http://localhost:5050/api/tables           # 401
```

**Responsiveness:** resize to ~375 px, ~768 px and ~1440 px. The nav collapses to a
menu button and wide tables scroll inside their own container.

---

## Environment variables

All server configuration lives in `server/.env` (see `server/.env.example`).

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `5050` | API port |
| `NODE_ENV` | `development` | Enables rate limiting and hides stack traces when `production` |
| `CLIENT_URL` | `http://localhost:5173` | Allowed CORS origin in production |
| `MONGO_URI` | `mongodb://127.0.0.1:27017/smart_restaurant` | Database connection string |
| `JWT_SECRET` | *(required)* | Token signing key — **must** be changed |
| `JWT_EXPIRES_IN` | `7d` | Token lifetime |
| `BCRYPT_ROUNDS` | `10` | Password hashing cost |
| `SLOT_MINUTES` | `90` | Length of one seating |
| `OPEN_TIME` / `CLOSE_TIME` | `11:00` / `23:00` | Bounds of the slot grid |
| `RESTAURANT_UTC_OFFSET_MINUTES` | `330` | Restaurant's wall clock (330 = IST) |
| `MAX_BOOKING_DAYS_AHEAD` | `60` | Booking horizon |
| `SEED_*` | see example | Demo account credentials |

> Changing `SLOT_MINUTES`, `OPEN_TIME` or `CLOSE_TIME` moves the slot grid.
> Existing bookings keep their stored times but will no longer sit on the new
> grid, so change these before taking real bookings.

---

## Project structure

```
Resturant/
├── package.json               npm workspaces + dev scripts
├── server/
│   ├── .env.example
│   ├── scripts/
│   │   └── concurrencyTest.js live double-booking test
│   ├── uploads/               dish images (git-ignored)
│   └── src/
│       ├── server.js          bootstrap, graceful shutdown
│       ├── app.js             express app, middleware chain
│       ├── seed.js            demo data
│       ├── constants.js       roles, statuses, transitions
│       ├── config/            env parsing, db connection
│       ├── models/            8 Mongoose schemas + Counter
│       ├── controllers/       request handling and business rules
│       ├── routes/            REST endpoints + validation chains
│       ├── middleware/        auth, validation, upload, errors, rate limits
│       └── utils/             slot engine, error class, async wrapper
└── client/
    ├── vite.config.js         dev proxy to the API
    └── src/
        ├── App.jsx            routes
        ├── styles.css         design tokens, light + dark
        ├── api/client.js      typed API wrapper
        ├── context/           auth, restaurant profile, toasts
        ├── components/        layout, guards, cards, UI primitives
        └── pages/
            ├── (customer)     Home, Menu, FoodDetails, Reservation, …
            ├── staff/         StaffBoard
            └── admin/         Dashboard, MenuManage, TableManage, …
```

---

## API reference

Base URL `/api`. Authenticated requests send `Authorization: Bearer <token>`.
Every response is `{ success, message?, data?, meta?, details? }`.

### Auth
| Method | Path | Access |
| --- | --- | --- |
| POST | `/auth/register` | public (always creates a **customer**) |
| POST | `/auth/login` | public |
| POST | `/auth/logout` | public |
| GET | `/auth/me` | authenticated |
| PUT | `/auth/profile` | authenticated |
| PUT | `/auth/password` | authenticated |

### Menu & categories
| Method | Path | Access |
| --- | --- | --- |
| GET | `/menu` | public — `search`, `category`, `foodType`, `minPrice`, `maxPrice`, `sort`, `page` |
| GET | `/menu/:id` | public (includes reviews) |
| POST · PUT · DELETE | `/menu` · `/menu/:id` | admin (multipart for image upload) |
| GET | `/categories` | public |
| POST · PUT · DELETE | `/categories` · `/categories/:id` | admin |

### Tables
| Method | Path | Access |
| --- | --- | --- |
| GET | `/tables` | public |
| POST · PUT · DELETE | `/tables` · `/tables/:id` | admin |
| PATCH | `/tables/:id/status` | staff or admin |

### Reservations
| Method | Path | Access |
| --- | --- | --- |
| GET | `/reservations/availability` | public — `date`, `guests`, `time` |
| POST | `/reservations` | authenticated |
| GET | `/reservations/mine` | authenticated — `scope=upcoming\|past` |
| GET | `/reservations/:id` | owner, staff or admin |
| PUT | `/reservations/:id` | owner, staff or admin |
| DELETE | `/reservations/:id` | owner, staff or admin (cancels; never hard-deletes) |
| GET | `/reservations` | staff or admin — `date`, `status`, `q`, `page` |
| GET | `/reservations/today` | staff or admin |
| PATCH | `/reservations/:id/status` | staff or admin |

### Orders
| Method | Path | Access |
| --- | --- | --- |
| POST | `/orders/quote` | authenticated — prices a cart without creating anything |
| POST | `/orders` | authenticated — `orderType` = `pre_order` \| `dine_in` \| `takeaway` |
| GET | `/orders/mine` | authenticated — `scope=active\|past` |
| GET | `/orders/:id` | owner, staff or admin |
| DELETE | `/orders/:id` | owner (before the kitchen starts), staff or admin |
| GET | `/orders` | staff or admin — `status`, `orderType`, `date`, `q`, `page` |
| GET | `/orders/kitchen` | staff or admin — live tickets grouped by status |
| PATCH | `/orders/:id/status` | staff or admin |

### Payments
| Method | Path | Access |
| --- | --- | --- |
| GET | `/payments/config` | public — key id only, never the secret |
| POST | `/payments/session` | order owner — creates the gateway order |
| POST | `/payments/verify` | order owner — verifies the checkout signature |
| POST | `/payments/webhook` | Razorpay only, authenticated by HMAC over the raw body |
| POST | `/payments/refund` | admin — refunds and cancels in one step |

### Reviews, offers, users, stats
| Method | Path | Access |
| --- | --- | --- |
| GET | `/reviews` · `/reviews/mine` | public · authenticated |
| POST · PUT · DELETE | `/reviews` · `/reviews/:id` | authenticated (owner or admin) |
| GET | `/offers` | public (active only) / admin (all) |
| POST | `/offers/validate` | public |
| POST · PUT · DELETE | `/offers` · `/offers/:id` | admin |
| GET | `/users` · `/users/:id` | staff or admin |
| POST · PATCH · DELETE | `/users` · `/users/:id/role` · `/users/:id/blocked` · `/users/:id` | admin |
| GET | `/stats/dashboard` · `/stats/occupancy` | staff or admin |
| GET | `/stats/reports` | admin |
| GET | `/health` | public |

---

## Data model

```
USERS ──1:N──> RESERVATIONS <──N:1── TABLES
  │                  ▲                  ▲
  │                  │ 0:1              │ 0:1
  └──1:N──> ORDERS ──┘──────────────────┘
  │            │
  │            └──N:M──> MENU_ITEMS   (snapshot: name, price, type)
  │                          ▲
  └──1:N──> REVIEWS ─────────┘──N:1── CATEGORIES

OFFERS      (standalone, referenced by code on a reservation or order)
RESTAURANT  (singleton settings document)
COUNTERS    (atomic sequences for booking and order numbers)
```

An order links to a reservation (pre-order), a table (dine-in), or neither
(takeaway). Its line items **snapshot** the dish name, price and dietary type, so
renaming a dish or changing its price never rewrites a bill the customer already
agreed to.

**Order status flow**

```
                    ┌─ (paid online) ─┐
awaiting_payment ───┴─────────────────▼
                                   placed ──> accepted ──> preparing ──> ready ──> completed
                                      │           │
                                      └──> cancelled <┘
```

Pay-at-restaurant orders start at `placed`. Online orders start at
`awaiting_payment` and only reach `placed` once a payment signature verifies.
Customers may cancel from `awaiting_payment` or `placed`; once the kitchen
accepts, only staff can. A paid order cannot be plain-cancelled — it must be
refunded, which cancels it as part of the same operation, so money and order
state can never drift apart.

**Reservation status flow**

```
pending ──> confirmed ──> arrived ──> completed
   │            │
   └──> cancelled <──┘
                └──> no_show
```

Transitions are validated server-side (`STATUS_TRANSITIONS` in `constants.js`);
an illegal move returns `400` explaining which transitions are allowed.

**Table status** (`available` · `reserved` · `occupied` · `maintenance`) is the
live floor state maintained by staff. It is *not* what decides bookability —
only `maintenance` removes a table from the online pool. Availability always comes
from the reservations themselves.

---

## Security

- **Passwords** hashed with bcrypt; the hash is `select: false` so it never leaves
  the database by accident.
- **JWT** authentication with configurable expiry; a 401 clears the client token.
- **Role-based access control** with three roles. Self-registration can only
  create a customer — staff and admin accounts are made by an admin or the seeder.
- **Server-side validation** (express-validator) on every write endpoint; errors
  come back keyed by field for inline display.
- **Login responses are uniform** for unknown email and wrong password, so the
  endpoint cannot enumerate registered addresses.
- **Rate limiting** on auth (20 / 15 min), booking (15 / 10 min) and the API as a
  whole (200 / min), active in production.
- **Uploads** restricted to four image types, 2 MB, with server-generated
  filenames — the client filename is never trusted.
- **Helmet** security headers; CORS locked to `CLIENT_URL` in production.
- **Secrets** live only in `server/.env`, which is git-ignored.
- **Self-protection rules:** an admin cannot change their own role, suspend
  themselves, or delete their own account.
- **Referential guards:** a category with dishes, a table with upcoming bookings,
  or a customer with upcoming bookings cannot be deleted.

The client-side route guard in `ProtectedRoute.jsx` is a convenience only. Every
rule above is enforced again on the server, because anything decided in a browser
can be bypassed.

---

## Deployment

**Database** — create a free MongoDB Atlas cluster, allow your host's IP, and use
its connection string as `MONGO_URI`.

**API** (Render, Railway, Fly.io, or any Node host):
- Root directory `server`, build `npm install`, start `npm start`
- Set every variable from `.env.example`; `NODE_ENV=production`,
  a strong `JWT_SECRET`, and `CLIENT_URL` pointing at the deployed frontend
- Uploaded images are written to the local disk. On hosts with ephemeral
  filesystems they disappear on redeploy — attach a persistent volume, or switch
  `middleware/upload.js` to object storage (S3, Cloudinary) before going live.

**Frontend** (Vercel, Netlify, or any static host):
- Root directory `client`, build `npm run build`, publish `dist`
- Add a rewrite so client-side routes work: all paths → `/index.html`
- Point `/api` at the deployed API (a proxy rewrite, or replace the relative
  base in `src/api/client.js` with the API's absolute URL)

**Single-process alternative:** build the client, then run the API with
`NODE_ENV=production SERVE_CLIENT=true npm start` — Express will serve
`client/dist` alongside the API.

---

## Known limitations

Stated plainly, because a reviewer will find them anyway:

- **The live Razorpay hop is untested.** The signature verification, webhook
  handling, idempotency and failure paths are covered by 28 automated assertions
  using locally computed HMACs, but no request has ever been made to Razorpay's
  real servers from this codebase — that needs your own API keys. The two
  functions that talk to the gateway (`createGatewayOrder`, `fetchPayment` in
  [`services/razorpay.js`](server/src/services/razorpay.js)) are written to their
  documented REST contract and should be exercised against test keys before any
  real use.
- **Delivery has no courier integration.** Orders carry a full address and an
  optional GPS pin, the radius is enforced, and staff move a ticket through
  *out for delivery* to *delivered* by hand — but there is no rider app, no live
  map tracking and no dispatch to a third-party fleet.
### AI features — what is actually AI

Eight features are grouped under "AI" in the UI. Only three involve a language
model, and the app states which engine answered on every one of them.

**Claude (`claude-opus-5`), when `ANTHROPIC_API_KEY` is set:**

| Feature | Why a model earns its place | Without a key |
|---|---|---|
| Dish descriptions | Writing appetising prose has no deterministic equivalent | Template built from the ingredients |
| Review analysis | *"Food was lovely, we waited forty minutes"* is a service complaint wearing a compliment | Lexicon with negation handling |
| Menu chatbot | Open-ended questions in natural phrasing | Intent parser over the same menu |

Claude is never the source of facts. The menu, prices and hours are read from
the database and handed to it, and it is instructed to answer only from those —
a chatbot that invents a ₹200 biryani commits the restaurant to a price it does
not charge. Every call falls back rather than failing: no key, a timeout, a rate
limit or an outage all degrade to the built-in engine.

**No model involved, deliberately:**

- **Allergy alerts** — exact matching against recorded allergens. A *guess* about
  peanuts could hospitalise someone, so there is no inference in this path and
  never should be. It distinguishes "contains" (kitchen-declared) from "may
  contain" (inferred from an ingredient).
- **Meal planner** — a constraint solver. The budget is a guarantee, not a hope;
  a model doing the arithmetic would occasionally bust it.
- **Voice ordering** — speech recognition is the browser's Web Speech API, so
  audio never leaves the device. Matching the transcript against a few dozen
  known dish names is a fuzzy-string problem, and when unsure it offers
  near-misses rather than adding the wrong dish to a bill.
- **Substitution** and **recommendations** — similarity scoring over the menu's
  own fields, explainable and instant.

- **"AI recommendation" is a recommender, not a language model.** It combines
  item-to-item co-occurrence ("ordered together") with content affinity
  (category, dietary type, price band) over this restaurant's own orders. Every
  suggestion returns the reason behind it and the UI shows it. There is no LLM
  and no external service — calling it AI in the marketing sense would overstate
  what it does.
- **Smart table allocation is a scoring heuristic**, not an optimiser. It
  weighs wasted seats, keeping large tables free for large parties, and the
  guest's seating preference, then explains its choice. It does not solve for a
  globally optimal floor plan across a whole service.
- **Allergy warnings are a filter, not a medical guarantee.** They reflect what
  the kitchen recorded against each dish; shared-kitchen cross-contamination is
  not modelled, and the UI says so.
- **Speech recognition is browser-dependent.** The Web Speech API is well
  supported in Chrome and Edge; where it is missing the mic button is hidden and
  the same parser accepts typed text.
- **Spice levels were inferred once from ingredients and dish names**, not set by
  a chef. They are editable per dish in the admin.
- **Loyalty points are not money and do not expire** in this build. There is no
  expiry job, no transfer between accounts and no cash-out.
- **The delivery radius is straight-line**, computed with the haversine formula
  from the restaurant's coordinates. Real road distance is longer, so set the
  radius a little tighter than the range you actually serve.
- **GST is not applied to the delivery fee** in this demo, and the "free above ₹X"
  threshold is measured on food value. Real Indian GST does apply to delivery
  charges; the split here keeps the arithmetic legible.
- **No email or SMS.** Booking and order confirmations are shown on screen and in
  *My bookings* / *My orders*; nothing is actually sent. `nodemailer` or Twilio
  would slot into `reservationController.createReservation` and
  `orderController.createOrder`.
- **The dashboard shows two revenue figures on purpose.** "Billed revenue" is
  real money from completed orders. "Estimated dine-in spend" is a rough figure
  for seated guests who ordered verbally rather than through the app, and is
  labelled an estimate everywhere it appears.
- **GST is a flat configurable percentage** (default 5%, the Indian restaurant
  rate at the time of writing). Real tax rules vary by item category and
  jurisdiction — verify the rate before commercial use.
- **Fixed seating slots**, not arbitrary times — see
  [The core design decision](#the-core-design-decision).
- **Contact form is front-end only.** It is not stored or emailed, and says so.
- **Single restaurant branch.** Multi-branch support would need a `branch`
  reference on tables, reservations and menu items, and in the unique index.
- **Timezone is a fixed offset** (`RESTAURANT_UTC_OFFSET_MINUTES`), not a full IANA
  zone, so a restaurant in a DST-observing region needs that value updated twice a
  year.
- **Dish images are local files.** No stock photography ships with the project;
  dishes without an uploaded image show a category glyph rather than a broken
  image.
- **The checked-in automated test is the concurrency one.** It covers the single
  hardest correctness property. The ordering and payment suites used during
  development are not committed; the rest of the API is exercised manually.
- **No live inventory.** Marking a dish unavailable removes it from ordering, but
  there is no stock count that decrements as orders come in.

---

All restaurant details, dishes, prices, reviews and customer records included in
the seed data are fictional and created for demonstration purposes.
