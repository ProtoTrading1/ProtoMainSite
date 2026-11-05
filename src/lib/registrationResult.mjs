// Only the explicit completed-registration response permits confirmation.
export function isConfirmedTradeApplication(result) {
  return result?.ok === true && result.receipt === 'REGISTRATION_SUCCEEDED'
    && result.instantAccess === false && result.emailVerificationRequired === true;
}
