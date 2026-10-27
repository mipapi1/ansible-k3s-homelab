# Changelog

## v1.2.0

- authelia: `authelia_oidc_apps` adds OpenID Connect clients for more apps ("Log in with
  Authelia"); each may be used by group `admins` and group `app-<name>`, with 2FA. Client
  secrets come from `files/oidc-secrets.sh --app <name>`; the role waits until they reach the
  cluster before restarting Authelia.
- authelia: every key in `secret/k8s/authelia/oidc` is synced (as `oidc-<key>`), so new client
  hashes need no ExternalSecret change

## v1.1.0

- longhorn: spread replicas over the nodes (`longhorn_replica_auto_balance: best-effort`)
  and delete replica data no volume uses any more (`longhorn_orphan_auto_deletion:
  replica-data`)
- Example inventory: kubelet removes unused images from 70% disk use, before Longhorn's
  25% minimum free space is reached

## v1.0.0

First public release, extracted from a running three-node k3s homelab.

- Roles: nfs, igpu, nfs_csi, longhorn, argocd, external_secrets, cloudnative_pg, forgejo,
  authelia, k3s_oidc, monitoring, headlamp, registry_mirror
- Example playbook and inventory (k3s via k3s-io/k3s-ansible)
- Render test for every template
