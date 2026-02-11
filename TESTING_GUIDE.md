# Testing Chronoread Locally (Without Real OAuth)

## Quick Local Testing Without Google OAuth

For local development/testing without needing real Google credentials:

### 1. **Mock Google OAuth Setup**

Add dummy credentials to `.env.local`:

```env
GOOGLE_CLIENT_ID=test-google-client-id
GOOGLE_CLIENT_SECRET=test-google-client-secret
```

> Note: Real sign-in will fail, but you can test the UI/forms

### 2. **Direct Database Access (Best for Testing)**

Instead of signing through the UI, insert test users directly:

#### Option A: Using Prisma Studio

```bash
npx prisma studio
# Opens UI at http://localhost:5555
```

In the `User` table:

1. Click **Add record**
2. Fill:
   - `email`: `test@example.com`
   - `name`: `Test User`
3. Save

#### Option B: Using Prisma CLI

```bash
npx prisma db execute --stdin < <<EOF
INSERT INTO "User" (email, name, "createdAt", "updatedAt")
VALUES ('test@example.com', 'Test User', datetime('now'), datetime('now'));
EOF
```

---

## Testing the Full Flow Manually

### **1. Create Test User**

Manually insert via Prisma Studio (see above)

### **2. Create Session Token**

You'll need a session token. Create one in Prisma Studio:

In the `Session` table:

1. Click **Add record**
2. Fill:
   - `sessionToken`: `test-session-token-12345`
   - `userId`: `[ID from User table]`
   - `expires`: (future date, e.g., `2025-12-31`)
3. Save

### **3. Test Sign In API**

With SessionToken in browser cookies (mock manually):

```bash
curl -X GET http://localhost:3000/api/chronoread/auth-check \
  -H "Cookie: next-auth.session-token=test-session-token-12345"
```

Expected response:

```json
{
  "authenticated": true,
  "user": {
    "id": 1,
    "email": "test@example.com",
    "name": "Test User"
  }
}
```

### **4. View Your Data**

Visit Prisma Studio to see all tables:

```bash
npx prisma studio
```

---

## Testing Auth Pages

### Sign In Page

```
http://localhost:3000/auth/signin
```

- Try entering an email (will fail without real GitHub/Email setup)
- UI should render correctly

### Sign Up Page

```
http://localhost:3000/auth/signup
```

- Fill form with test data
- Submit button should be active
- UI should render correctly

### Setup Profile Page

```
http://localhost:3000/auth/setup-profile
```

- Requires valid session (test only after creating session in DB)
- 2-step form should work
- Settings should save to user_settings table

---

## Integration with Google OAuth (Real Setup)

When ready for real Google OAuth:

1. Create Google OAuth App:
   - Go: https://console.cloud.google.com/
   - Create a new project or select existing
   - Go to **APIs & Services** → **Credentials**
   - Click **Create Credentials** → **OAuth 2.0 Client ID** → **Web application**
   - Add `http://localhost:3000` to **Authorized JavaScript origins**
   - Add `http://localhost:3000/api/auth/callback/google` to **Authorized redirect URIs**
   - Copy Client ID and Secret

2. Add credentials to `.env.local`:

   ```env
   GOOGLE_CLIENT_ID=your_real_client_id
   GOOGLE_CLIENT_SECRET=your_real_client_secret
   ```

3. Restart dev server: `npm run dev`

4. Click "Continue with Google" button

---

## Database Inspection

### View All Tables

```bash
npx prisma studio
```

Graphical UI for all data

### Query via CLI

```bash
npx prisma db execute --stdin
sqlite> SELECT * FROM "User";
sqlite> .tables
```

### Export Data

```bash
sqlite3 dev.db ".dump" > backup.sql
```

---

## Debugging

### Check Dev Server Logs

```bash
npm run dev
# Look for NextAuth errors like:
# [next-auth][error][SIGNIN_EMAIL_ERROR]
```

### Check Database File

```bash
ls -lh dev.db
# Should exist in project root
```

### Reset Database

```bash
rm dev.db
npx prisma db push  # Recreate fresh DB
```

---

## Testing User Preferences

After creating a test user:

1. **View settings via API**:

   ```bash
   curl http://localhost:3000/api/chronoread/settings \
     -H "Cookie: next-auth.session-token=your_token"
   ```

2. **Save test settings**:

   ```bash
   curl -X PUT http://localhost:3000/api/chronoread/settings \
     -H "Content-Type: application/json" \
     -H "Cookie: next-auth.session-token=your_token" \
     -d '{
       "language": "English",
       "voiceType": "zephyr",
       "narrationType": "Realistic",
       "narrationTime": 5
     }'
   ```

3. **View in Prisma Studio**:
   - Look at `user_settings` table
   - Should show your test user's preferences

---

## Full Testing Checklist

- [ ] Prisma Studio working (`npx prisma studio`)
- [ ] Can create test user in DB
- [ ] Can create test session
- [ ] `/api/chronoread/auth-check` returns user
- [ ] `/auth/signin` page loads
- [ ] `/auth/signup` page loads
- [ ] `/auth/setup-profile` accessible with session
- [ ] Can update user settings via API
- [ ] Chat history saves to DB
- [ ] Google OAuth ready (test later)

✅ You're ready to test Chronoread!
