// Seeds a signed-in Inbox Zero user with one Google mailbox served by the
// Gmail emulator. OAuth login can't run in Opslane (the browser only reaches
// the app port), so this writes the rows the OAuth callback would create, plus
// a session whose token matches the cookie in opslane.yml.
const { Client } = require("pg");

const EMAIL = "opslane@example.com";
const NAME = "Opslane Tester";
const SESSION_TOKEN =
  "c1894ea7fd822cddf680b3736063a2223eaa1bd373fb78cde9ce5ccaf8d5d2ff";
// Stored as plaintext: the app's token decryption passes non-ciphertext through.
const ACCESS_TOKEN = "opslane_google_access_token";

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO "User" (id, email, name, "emailVerified", "completedOnboardingAt", "surveyFeatures", "updatedAt")
       VALUES ('opslane_user', $1, $2, true, now(), '{}', now())
       ON CONFLICT (email) DO NOTHING`,
      [EMAIL, NAME],
    );
    await client.query(
      `INSERT INTO "Account" (id, "userId", provider, type, "providerAccountId", access_token, refresh_token,
         expires_at, token_type, scope, "updatedAt")
       VALUES ('opslane_account', 'opslane_user', 'google', 'oidc', 'opslane-google-sub', $1, 'opslane_google_refresh_token',
         now() + interval '10 years', 'Bearer',
         'openid email profile https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.settings.basic',
         now())
       ON CONFLICT (provider, "providerAccountId") DO NOTHING`,
      [ACCESS_TOKEN],
    );
    await client.query(
      `INSERT INTO "EmailAccount" (id, email, name, "userId", "accountId", "behaviorProfile", "personaAnalysis",
         "writingStyle", timezone, "updatedAt")
       VALUES ('opslane_email_account', $1, $2, 'opslane_user', 'opslane_account', '{}'::jsonb, '{}'::jsonb,
         'Short, friendly replies.', 'UTC', now())
       ON CONFLICT (email) DO NOTHING`,
      [EMAIL, NAME],
    );
    await client.query(
      `INSERT INTO "Session" (id, "sessionToken", "userId", expires, "updatedAt")
       VALUES ('opslane_session', $1, 'opslane_user', now() + interval '10 years', now())
       ON CONFLICT ("sessionToken") DO NOTHING`,
      [SESSION_TOKEN],
    );
    await client.query("COMMIT");
    console.log(`Seeded ${EMAIL} with a ready session`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
