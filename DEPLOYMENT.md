# Deployment

Push to `v1`. GitHub builds the ARM64 image, pushes its commit tag to GHCR,
and deploys it through Tailscale SSH to `prod-01:/opt/apps/templui.io`.
Docker waits for `/healthz` before reporting success.

Uses the existing `proxy` network and Traefik HTTPS setup. No app ports are
published. `www.templui.io` redirects to `templui.io`.

Point the domain's DNS records at prod-01. HTTP redirects to HTTPS through
the shared Traefik configuration.

Uses the same Tailscale OIDC credential as the other apps. The client ID in
the workflow is public, not a secret. No extra GitHub variable is needed.

The credential accepts repositories owned by `axadrn` using the `production`
environment. In GitHub Settings > Environments > production, allow only the
`main` and `v1` branches. Keep this restriction when changing deployment setup.
