# Registration and sign-in guidance

Active entry: the Questionnaire in LandingPage, mounted by Root. RegisterPage
and the standalone Questionnaire component remain dormant in this entry path.

Required fields now have inline errors, linked summaries and focus handling.
Nonsecret form entries stay in component memory across failures and Back;
passwords clear after submission outcomes, sign-in failures and cancellation.
Entries are not promised to survive a page reload.

Registration recognizes the fixed neutral CHECK_EMAIL_OR_SIGN_IN receipt. The
previous strict profile/verification envelope remains accepted during a rolling
release, but the interface uses neutral next-step guidance for either version.
Neither receipt establishes account creation, approval or email delivery. A lost,
interrupted or malformed response holds submission as unknown.
A tab-scoped status marker contains no email, password, token or payload. It
blocks blind resubmission after reload. Known pre-account rejections permit
correction/retry. Storage refusal sends no application.

Sign-in failure messages use fixed codes/statuses. Unknown-email and wrong-
password responses share one message, with registration and recovery routes.
An isolated nonpersistent SDK authenticates first; the shared session commits
only after a fresh session and ownership checks. Cancellation precedes commit;
navigation is held during commit. Recovery says request received, not delivered.

Tests use inert fixtures. They do not prove real account persistence or email
delivery. No server registration idempotency, SQL, secrets or deployments change.
Before combining with frozen readiness work, reconcile overlapping LoginModal,
auth.js and supabase.js while retaining its Root/authHeaders/refresh fencing.
