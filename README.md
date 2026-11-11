# Fyntric ERP

Internal ERP for **Fyntric Tech IT Solutions**: people, sales, delivery and finance in one place.

| Area | What's in it |
| --- | --- |
| **People** | Employee directory, daily check-in / check-out, leave requests with HR approval |
| **Sales** | Leads pipeline (with one-click "convert to client"), client companies |
| **Delivery** | Projects with client, manager, deadline and progress; timesheets |
| **Finance** | GST invoices with paid / outstanding tracking, expenses with approval and reimbursement |
| **Admin** | Users & roles: approve sign-ups and assign one of 8 roles |

Roles: Admin, Project Manager, HR Manager, Sales Staff, Other Staff, Client, Investor, Viewer.
See [docs/roles-and-permissions.md](docs/roles-and-permissions.md) for exactly who can see and do what.

## Stack (all on free tiers)

- **Next.js 16** (App Router) + **TypeScript** + **Tailwind CSS 4**, hosted on **Vercel** (Hobby plan)
- **Firebase Authentication** (email/password + Google) and **Cloud Firestore** on the free **Spark** plan
- Security is enforced by [`firestore.rules`](firestore.rules), tested against the Firebase emulator

There's no separate backend server: the browser talks to Firestore directly and the rules decide what each role can read or write.

## Project structure

```
src/
  app/                    Routes. (app)/ is the signed-in area; login/ is public
  config/
    roles.ts              Roles and the permission matrix (single source of truth for the UI)
    modules/              One file per area describing each module's fields, columns, statuses and actions
    navigation.ts         Sidebar menu
  components/
    resource/             Generic list + form screen used by every module
    dashboard/  hr/  admin/  auth/  layout/  ui/
  hooks/useCollection.ts  Live Firestore queries, scoped to what the user may see
  lib/                    Firebase setup, record helpers, formatting
firestore.rules           Server-side permissions (mirror of src/config/roles.ts)
tests/                    Security rule tests (run against the emulator)
scripts/seed-demo.mjs     Demo users and sample data for local development
```

**Adding a field** to a module is a one-line change in `src/config/modules/*.ts`: the table, form, search and filters pick it up.
**Adding a module**: add a definition file, register it in `src/config/modules/index.ts`, give it permissions in `roles.ts` and `firestore.rules`, add a page under `src/app/(app)/` and a menu item in `navigation.ts`.

## One-time setup

### 1. Firebase project (free)

1. Go to <https://console.firebase.google.com>, **Add project** (e.g. `fyntric-erp`). Google Analytics is optional. Stay on the free Spark plan.
2. **Build > Authentication > Get started**, then enable **Email/Password** and **Google** sign-in.
3. **Build > Firestore Database > Create database**, production mode, region `asia-south1` (Mumbai).
4. **Project settings > General > Your apps > Web (`</>`)**: register an app and copy the config values.

### 2. Deploy the security rules

```bash
npm install
npx firebase login
npx firebase deploy --only firestore:rules --project <your-firebase-project-id>
```

Run the deploy again whenever `firestore.rules` changes.

### 3. Vercel (free)

1. On <https://vercel.com/new>, import the `fyntric-erp` GitHub repo (framework: Next.js, no other settings needed).
2. Add the environment variables from `.env.example` with the values from step 1.4. Leave `NEXT_PUBLIC_USE_FIREBASE_EMULATORS` unset.
3. Deploy. Optionally add a custom domain such as `erp.fyntrictech.co.in` (a CNAME record at GoDaddy pointing to `cname.vercel-dns.com`).
4. In Firebase **Authentication > Settings > Authorized domains**, add your Vercel domain(s) so Google sign-in works there.

### 4. Make yourself the first admin

1. Open the deployed app and create an account (or continue with Google). You'll see "Waiting for access".
2. In the Firebase console, open **Firestore > users > (your user)** and change `role` from `pending` to `admin`.
3. The app updates by itself. From now on, approve everyone else from **Admin > Users & roles**.

For a **client** login, create the client company under Sales > Clients first, then pick that company when you give the user the Client role.

## Local development

```bash
cp .env.example .env.local     # fill in the Firebase values, or use the emulators below
npm run dev                    # http://localhost:3000
```

### Working offline with the emulators (no real data touched)

```bash
# .env.local
NEXT_PUBLIC_FIREBASE_API_KEY=demo-key
NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-fyntric
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=demo-fyntric.firebaseapp.com
NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true
```

```bash
npm run emulators    # terminal 1 (needs Java 11+)
npm run seed:demo    # terminal 2: demo users + sample data
npm run dev          # terminal 3
```

Sign in as `admin@fyntric.test`, `pm@`, `hr@`, `sales@`, `staff@`, `client@`, `investor@`, `viewer@` or `new@` (pending), all with password `fyntric123`.

### Checks

```bash
npm run lint
npm run build
npm run test:rules   # starts the emulators and runs the permission tests
```

## Free tier limits worth knowing

Firestore Spark allows 50,000 reads, 20,000 writes and 1 GiB storage per day/total, which is plenty for a team of this size. Lists load each module's records live, so if a collection grows into many thousands of records, add pagination before it starts eating into the read quota.
File uploads (receipts, documents) aren't included because Firebase Storage now needs the paid Blaze plan; it can be added later.
