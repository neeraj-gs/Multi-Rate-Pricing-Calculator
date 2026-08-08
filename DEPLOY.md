# Deploying LedgerLine

Vercel for the app, MongoDB Atlas for the database. Both have free tiers that
run this comfortably. Budget about twenty minutes the first time.

## 1. Push the code

```bash
git push origin main
```

## 2. Create the database (MongoDB Atlas)

1. Sign up at <https://www.mongodb.com/cloud/atlas/register>.
2. **Create a cluster** — choose the **M0 free** tier. Any region; pick the one
   nearest your Vercel region to keep latency down.
3. **Database Access → Add New Database User.** Username and password, with the
   built-in **Read and write to any database** role. Save the password
   somewhere — you cannot read it back later.
4. **Network Access → Add IP Address → Allow access from anywhere**
   (`0.0.0.0/0`).

   Vercel's functions do not have fixed outbound IPs, so there is no narrower
   range to allow. The database is still protected by the user password and TLS.
   For a production system you would use Atlas's private networking instead.
5. **Clusters → Connect → Drivers** and copy the connection string. It looks
   like:

   ```
   mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```

   Replace `USER` and `PASSWORD` with the ones from step 3, and insert the
   database name **before** the `?`:

   ```
   mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/ledgerline?retryWrites=true&w=majority
   ```

   Without a database name Mongo uses `test`, and the app will look empty after
   you seed it. If your password contains `@`, `/`, `:` or `#`, percent-encode
   those characters.

## 3. Load the demo data

Run the seed from your machine, pointed at Atlas. It goes through the same
`createDocument` and `finalizeDocument` paths the app uses, so the seeded data
passes exactly the same validation and pricing as anything created in the UI.

```bash
# PowerShell
$env:MONGODB_URI = "mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/ledgerline?retryWrites=true&w=majority"
npm run seed
```

```bash
# bash
MONGODB_URI="mongodb+srv://…/ledgerline?retryWrites=true&w=majority" npm run seed
```

It prints the sign-in details when it finishes. Re-running it is safe: it
rebuilds the demo account's documents and leaves every other account alone.

## 4. Deploy (Vercel)

1. Sign in at <https://vercel.com> with GitHub.
2. **Add New → Project**, import the repository. Leave the framework preset
   (Next.js) and build settings as detected.
3. Add three **Environment Variables** before deploying:

   | Name | Value |
   |---|---|
   | `MONGODB_URI` | the connection string from step 2 |
   | `AUTH_SECRET` | 32+ random characters — `openssl rand -base64 32` |
   | `NEXT_PUBLIC_APP_URL` | `https://your-project.vercel.app` (fix in step 5) |

   Apply each to **Production, Preview and Development**.
4. **Deploy.**

## 5. Set the real URL

You only learn the deployed URL after the first build. Go to **Settings →
Environment Variables**, correct `NEXT_PUBLIC_APP_URL` to the actual domain (no
trailing slash), then **Deployments → ⋯ → Redeploy**.

This variable is only used to build share links. Everything else works without
it; share links will point at the wrong host until it is right.

## 6. Check it

- `https://your-app.vercel.app/api/health` — reports database connectivity.
- Sign in as `demo@ledgerline.app` / `demo-password-2026` and open **Reports**.
- Sign up with a new email. A new account starts empty and has full use of the
  app; accounts never see each other's documents.

## Notes

- `vercel.json` sets `MONGOMS_DISABLE_POSTINSTALL=1`. `mongodb-memory-server` is
  a test-only dependency whose install step downloads a ~100 MB MongoDB binary;
  Vercel installs devDependencies to build, so without this the build spends
  minutes fetching a binary it will never run — and fails outright if the
  download does.
- Every route that touches data is `nodejs` runtime and dynamic, so nothing is
  statically cached with one account's figures in it.
