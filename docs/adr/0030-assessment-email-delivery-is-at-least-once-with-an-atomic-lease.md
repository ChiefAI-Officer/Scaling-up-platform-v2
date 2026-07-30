---
status: accepted
---

# Assessment email delivery is at-least-once with an atomic sending lease

Assessment outbox delivery uses an atomic sending lease so only one worker may actively send a row and a stale claim can be recovered. The lease applies to the shared assessment outbox across public taker, Referring coach, Scaling Up team, invited respondent, and owning-coach roles; a public-only branch would preserve the same race for more sensitive reports. A worker reserves local capacity before claiming, then token-guards completion or failure. Kill and deletion establish a durable send fence that blocks new claims and waits for active leases before reporting quiescence. This deliberately chooses at-least-once delivery over marking a row sent before SMTP: ordinary SMTP cannot eliminate either the crash-after-delivery-before-recording gap or revoke an SMTP call already in flight, and those rare observable exposures are audited rather than falsely reported as prevented. Concurrent event and cron drains must therefore coalesce, while lease recovery, in-flight exposure, and duplicate-risk signals remain visible to operators.
