# Chronoread Authentication Setup Guide

## Overview

Chronoread uses **NextAuth.js v5** with Prisma for authentication. Users can sign in via:

- **Google OAuth** (requires Google Cloud credentials)
- **Email Magic Links** (requires email server configuration)

---

## Quick Start

### 1. **Google OAuth Setup** (Recommended)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Go to **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **OAuth 2.0 Client ID**
5. Select **Web application**
6. Add the following to **Authorized JavaScript origins**:
   - `http://localhost:3000`
   - `http://localhost:3000/` (with trailing slash)
   - Your production URL (e.g., `https://chronoread.com`)
7. Add the following to **Authorized redirect URIs**:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://your-domain.com/api/auth/callback/google` (production)
8. Copy the **Client ID** and **Client Secret**
9. Add to `.env.local`:
   ```env
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   NEXTAUTH_URL=http://localhost:3000
   NEXTAUTH_SECRET=your_random_secret_here
   ```
10. Generate a secret with:
    ```bash
    openssl rand -base64 32
    ```

---

### 2. **Email Magic Links Setup** (Optional)

For email authentication, you need an SMTP server. Options:

#### Option A: **Resend** (Recommended - Free tier available)

1. Sign up at [resend.com](https://resend.com)
2. Get your API key from the dashboard
3. Add to `.env.local`:
   ```env
   EMAIL_SERVER_USER=your_resend_api_key
   EMAIL_SERVER_PASSWORD=
   EMAIL_SERVER_HOST=smtp.resend.co
   EMAIL_SERVER_PORT=465
   EMAIL_FROM=noreply@chronoread.com
   ```

#### Option B: **Gmail SMTP**

1. Enable 2-Factor Authentication on your Google Account
2. Generate an "App Password" (not your regular password)
3. Add to `.env.local`:
   ```env
   EMAIL_SERVER_USER=your_email@gmail.com
   EMAIL_SERVER_PASSWORD=your_app_password
   EMAIL_SERVER_HOST=smtp.gmail.com
   EMAIL_SERVER_PORT=587
   EMAIL_FROM=noreply@chronoread.com
   ```

#### Option C: **Development-Only Mock Email**

For local testing without sending real emails:

```env
# Email disabled - users must use Google OAuth
EMAIL_SERVER=
EMAIL_FROM=
```

---

## Environment Variables

Create `.env.local` in the project root with:

```env
# Database
DATABASE_URL="file:./dev.db"

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_generated_secret_here

# Google OAuth (Recommended auth method)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Email (Optional - for magic links)
EMAIL_SERVER=smtp://user:password@host:port
EMAIL_FROM=noreply@chronoread.com

# OpenAI (for narration feature)
OPENAI_API_KEY=your_openai_api_key
```

---

## File Structure

```
app/
├── auth/
│   ├── signin/
│   │   └── page.tsx          # Sign In form (Google + Email)
│   ├── signup/
│   │   └── page.tsx          # Sign Up form with profile setup
│   ├── verify-email/
│   │   └── page.tsx          # Email verification instruction
│   └── setup-profile/
│       └── page.tsx          # New user profile setup (2-step form)
│
├── api/
│   ├── auth/
│   │   └── [...nextauth]/
│   │       └── route.ts      # NextAuth handler
│   └── chronoread/
│       ├── auth-check/       # Check if user is logged in
│       ├── profile/          # Save user profile
│       ├── settings/         # Save narration settings
│       └── chat/             # Save chat history
│
├── services/
│   ├── authOptions.ts        # NextAuth configuration
│   └── userService.ts        # User data operations (Prisma)
│
└── page.tsx                   # Main app (requires login)
```

---

## User Flow

### **New User (Sign Up)**

1. User clicks "Create Account" on home page
2. Land on `/auth/signup` form
3. Enter email, name, interests, age
4. Click "Create Account" → Email sent with login link (if configured)
5. Or click "Continue with Google" → Redirected to Google OAuth
6. After auth, redirected to `/auth/setup-profile` for 2-step onboarding:
   - **Step 1**: Profile info (bio, location, interests)
   - **Step 2**: Narration preferences (language, voice, style, duration)
7. Save settings → Redirected to `/` (main app)

### **Existing User (Sign In)**

1. User clicks "Sign In" on home page
2. Land on `/auth/signin` form
3. Enter email → Email magic link sent (if configured) or click "Continue with Google"
4. Verify email link → Logged in → Redirected to `/` (main app)

### **In-App Experience**

- Sidebar shows user's language mode
- Settings modal allows changing narration preferences
- Sign Out button in sidebar
- Chat history saved to database
- User insights tracked (liked/disliked content, top topics)

---

## API Endpoints

| Endpoint                     | Method   | Purpose                     |
| ---------------------------- | -------- | --------------------------- |
| `/api/auth/signin`           | POST     | Email sign-in request       |
| `/api/auth/callback/google`  | GET      | Google OAuth callback       |
| `/api/chronoread/auth-check` | GET      | Check if user is logged in  |
| `/api/chronoread/settings`   | GET/PUT  | Get/save narration settings |
| `/api/chronoread/profile`    | PUT      | Save user profile           |
| `/api/chronoread/chat`       | GET/POST | Get/save chat history       |

---

## Database Schema

**NextAuth Tables** (Auto-created by Prisma):

- `User` - User account info (email, name)
- `Account` - OAuth provider links
- `Session` - User sessions
- `VerificationToken` - Email verification tokens

**Chronoread Tables** (For personalization):

- `UserProfile` - Bio, interests, location, age, "pulse" (personality)
- `UserSettings` - Narration preferences per user
- `ChatHistory` - All user queries & AI responses
- `UserInsight` - Derived analytics (top topics, likes/dislikes, last active)

---

## Development Tips

### Test Authentication Without Real Emails

- Use Google OAuth (no email setup needed)
- Check Prisma Studio: `npx prisma studio`
- View saved sessions in `Session` table

### Mock Email for Testing

For testing email flows without sending real emails, use a tool like:

- **Mailtrap** (free tier): `https://mailtrap.io`
- **Ethereal** (instant temporary email): Built into Nodemailer

### Debugging

- Check server logs for NextAuth errors
- Open browser Dev Tools → Network tab to inspect auth requests
- Check `.next/dev/server` for compiled routes

---

## Troubleshooting

### "Email provider not configured"

- Email features are optional
- Google OAuth will still work
- To enable email, set `EMAIL_SERVER` and `EMAIL_FROM` in `.env.local`

### "Invalid NEXTAUTH_SECRET"

- Generate with: `openssl rand -base64 32`
- Add to `.env.local` as `NEXTAUTH_SECRET`

### "Google OAuth callback failed"

- Verify Google OAuth app is created in Google Cloud Console
- Check `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env.local`
- Ensure callback URL matches: `http://localhost:3000/api/auth/callback/google`

### User data not saving

- Check `DATABASE_URL` is set in `.env.local`
- Run: `npx prisma db push` to ensure tables exist
- Check Prisma Studio: `npx prisma studio`

---

## Next Steps

1. ✅ Set up Google OAuth (or email - optional)
2. ✅ Run `npm run dev` and test the login flow
3. ✅ Try signing up and visiting `/auth/setup-profile`
4. ✅ Test narration with logged-in user
5. Visit `http://localhost:5555` (Prisma Studio) to see saved data

**Happy narrating!** 🎙️📚
