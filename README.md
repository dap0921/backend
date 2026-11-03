# ExpenseTracker-backend

## Password reset

The public `POST /forgot-password` and `POST /reset-password` routes support
user and admin accounts. A matching account receives a single-use six-digit
verification code that expires after 10 minutes. The code is stored as a
bcrypt hash, and reset attempts are rate-limited. The app trusts the Render
proxy hop so the request limiter can use the caller's IP address.

Set these variables in the Render backend service under **Environment**:

- `BREVO_API_KEY`: a Brevo API key
- `BREVO_SENDER_EMAIL`: an email address verified in Brevo
- `BREVO_SENDER_NAME`: optional sender display name (defaults to `Expense Tracker`)

`POST /forgot-password` accepts `{ "email": "...", "role": "user" | "admin" }`.
`POST /reset-password` accepts `{ "email": "...", "role": "user" | "admin", "code": "123456", "password": "..." }`.
Do not put the Brevo API key in frontend environment variables or source code.
Redeploy the backend after setting or changing these environment variables.

## Shared expense Razorpay payments

Set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` on the backend service in
Render. Use a matching test-key pair while testing; never expose the secret in
the frontend.

When `RAZORPAY_KEY_ID` starts with `rzp_test_`, the backend creates a standard
Razorpay test order without a Route transfer. A verified test payment is
recorded as a demo attempt but does not change the shared expense balance; no
real money is charged or paid to a giver. Live payments continue to require
Route and each giver's own linked-account ID.

Each expense giver must have a verified Razorpay Route linked account. Save the
giver's linked-account ID on their user record with the admin-only endpoint:

`PUT /admin/users/:id/razorpay-account`

Send JSON `{ "razorpayAccountId": "acc_..." }` with an admin bearer token. Use
the giver's user ID for `:id`. The ID must be the linked account created in the
same Razorpay mode as the backend keys.

The authenticated shared-expense endpoints create an INR order with a Route
transfer to the giver and verify the captured payment before updating the
share:

- `POST /api/shared/expenses/:expenseId/payments/order`
- `POST /api/shared/expenses/:expenseId/payments/verify`

Razorpay Route access and linked-account onboarding must be approved by
Razorpay. Orders are limited to the exact outstanding share. Pending orders
are reused until verified; resolve an unpaid order before recording an offline
repayment or changing its recipient.
