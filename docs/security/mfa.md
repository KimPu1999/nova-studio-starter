# MFA

`MfaCredential` stores an encrypted TOTP secret and `MfaRecoveryCode` stores one-way hashes. Secrets and recovery codes must only be displayed during a verified enrollment operation.

TOTP enrollment, verification, recovery-code consumption, step-up authentication, and privileged MFA enforcement are not active yet because a vetted TOTP dependency and complete recovery workflow have not been configured and tested. Do not mark an account MFA-enabled by changing a client value or database flag manually.
