# Registration and session corrections

This successor preserves the registration-guidance commits and the selected portal layout. It changes no basket, checkout, pricing, VAT, stock, MOQ or search product logic, SQL, dependencies, provider configuration or deployment settings.

Signup and password reset share the intended minimum of 10 characters. Existing-account login keeps its existing validation. Phone numbers retain the existing minimum of 8 digits, including area or country code. WhatsApp Yes and No are both valid; an unanswered choice gets its own error.

Contact validates before an email check and again against the latest committed fields afterward. Concurrent blur, Enter and Next checks for the same normalized email share one pending request only within the same sequence. Editing email or going Back invalidates an older continuation. Native input events update the controlled email, phone and password fields.

The email-check endpoint checks syntax and domain policy with the existing IP and email throttles, without an account lookup. Registration checks required types and fields before account creation. Successful, duplicate and account-specific provider failure paths return the same fixed receipt, with no public customer ID, code, access approval or mail-delivery flag. A minimum receipt delay hides the immediate duplicate path; it does not establish constant provider timing. Existing accounts are never reset, updated or resent verification by this registration request.

Session bootstrap and authenticated reads fence obsolete account identities. Shared refresh responses also check identity before fetch and after the full body before the SDK receives a session payload. Retries of a refresh token retain the original owner. The isolated password sign-in and its strict shared `/user` commit gate remain in place.

The status-only tab journal protects interrupted applications within its documented boundary. It is not durable server idempotency and does not prevent all submissions across tabs or devices. Real Auth persistence, delivered applicant and staff email, production customer recovery, multi-tab browser broadcast and provider password policy require a specifically authorized nonproduction integration environment. Local mocks and installed-SDK probes cannot prove those outcomes.
