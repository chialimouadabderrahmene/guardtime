# nginx/certbot-www

Bind-mounted read-only into the `nginx` container at `/var/www/certbot`,
serving ACME HTTP-01 challenge files during certificate issuance/renewal.
Certbot (run separately — see `DEPLOYMENT.md`'s SSL section) writes here;
nginx's plain-HTTP server block serves `/.well-known/acme-challenge/` from
this path. Contents besides this file are gitignored.
