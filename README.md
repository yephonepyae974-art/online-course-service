How to Test the App

## Student Information

- **Student Name:** [Ye Phone Pyae]
- **Student ID:** [6726032]

## Test Credentials

- **Email:** student@example.com
- **Password:** TestPassword123!

These credentials require the existing test account in the configured database. For a fresh database, use Create an account to register them first.

## Prerequisites

- A Node.js version compatible with the provided Next.js and Vite dependencies, and npm.
- MongoDB Atlas connection with a valid database user and network access for the machine running the backend.
- Backend port 3000 and frontend port 5173 available.

## Backend Setup (`next-backend/`)

Create `next-backend/.env.local` beside its `package.json`:

```dotenv
MONGODB_URI=mongodb+srv://YOUR_DATABASE_USER:YOUR_ENCODED_PASSWORD@YOUR_CLUSTER/course_management
JWT_SECRET=YOUR_LONG_RANDOM_SECRET
```

Use your own connection details and keep this file out of Git. Include the database name in the connection URI. Restart the backend after changing environment variables.

From the project root:

```bash
cd next-backend
npm install
npm run dev
```

The API runs at http://localhost:3000/api.

## Frontend Setup (`react-frontend/`)

In another terminal, from the project root:

```bash
cd react-frontend
npm install
npm run dev -- --port 5173 --strictPort
```

Open http://localhost:5173. Keep both servers running. The development CORS configuration expects this exact frontend origin.

## Testing Walkthrough

1. Open the frontend while logged out. Confirm the course list is visible.
2. Log in with the test credentials. Confirm the greeting, course form, and profile form appear.
3. Refresh the page. Confirm the login session persists.
4. Create a course with a title, description, and instructor. Confirm it appears in the list.
5. Edit that course. Confirm the updated values persist after refreshing.
6. Enroll in a course. Confirm it appears under My enrolled courses.
7. Unenroll. Confirm it disappears from My enrolled courses.
8. Update the profile username and save. Confirm the greeting updates and persists after refresh.
9. Delete a temporary course. Confirm it disappears after refresh.
10. Log out. Confirm the login form returns. Try a wrong password and confirm an error appears.
11. Register a separate temporary account. Confirm it can enroll in courses but has no Edit or Delete controls for another user's courses.
12. Using the temporary account, test profile changes and account deletion. After deletion, confirm login with its credentials fails.
13. Account deletion is blocked while that user owns courses. Delete their courses first, then retry account deletion.
14. Keep the main test account and at least one demonstration course available for assessment.

## API Overview

| Method | Path | Purpose |
| --- | --- | --- |
| POST | /api/user | Register |
| GET | /api/user | Current authenticated user |
| GET, PUT, DELETE | /api/user/[user_id] | Own profile |
| POST | /api/auth/login | Log in and set cookie |
| POST | /api/auth/logout | Clear cookie |
| GET | /api/course | List courses |
| POST | /api/course | Create course while authenticated |
| GET | /api/course/[course_id] | View course |
| PUT, DELETE | /api/course/[course_id] | Edit or delete own course |
| GET | /api/enrollment | List own enrolled courses |
| POST | /api/enrollment | Enroll using a JSON courseId |
| DELETE | /api/enrollment | Unenroll using a JSON courseId |

Authentication uses an HttpOnly JWT cookie. Frontend API requests include credentials. Passwords are hashed with bcrypt. Profile routes enforce account ownership, and course mutations enforce course ownership.

## Build and Lint Checks

Run in each application folder:

```bash
npm run lint
npm run build
```

Record actual results before submission; this README describes the test procedure and does not certify every check has passed.

## Current Limitations

- The frontend API origin and development CORS origin are configured for local development.
- There is no password reset or password-change interface.
- Deleted courses are omitted from enrollment listings; the current course deletion handler does not remove their enrollment records.
- Account deletion performs multiple database operations without a transaction.
