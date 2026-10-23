# Changelog

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
