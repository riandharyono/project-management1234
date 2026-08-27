# JWT Authentication Testing

1. Login with the seeded admin at `POST /api/auth/login`, preserving cookies.
2. Call `GET /api/auth/me` with those cookies and verify the returned role is `admin`.
3. Register a new member at `POST /api/auth/register`, then verify `/api/auth/me`.
4. Verify invalid credentials return HTTP 401 and logout clears the session.
5. Verify protected task, comment, dashboard, members, and search endpoints require authentication.