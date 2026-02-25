# Authentication Flow

## Overview

Local login page with session-based authentication. External API (Flask) is used **only once** during login. After that, all authentication is handled locally via PostgreSQL sessions.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         BROWSER                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  Login Page (/login)                                      │ │
│  │  - Email/password form                                    │ │
│  │  - Redirects to "/" after success                         │ │
│  └───────────────────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  Cookie: sessionId=abc123 (HTTP-only, Secure)             │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                            │
                            │ credentials: "include"
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    EXPRESS APP (Local - App2)                   │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  express-session middleware                               │ │
│  │  - Store: PostgreSQL (table "session")                    │ │
│  │  - Auto-loads req.session on every request                │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  Auth Routes                                              │ │
│  │  - POST /api/auth/callback → Login via Flask              │ │
│  │  - GET  /api/auth/me       → Return session user          │ │
│  │  - POST /api/auth/logout   → Destroy session              │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  PostgreSQL - "session" table                             │ │
│  │  - sid: sessionId                                         │ │
│  │  - sess: { userId, email, name, ... }                     │ │
│  │  - expire: timestamp                                      │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                            │
                            │ ONLY at login (2 calls)
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│              EXTERNAL API (Flask - App1)                        │
│  - POST /login         → Returns session cookie                 │
│  - GET  /api/me        → Returns user info                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Complete Flow

### Login (First Time Only)

```
1. User visits → /login
   ↓
2. Enters email/password
   ↓
3. Submit → POST /api/auth/callback
   ↓
4. Express calls Flask: POST /login
   Content-Type: application/x-www-form-urlencoded
   Body: email=xxx&password=yyy
   ↓
5. Flask returns 302 + Set-Cookie: session=abc123
   ↓
6. Express extracts external cookie
   ↓
7. Express calls Flask: GET /api/me
   Cookie: session=abc123
   ↓
8. Flask returns user info:
   { id, email, name, organization_id, organization_name, is_admin, is_org_owner }
   ↓
9. Express stores ALL user info in PostgreSQL session
   ↓
10. Express returns { user: {...} } to browser
    ↓
11. Browser receives cookie: sessionId=xyz789
    ↓
12. Redirect to "/" → User sees the app ✅

EXTERNAL API CALLS: 2 (POST /login + GET /api/me)
```

### Subsequent Requests (No External Calls)

```
1. User visits → /api/projects (or any protected route)
   ↓
2. Browser sends Cookie: sessionId=xyz789
   ↓
3. express-session middleware:
   - Reads sessionId from cookie
   - SELECT * FROM session WHERE sid = 'xyz789'
   - Loads user data into req.session
   ↓
4. GET /api/auth/me returns user from session (memory only)
   ↓
5. App responds immediately ✅

EXTERNAL API CALLS: 0
DATABASE QUERIES: 1 (session lookup)
```

### Logout

```
1. User clicks "Log out"
   ↓
2. POST /api/auth/logout
   ↓
3. Express destroys session (deletes from PostgreSQL)
   ↓
4. Redirect to /login ✅
```

---

## Key Files

| File | Purpose |
|------|---------|
| `server/auth.ts` | Session middleware + auth routes |
| `server/routes.ts` | PostgreSQL pool setup for sessions |
| `client/src/pages/login.tsx` | Login page with form |
| `client/src/lib/auth.ts` | Login/logout API functions |
| `client/src/hooks/use-auth.ts` | React auth state hook |
| `client/src/components/auth-guard.tsx` | Protects routes |

---

## Database

| Table | Status | Purpose |
|-------|--------|---------|
| `session` | ✅ Auto-created | Stores user sessions |
| `users` | ❌ Not used | No local user table needed |

---

## User Data Stored in Session

```json
{
  "userId": "1",
  "email": "user@example.com",
  "name": "John Doe",
  "organizationId": "org_123",
  "organizationName": "Example Org",
  "isAdmin": false,
  "isOrgOwner": false
}
```

All data comes from Flask `/api/me` endpoint and is stored in PostgreSQL `session` table.

---

## Configuration

### Environment Variables

```bash
DATABASE_URL="postgresql://user:pass@localhost:5432/annotation_app_db"
PORT=5001
SESSION_SECRET="change-me-in-production"
API_BASE_URL="https://flask-api.example.com"
NODE_ENV="production"
```

### Production Notes

- `NODE_ENV=production` enables secure cookies (HTTPS only)
- Behind nginx proxy: set `app.set("trust proxy", 1)` in Express
- nginx must forward `X-Forwarded-Proto: https` header

---

## Testing

### 1. Start the server

```bash
npm run dev          # Development
docker-compose up    # Production
```

### 2. Login

Visit `/login` and enter credentials.

### 3. Verify

After login:
- Check browser DevTools → Network tab
- `POST /api/auth/callback` → 200 OK
- `GET /api/auth/me` → 200 OK with user data
- Cookie `sessionId` present in Application → Cookies

### 4. Debug

Server logs show session activity. Browser console shows API calls.

---

## Security

| Feature | Description |
|---------|-------------|
| **HTTP-only cookies** | JavaScript cannot access session cookie |
| **Secure flag** | Cookie only sent over HTTPS (production) |
| **SameSite: lax** | CSRF protection |
| **Session stored in DB** | Server-side session control |
| **No client-side secrets** | All sensitive data server-side |

---

## Benefits

| Benefit | Explanation |
|---------|-------------|
| **Fast** | Only 2 external calls ever (at login) |
| **Simple** | No user sync, no tokens to manage |
| **Secure** | HTTP-only cookies, server-side sessions |
| **Resilient** | Works even if Flask API goes down after login |
| **Clean** | No local users table to maintain |

---

## Summary

- ✅ **Local login page** - Users never see external API
- ✅ **Session-based auth** - PostgreSQL stores session data
- ✅ **Flask used once** - Only during login (2 calls)
- ✅ **Zero external calls** - After login, everything is local
- ✅ **Secure cookies** - HTTP-only, Secure, SameSite
