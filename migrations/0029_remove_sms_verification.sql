-- SMS phone verification removed; onboarding is email-only now.
-- Stores parked on the old phone step move straight to store setup.
UPDATE stores
SET onboarding_step = 'store_setup', updated_at = datetime('now')
WHERE onboarding_step = 'phone_pending';

DROP TABLE IF EXISTS phone_verification_codes;
