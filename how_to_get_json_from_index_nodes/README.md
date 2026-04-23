# How to Get Index Stats JSON from Couchbase Index Nodes

This folder contains tools to collect the GSI Index stats JSON needed by **cb_index_tree_map**.

Choose the method that matches your deployment:

## Self-Hosted Couchbase

Use the **Ansible playbook** in the [`ansible/`](./ansible/) folder.

It SSHs into a single cluster node, auto-discovers all index nodes via the cluster map, collects the stats, and brings the JSON files back to your machine.

👉 See [`ansible/README.md`](./ansible/README.md) for setup and usage.

## Couchbase Capella (DBaaS)

Use the **shell / PowerShell scripts** in the [`capella/`](./capella/) folder.

They run directly from your Mac or Windows laptop — no SSH needed. Your IP must be in the Capella Allowed IP list.

👉 See [`capella/README.md`](./capella/README.md) for setup and usage.
