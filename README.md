# ansible-k3s-homelab

Ansible collection **`mipapi1.k3s_homelab`**: the platform layer of a three-node k3s homelab
on Proxmox. Everything the apps rely on, installed by Ansible before and outside Argo CD:
GitOps, secrets from Vault, a git server with CI and a container registry, single sign-on
with 2FA (including `kubectl`), monitoring with alerts, storage and backups.

It's the code running a real cluster (three Intel N100/N150 mini PCs). The comments say
why things are set the way they are, including what broke before they were.

```
            ┌─────────────── k3s (3 servers, embedded etcd) ───────────────┐
 browser ─▶ │ Traefik ─▶ Authelia (2FA, OIDC) ─▶ Grafana, Headlamp, apps   │
 proxy/TLS  │                                                              │
            │ Argo CD ◀── Forgejo (git, Actions, registry) ◀── you push    │
            │   └─▶ apps/*  (one folder = one app = one namespace)         │
            │ External Secrets ◀── Vault (outside the cluster)             │
            │ Longhorn (2 replicas) ── nightly backups ──▶ NAS (NFS)       │
            │ VictoriaMetrics + Alertmanager ──▶ ntfy + email              │
            └──────────────────────────────────────────────────────────────┘
```

## Roles

| Role | What it does | Runs on |
|---|---|---|
| `nfs` | NFS client packages | every node |
| `igpu` | HWE kernel and GPU firmware for VMs with a passed-through Intel iGPU | every node |
| `nfs_csi` | NFS CSI driver and an `nfs-nas` StorageClass (bulk data) | control node |
| `longhorn` | Node prerequisites (iSCSI, multipath blacklist), Longhorn as default StorageClass, nightly backups to NFS | every node, then control node |
| `argocd` | Argo CD and an ApplicationSet: every folder under `apps/` becomes an app | control node |
| `external_secrets` | External Secrets Operator and a Vault `ClusterSecretStore` (Kubernetes auth) | control node |
| `cloudnative_pg` | CloudNativePG operator (PostgreSQL) | control node |
| `forgejo` | Forgejo with its PostgreSQL, all keys from Vault, Actions on; gives Argo CD read access | control node |
| `authelia` | Login portal with 2FA (Redis sessions, users in Vault), OpenID Connect provider for Headlamp and kubectl | control node |
| `k3s_oidc` | API server trusts Authelia's ID tokens; group `admins` = cluster-admin. Rolling k3s restart | servers, one at a time |
| `monitoring` | VictoriaMetrics stack, Grafana behind Authelia, scrapes of Proxmox, Longhorn and Traefik, alert rules, dashboards | control node |
| `headlamp` | Kubernetes UI with Authelia sign-in, plus a break-glass token | control node |
| `registry_mirror` | containerd pulls docker.io/ghcr.io/lscr.io images from your own registry first, upstream as fallback. Rolling k3s restart | every node, one at a time |

"Control node" roles run `helm`/`kubectl` from where you run Ansible, against the
kubeconfig context `cluster_context`.

## Quick start

```bash
mkdir my-cluster && cd my-cluster
cp -r <this repo>/examples/* .            # site.yml, inventory.yml, group_vars/, requirements.yml
ansible-galaxy collection install -r requirements.yml
# edit inventory.yml, set up Vault (below), then:
export VAULT_ADDR=https://vault.example.com && vault login
ansible-playbook site.yml                 # everything
ansible-playbook site.yml --tags monitoring   # one add-on
ansible-playbook site.yml --check --diff  # what would change
```

