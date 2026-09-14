# Deployment

Push to `v1`. GitHub builds the ARM64 image, pushes its commit tag to GHCR,
and deploys it through Tailscale SSH to `prod-01:/opt/apps/templui.io`.
Docker waits for `/healthz` before reporting success.

Uses the existing `proxy` network and Traefik HTTPS setup. No app ports are
published. `www.templui.io` redirects to `templui.io`.

Point the domain's DNS records at prod-01. HTTP redirects to HTTPS through
the shared Traefik configuration.

The existing Tailscale credential only accepts `main`. Create a second GitHub
OIDC trust credential for this branch:

- Subject: `repo:axadrn/shadcn-templ:environment:production`
- Claim `repository_owner`: `axadrn`
- Claim `ref`: `refs/heads/v1`
- Permission: Auth Keys Write, tag `tag:ci`

Set its client ID as the GitHub repository variable `TS_V1_CLIENT_ID`.
It is a public identifier, not a secret. The existing main credential stays
unchanged.
