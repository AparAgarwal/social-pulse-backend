# SocialPulse API — Detailed Project Workflow

This document gives you an end-to-end implementation workflow for building the SocialPulse API in a clean, production-style order.

---

## 1) Project Outcome (Definition of Done)

Your API is considered complete when all of the following are true:

- Users can register and log in securely.
- Access tokens (15m) + refresh tokens (7d) are implemented.
- Refresh token is stored in an HTTP-only cookie.
- Protected routes work via `authenticate` middleware.
- Users can update profile fields and upload avatars.
- Old avatar is deleted from Cloudinary when a new avatar is saved.
- Posts support full CRUD with `author` relation to `User`.
- Global feed supports pagination and sorting (`newest`, `most-discussed`).
- All incoming requests are validated using Zod.
- Global error handler returns consistent JSON shape.
- Login route is protected with rate limiting.

---

## 2) High-Level Build Order

1. **Foundation & Architecture**
2. **Authentication Engine**
3. **Profile + Media Upload Pipeline**
4. **Post CRUD + Feed Features**
5. **Validation + Security Hardening**
6. **Integration Testing + Edge Cases**
7. **Final Cleanup + Delivery**

This order minimizes rework and avoids circular dependencies.

---

## 3) Suggested Folder Blueprint

Keep your existing structure, then add missing pieces:

```txt
src/
  app.js
  config/
    db.js
    cloudinary.js
  controllers/
    auth.controller.js
    user.controller.js
    post.controller.js
  middlewares/
    auth.middleware.js
    refreshAuth.middleware.js
    validate.middleware.js
    error.middleware.js
    rateLimit.middleware.js
    upload.middleware.js
  models/
    user.model.js
    post.model.js
  routes/
    auth.routes.js
    user.routes.js
    post.routes.js
  schemas/
    auth.schema.js
    user.schema.js
    post.schema.js
  utils/
    ApiError.js
    ApiResponse.js
    asyncHandler.js
    jwt.js
```

---

## 4) Phase-by-Phase Workflow

## Phase 1 — Foundation

### Goals
- App bootstraps cleanly.
- DB connection is centralized.
- Response/error utilities are available globally.

### Tasks
- Configure `.env` keys:
  - `PORT`
  - `MONGODB_URI`
  - `JWT_ACCESS_SECRET`
  - `JWT_REFRESH_SECRET`
  - `ACCESS_TOKEN_EXPIRY=15m`
  - `REFRESH_TOKEN_EXPIRY=7d`
  - `CLOUDINARY_CLOUD_NAME`
  - `CLOUDINARY_API_KEY`
  - `CLOUDINARY_API_SECRET`
  - `CLIENT_URL` (if needed for CORS cookies)
- Implement DB connector in `src/config/db.js`.
- Add `ApiError`, `ApiResponse`, and `asyncHandler` utilities.
- Wire `src/app.js` with:
  - JSON parser
  - URL encoded parser
  - cookie parser (install `cookie-parser`)
  - route mounting
  - global error middleware
- Keep `server.js` minimal: load env, connect DB, start server.

### Output Check
- `npm run dev` starts server.
- Failed DB connection exits with clear logs.

---

## Phase 2 — User Engine (Auth)

### Goals
- Secure registration/login.
- Token lifecycle + refresh flow is functional.

### Tasks
- Build `User` schema (`src/models/user.model.js`) with fields:
  - `username` (unique)
  - `email` (unique)
  - `password`
  - `bio` (optional)
  - `avatar` (url)
  - `avatarPublicId` (for Cloudinary delete)
- Add pre-save password hashing with bcrypt.
- Add instance methods:
  - `isPasswordCorrect(password)`
  - token generators (or utility-based signing)
- Auth controllers:
  - `registerUser`
  - `loginUser`
  - `refreshAccessToken`
  - `logoutUser`
- Cookies:
  - set refresh token in HTTP-only cookie
  - secure/sameSite based on environment
- Middlewares:
  - `authenticate` validates access token and attaches user
  - `refreshAuth` validates refresh token path only

### Output Check
- Register returns user (without password).
- Login returns access token + sets refresh cookie.
- Protected route works with bearer access token.
- Refresh endpoint issues new access token.

---

## Phase 3 — Loading Dock (Profile + Avatar)

### Goals
- Profile updates are safe and validated.
- Avatar replacement is atomic (upload new → delete old → save DB).

### Tasks
- Configure Cloudinary SDK (`src/config/cloudinary.js`).
- Add Multer setup (`upload.middleware.js`) using memory or temp disk storage.
- User controller endpoints:
  - `PATCH /users/me` for bio/username update
  - `PATCH /users/me/avatar` for avatar upload