`examples/site.yml` installs k3s with the upstream
[k3s-io/k3s-ansible](https://github.com/k3s-io/k3s-ansible) collection, then the roles,
each behind an `install_<role>` switch.

Needs on the control node: Ansible >= 2.17, `helm`, `kubectl`, `vault` CLI, Python
`hvac` (for Vault lookups) and `kubernetes`.

## Settings

Shared variables, set in the inventory:

| Variable | Description |
|---|---|
| `homelab_domain` | **Required.** Base domain: hosts default to `<app>.<homelab_domain>` |
| `cluster_context` | **Required.** kubectl context of the cluster |
| `argocd_apps_repo` | **Required** for `argocd`/`forgejo`: the repo Argo CD deploys `apps/` from |
| `homelab_timezone` | Timezone (Authelia logs, the alert mute window); default `UTC` |
| `homelab_node_cidrs` | Node addresses for NetworkPolicies (kubelet probes); default: inventory hostnames + `/32` |
| `nfs_server`, `nfs_share` | NFS export for `nfs_csi` and Longhorn backups |

Everything else is in each role's `defaults/main.yml`, with comments: hosts, chart
versions (pinned), resources, Vault paths, SMTP, the Authelia app list, and so on.

## Vault

Secrets never go into git or the inventory. Ansible reads what it needs (the k3s token,
the registry pull token) with `community.hashi_vault` lookups using your `vault login`
token. In the cluster, External Secrets reads from a KV v2 mount (`secret`) using Vault's
Kubernetes auth:

```bash
vault auth enable kubernetes
vault write auth/kubernetes/config kubernetes_host=https://<api-endpoint>:6443
vault policy write external-secrets - <<'EOF'
path "secret/data/k8s/*" { capabilities = ["read"] }
EOF
vault write auth/kubernetes/role/external-secrets \
  bound_service_account_names=external-secrets bound_service_account_namespaces=external-secrets \
  policies=external-secrets ttl=1h
```

Entries the roles expect (under `secret/`):

| Path | Keys | Used by |
|---|---|---|
| `k8s/forgejo/admin` | `username`, `password` | Forgejo break-glass admin |
| `k8s/forgejo/postgres` | `password` | Forgejo's database user |
| `k8s/forgejo/app` | `secret-key`, `internal-token`, `jwt-secret`, `lfs-jwt-secret` | Forgejo; never regenerate on a running instance |
| `k8s/argocd/forgejo` | `token` | Argo CD's read-only Forgejo token |
| `k8s/authelia/main` | `jwt-secret`, `session-secret`, `storage-encryption-key`, `smtp-password` | Authelia |
| `k8s/authelia/users` | `users` (JSON) | Authelia users: `roles/authelia/files/authelia-user.sh` |
| `k8s/authelia/oidc`, `k8s/headlamp/oidc` | created by `roles/authelia/files/oidc-secrets.sh` | OpenID Connect |
| `k8s/monitoring/ntfy`, `k8s/monitoring/smtp` | `topic`; `to`, `password` | Alertmanager |
| `k8s/monitoring/proxmox` | `token-id`, `token-secret` | pve-exporter (`monitoring_proxmox: true`) |

The first Authelia user:
`vault kv put secret/k8s/authelia/users users='{}'`, then
`authelia-user.sh add <you> --email <you@example.com> --groups admins` (it refuses to save
a user list without an active admin).

## Design notes

- **The platform isn't managed by Argo CD.** Argo CD reads the apps from Forgejo, Authelia
  guards the UIs, and Headlamp is the fixing tool: none of them may depend on the thing
  they're needed to fix. Ansible installs them; Argo CD runs everything under `apps/`.
- **Rolling restarts only.** Roles that change k3s's own config (`k3s_oidc`,
  `registry_mirror`) restart one server at a time, wait for its API server, its etcd and
  the node to be healthy, then pause before the next, so etcd keeps its quorum.
- **etcd and Longhorn share one disk per node.** Hence fewer parallel replica rebuilds
  (`longhorn_concurrent_rebuilds_per_node: 1`) and, in the example inventory's k3s
  settings, longer etcd timeouts: parallel rebuilds after a node outage starved etcd and
  restarted k3s.
- **Sign-in to Kubernetes with Authelia.** The API server trusts Authelia's ID tokens
  (structured `AuthenticationConfiguration`), so Headlamp and `kubectl oidc-login` act
  as the user with that user's RBAC. Headlamp's own service account has no rights.
- **Grafana trusts Authelia's `Remote-User` header**, so a NetworkPolicy makes sure only
  Traefik can reach it.
- **Image mirror with fallback.** Manifests keep upstream image names; containerd tries
  your registry first and falls back to upstream on a miss, so the mirror can't stop pods
  from starting.

## Testing

```bash
ansible-playbook -i localhost, -c local tests/render.yml -e @tests/vars.yml
```

renders every template with example values and checks the result is valid YAML. CI runs it,
a syntax check of the example playbook, and a secret scan.

## License

MIT
