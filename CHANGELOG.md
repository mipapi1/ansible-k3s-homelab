# Changelog

## v1.4.0

- monitoring: far fewer alert messages. One message per alert name instead of per alert
  name and namespace, sent after a 2m wait so an outage's alerts arrive together; group
  changes at most every 6h (so a shorter problem gives 2 messages, firing and resolved);
  an alert still firing is repeated after ~5 days instead of 12h
  (`monitoring_alert_group_by`, `_group_wait`, `_group_interval`, `_repeat_interval`)
- monitoring: while a node alert fires (`monitoring_node_alerts`), the per-app alerts it
  causes (`monitoring_node_symptom_alerts`) are not sent; `AlertingRulesError` silences
  `RecordingRulesError` (both fire when vmalert can't reach VictoriaMetrics)

## v1.3.0

- longhorn: weekly filesystem trim of every volume (RecurringJob `trim-weekly`,
  `longhorn_trim_cron`, Sunday 02:00) and `removeSnapshotsDuringFilesystemTrim`
  (`longhorn_remove_snapshots_during_trim`), so space from deleted files is given back even
  though the nightly backup keeps a snapshot

## v1.2.2

- monitoring: ntfy pushes carry at most 5 alerts (`max_alerts`); bigger groups went over
  ntfy's message size limit and were rejected (email still gets every alert)

## v1.2.1

- monitoring: VMSingle memory limit 1Gi -> 2Gi (was OOMKilled at ~244k series)

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
