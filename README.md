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

## Shared expense Razorpay payments

Set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` on the backend service in
Render. Use a matching test-key pair while testing; never expose the secret in
the frontend.

For a shared test recipient, optionally set `RAZORPAY_TEST_ROUTE_ACCOUNT_ID`
to its Test Mode linked-account ID. This override is used only when
`RAZORPAY_KEY_ID` starts with `rzp_test_`. Live payments always use the
expense giver's own account ID saved on their user record.

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
Razorpay. Orders are limited to the exact outstanding share, and active
checkouts expire after 15 minutes.
