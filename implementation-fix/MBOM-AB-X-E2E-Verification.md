# MBOM AB/X E2E Verification

Date: 2026-07-29
Status: NOT_RUN

The current repository does not contain the deterministic five-item fixture
required by the process (`A`, `B`, `C`, `AB`, `X`) with separate released
`PV-AB` and `PV-X` configurations. It would be unsafe to claim that:

```text
AB = A + B
X  = AB + C
```

has passed end to end. The Work Order explosion implementation has been
updated to preserve MBOM line identity, parent identity, optional/phantom
flags, base-quantity scaling and scrap calculation. A dedicated seed and
runtime capture must still create the AB/X fixture, create an X Work Order,
verify only AB and C are direct requirements, and verify WMS allocation and
historical snapshot immutability.

Required evidence for closure:

- item/revision IDs and lifecycle states;
- released MBOM and Routing IDs;
- Production Version IDs;
- WO code and material requirement rows;
- WMS request/event IDs;
- substitute approval and actual-consumption audit;
- before/after snapshot query after creating a newer MBOM version.
