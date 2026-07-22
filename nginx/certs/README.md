# nginx/certs

Bind-mounted read-only into the `nginx` container at `/etc/nginx/certs`.

Populate with your real certificate before first deploy:

- `fullchain.pem`
- `privkey.pem`

See `DEPLOYMENT.md`'s SSL section for how to obtain these with certbot.
This directory's contents (besides this file) are gitignored — never
commit real certificate material.