- Atomic avatar strategy:
  1. Upload new avatar to Cloudinary.
  2. If DB update succeeds, delete old avatar by `avatarPublicId`.
  3. If DB update fails, delete newly uploaded avatar (rollback).
- Always persist both `avatar` URL and `avatarPublicId`.

### Output Check
- New avatar appears in user profile.
- Previous avatar is removed from Cloudinary.

---

## Phase 4 — Feed (Posts)

### Goals
- Full post CRUD with author relation.
- Scalable feed retrieval with pagination and sorting.

### Tasks
- Post schema (`src/models/post.model.js`):
  - `content`
  - `author` (`ObjectId` ref: `User`)
  - `commentsCount` (number, default 0)
  - timestamps enabled
- Post controllers:
  - `createPost`
  - `getPostById`
  - `updatePost`
  - `deletePost`
  - `getGlobalFeed`
- Ownership checks:
  - only author can update/delete own post
- Feed query params:
  - `page` + `limit` (offset strategy) or cursor-based alternative
  - `sort=newest|most-discussed`
- Populate author details:
  - `author` with selected fields only (`username`, `avatar`)

### Output Check
- CRUD endpoints return consistent response format.
- Feed returns paginated data + metadata.
- Sorting changes order correctly.

---

## Phase 5 — Shield (Validation + Security)

### Goals
- Every request path is validated.
- Error behavior is predictable.

### Tasks
- Install and wire:
  - `zod`
  - `express-rate-limit`
- Define schemas:
  - auth payloads (register/login/refresh)
  - post payloads (create/update/feed query)
  - user payloads (profile update)
- Build generic validation middleware:
  - validates `body`, `params`, `query`
  - throws `ApiError` with field-level messages
- Add rate limiting on login route only.
- Global error middleware behavior:
  - catches all thrown errors
  - returns status code + standard JSON envelope
  - hides stack in production

### Output Check
- Invalid inputs fail with structured 4xx response.
- Repeated login attempts get 429 response.

---

## Phase 6 — Route Contract (Suggested)

## Auth
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`

## Users
- `GET /api/v1/users/me`
- `PATCH /api/v1/users/me`
- `PATCH /api/v1/users/me/avatar`

## Posts
- `POST /api/v1/posts`
- `GET /api/v1/posts/:postId`
- `PATCH /api/v1/posts/:postId`
- `DELETE /api/v1/posts/:postId`
- `GET /api/v1/posts/feed?page=1&limit=10&sort=newest`

---

## Phase 7 — Test Workflow (Postman / Thunder Client)

Run in this exact order to avoid confusion:

1. Register user A.
2. Login user A and capture access token + refresh cookie.
3. Call protected `GET /users/me`.
4. Update profile fields.
5. Upload avatar twice; verify old cloud asset is removed.
6. Create 3+ posts.
7. Fetch feed with `sort=newest`, then `sort=most-discussed`.
8. Update and delete one owned post.
9. Attempt modifying another user’s post (expect 403/401).
10. Let access token expire, call refresh, retry protected route.
11. Send invalid payloads to verify Zod responses.
12. Spam login endpoint to verify rate limiting.

---

## 8) Edge Cases You Should Explicitly Handle

- Duplicate username/email on registration.
- Invalid/expired access token.
- Missing refresh cookie.
- Refresh token reuse or mismatch.
- Empty post content.
- Non-owner editing/deleting posts.
- Cloudinary upload succeeds but DB write fails (rollback required).
- Deleting user account should delete their posts (document and implement chosen policy).

---

## 9) Recommended Dependencies to Add

```bash
npm i bcrypt jsonwebtoken cookie-parser zod multer cloudinary express-rate-limit
```

Optional but useful:

```bash
npm i morgan cors
```

---

## 10) Final Quality Checklist

- [ ] No controller contains repeated `try/catch` noise (`asyncHandler` used).
- [ ] Password field never leaks in API responses.
- [ ] Token secrets are only read from env.
- [ ] Cookies are HTTP-only and correctly configured.
- [ ] Errors follow one JSON format everywhere.
- [ ] Protected routes all include `authenticate`.
- [ ] Feed uses pagination, sorting, and `populate` author fields.
- [ ] Readme includes run/setup instructions.

---

## 11) Delivery Snapshot

Before you consider the project complete:

- Run app with `npm run dev`.
- Manually verify all routes from the test workflow.
- Ensure `.env.example` includes all required variables.
- Push clean code with clear commits by phase.

This workflow is designed so each phase leaves the codebase in a working state before moving to the next one.