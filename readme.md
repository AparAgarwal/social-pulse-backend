# Capstone Challenge: Building Your Own Social Media API (SocialPulse)

Welcome to the **Capstone Challenge**. No more following tutorials line-by-line. It’s time to take off the training wheels and build a real-world project from scratch: **SocialPulse API**.

---

## 🚀 The Mission
Build a production-ready REST API for a social media platform where users can post updates, manage their profiles, and interact with others.

### 🏠 Features You Must Implement:

#### 1. The Gatekeeper (Authentication)
- Implement **User Registration** with secure password hashing (bcrypt).
- Implement **Login** with **JWT Access Tokens** (15m) and **Refresh Tokens** (7d).
- Use **HTTP-only Cookies** for secure refresh token storage.
- Create an `authenticate` middleware to protect routes.

#### 2. The Loading Dock (Media & Profiles)
- Allow users to update their profile (bio, username).
- Implement **Avatar Uploads** using Cloudinary.
- Automatically delete old avatars from the cloud when a new one is uploaded (Atomic Updates).

#### 3. The Feed (Content Management)
- Users can create, read, update, and delete (CRUD) **Posts**.
- **Pagination**: Implement cursor-based or offset-based pagination for the global feed.
- **Sorting**: Allow users to sort posts by "newest" or "most discussed."
- **Relational Data**: Every Post must have an `author` field linked to a User document. Use `.populate()` to show author details.

#### 4. The Shield (Validation & Security)
- Use **Zod** to validate every incoming request (Auth, Post creation, Profile updates).
- Implement a **Global Error Handler** that catches every exception and returns consistent JSON.
- Add **Rate Limiting** to prevent brute-force attacks on the login endpoint.

---

## 🛠️ The Roadmap (Your Checklist)

### Phase 1: Foundation
- [ ] Initialize project with ES Modules.
- [ ] Set up `.env` with Mongo URI and Secrets.
- [ ] Create the `ApiError` and `ApiResponse` utility classes.
- [ ] Build the Database Connection logic.

### Phase 2: User Engine
- [ ] Build User Schema with pre-save password hashing.
- [ ] Implement Register & Login controllers.
- [ ] Build the `auth` and `refreshAuth` middlewares.

### Phase 3: Content & Media
- [ ] Build Post Schema with User references.
- [ ] Integrate Multer and Cloudinary for Avatar uploads.
- [ ] Implement the Feed logic with Pagination and Filtering.

### Phase 4: Polish
- [ ] Add Zod schemas for all routes.
- [ ] Test the entire flow using Postman/Thunder Client.
- [ ] Handle edge cases (e.g., deleting a user should delete their posts?).

---

**Are you ready to build something that actually works?**

Tag me on [Twitter](https://x.com/aparagarwal01)/[LinkedIn](https://linkedin.com/in/aparagarwal) once you’ve finished your SocialPulse API. I’d love to see what you’ve built!

Happy coding! ✌️
