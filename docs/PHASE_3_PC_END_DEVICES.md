# Phase 3 — PC and end-device simulation

This increment adds PC nodes to multi-device CLI practicals.

## Instructor workflow

- Add a device and select **PC / end device**.
- Enter its required display label and starting hostname.
- Link its `Ethernet0` adapter to a router or switch interface.
- Existing **Interface IP address**, **Device default gateway**, **Successful topology ping**, and **Successful topology traceroute** criteria can grade the PC state.

## Student PC workflow

Students configure the PC from the **IP Configuration** tab. The form includes
the IPv4 address, subnet mask, default gateway, preferred DNS server, and
alternate DNS server. Students do not type commands to change these values.

The separate **Command Prompt** tab accepts verification commands:

- `ipconfig`
- `ipconfig /all`
- `ping <address>`
- `tracert <address>`
- `help`

PC state is autosaved when the student applies the form and is restored when an
attempt resumes. Typed PC configuration commands are rejected.

## Connectivity behavior

- A PC reaches hosts on its own subnet directly.
- A PC uses its configured default gateway for remote networks.
- Physical interfaces and links must be active.
- Ping requires both forward and return connectivity.
- Traceroute requires a valid forward path.

## Current boundary

This increment does not yet perform VLAN membership or trunk calculations.
Those are part of the next Phase 3 increment.
