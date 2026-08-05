# Phase 4.1-4.2 - OSPF topology route learning

These increments make configured single-area OSPF processes affect simulated
multi-device connectivity instead of serving only as configuration criteria.

## Supported behavior

- Directly linked routed interfaces form an OSPF adjacency when both interfaces
  are active, share a subnet, match an OSPF network statement, use the same
  area, and are not passive.
- Routers on the same switched access VLAN can discover each other and form an
  adjacency across the Layer 2 broadcast segment. VLAN membership, active
  links, and spanning-tree forwarding state are respected.
- Active networks matched by OSPF statements are advertised through the
  connected OSPF neighbor domain.
- Ping, traceroute, and SSH may use learned routes in both directions.
- Process IDs are locally significant and do not need to match between routers.
- Existing connected and static routing behavior remains unchanged.
- `show ip ospf neighbor` displays established simulated adjacencies.
- `show ip route ospf` displays networks learned from the OSPF domain.

## Current boundary

These Phase 4 increments model single-area OSPF over direct routed links and
switched access VLANs. Multi-area ABR behavior, interface bandwidth-based route
costs, DR/BDR election details, and ECMP are later Phase 4 increments.
