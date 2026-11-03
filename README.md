# ExpenseTracker-backend

## Password reset

The public `POST /forgot-password` and `POST /reset-password/:token` routes
support user and admin accounts. Reset requests are rate-limited, use a
single-use token that expires after 30 minutes, and store only the token hash.
The app trusts the Render proxy hop so the request limiter can use the caller's
IP address.

Set these variables in the Render backend service under **Environment**:

- `BREVO_API_KEY`: a Brevo API key
- `BREVO_SENDER_EMAIL`: an email address verified in Brevo
- `BREVO_SENDER_NAME`: optional sender display name (defaults to `Expense Tracker`)
- `FRONTEND_URL`: the public frontend origin, without a trailing slash

The frontend must be deployed at `FRONTEND_URL` and include the
`/reset-password/:token` page. Do not put the Brevo API key in frontend
environment variables or source code. Redeploy the backend after setting the
environment variables.
