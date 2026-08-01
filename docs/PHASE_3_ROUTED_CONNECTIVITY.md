# Routed topology connectivity

This Phase 3 increment upgrades topology verification from physical-link-only
checks to routed reachability checks.

## Behavior

- Every physical link must reference configured, enabled interfaces.
- Routers and multilayer switches require a connected or static route toward
  the destination.
- Static routes use longest-prefix matching.
- A successful ping requires both a forward route and a return route.
- Layer 2 switches may forward between active physical links.
- `traceroute` and `tracert` show the simulated path through topology devices.
- Instructors can grade a successful traceroute independently of a ping.

## Current boundary

This increment evaluates connected and static routes. Dynamic OSPF path
learning, VLAN-specific Layer 2 forwarding, ACL packet filtering, NAT
translation, and PC end-device nodes remain later Phase 3 increments.

## Acceptance checks

1. Connect two routed devices in the same subnet. Ping succeeds only while both
   linked interfaces are enabled.
2. Connect three routers. Without a route to the remote network, ping fails.
3. Add a forward static route only. Ping still fails without a return route.
4. Add both directions. Ping succeeds and satisfies a connectivity criterion.
5. Run traceroute. The output lists intermediate topology devices and satisfies
   a traceroute criterion.

Apply migration `053_phase3_routed_connectivity_and_traceroute.sql` before
publishing practicals that use the traceroute grading criterion.
