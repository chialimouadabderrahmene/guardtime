# secrets/

Bind-mounted read-only into the `backend` container at
`/opt/guardtime/secrets`. Optional — the app runs fine with this directory
empty (push notifications stay disabled; in-app notifications still work).

To enable Firebase Cloud Messaging push, place your Firebase service
account JSON here as `firebase-service-account.json` — it matches
`FIREBASE_SERVICE_ACCOUNT_PATH=/opt/guardtime/secrets/firebase-service-account.json`
in `.env.prod.example`.

Contents besides this file are gitignored — never commit real credentials.
