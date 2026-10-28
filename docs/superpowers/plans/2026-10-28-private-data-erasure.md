# Private data erasure implementation plan

> **For agentic workers:** Use superpowers:executing-plans and test each failure boundary before shipping.

**Goal:** Prevent an erasure from reporting success while an earlier member-data write or private-file upload can still create data for that member.

**Architecture:** A per-member database revision fences writes that started before erasure. A durable upload-intent row is created before each R2 put and remains until the file is recorded or its safe cleanup is confirmed. Erasure holds a database-backed owner lock, prevents new writes, and only reports success once no upload intents remain and the known files and member rows have been removed. A crash or ambiguous provider response remains pending for operator recovery; no timeout alone proves an R2 write has stopped.

**Tech stack:** Worker, D1 transactions and private R2. The current `DB` and `Bucket` adapters remain the test seam.

**Spec:** `docs/superpowers/specs/2026-10-27-fitmagra-brand-redesign-design.md`, sections 11, 12 and 14.

## Constraints

- Do not deploy, alter Cloudflare resources, change Vercel or publish. Work only in the feature branch.
- Keep existing consent, authentication, ownership checks, file validation and administrator audit records.
- R2 and D1 are not one transaction. Do not delete an object after a database error unless the code has proved the record cannot have committed.
- A negative R2 read does not establish that an earlier uncertain put will never finish. Do not clear an intent based only on elapsed time or a negative read.
- Before production, prevent legacy Workers from starting writes, establish that their in-flight requests have terminated, and reconcile earlier untracked objects. A migration alone cannot find those objects.

## Review focus

- A put is paused while erasure starts, then resumes after the erase request returns.
- A D1 batch commits but the caller receives an error, or an R2 operation reports an ambiguous failure.
- A worker stops after R2 deletion but before database cleanup, and an administrator retries.
- A log or nutrition target request starts before erasure and reaches D1 after erasure finishes.
- Two administrators submit erasure simultaneously, or an operator retries a job with a live owner.

## Task 1. Record upload intents

**Files:** `migrations/0005_private_data_fence.sql`, `worker/files.ts`, `worker/app/routes.ts`, `worker/admin/routes.ts`, `tests/member.test.mjs`.

- [ ] Add per-user data revision and erasure state. Add a private upload-intent table keyed by the generated R2 key, with user and creation time. Keep intents if a request outcome is uncertain.
- [ ] Before an R2 put, atomically insert an intent only if the captured member revision is current and the user is not being erased. Test that a fenced member cannot start an upload.
- [ ] After a confirmed put, insert the file row only if the captured revision, non-erasing state and matching intent still hold. Remove the intent in the same D1 batch only when the file row was actually inserted. Condition the PDF audit entry on insertion too. A zero-row insert is not success. If the fence changed, delete the known object only after the put has returned successfully and no file row committed; then remove the intent. If either R2 or D1 reports an ambiguous error, retain the intent and do not claim success.
- [ ] Test both photo and PDF uploads, rejected finalization, confirmed cleanup, an R2 failure, and a D1 failure. Include an injected response-loss case where the D1 batch commits but the caller sees an error; the committed file must remain available.

## Task 2. Fence all member-data writes

**Files:** `worker/auth/sessions.ts`, `worker/index.ts`, `worker/app/routes.ts`, `worker/admin/routes.ts`, tests.

- [ ] Capture the current data revision in the member session at the start of each request. Reject member access while erasure is pending.
- [ ] Guard log inserts using that captured revision and an atomic `INSERT ... SELECT`. A request that began before erasure must not save after the revision changes, even if erasure has since completed.
- [ ] Capture the target member revision before potentially delayed work and guard every nutrition target statement, including its audit entry, and document uploads. Cover both insert and conflict-update paths. Distinguish a zero-row fence failure from invalid input and database errors.
- [ ] Test paused member and administrator writes across the start and completion of erasure. Verify unrelated members remain usable.

## Task 3. Durable erasure and recovery

**Files:** `worker/admin/routes.ts`, `worker/files.ts`, `tests/member.test.mjs`, `docs/runbooks/cloudflare-cutover.md`.

- [ ] Atomically start erasure by rotating the data revision, setting erasure pending, and acquiring a unique owner. Reject a concurrent owner. Do not report completion while any intent exists.
- [ ] Delete only the keys recorded for the fenced member. Delete member rows, write the audit record and release the fence in one D1 batch. Guard every statement by the same owner and revision and by `NOT EXISTS` upload intents. Check affected-row results and report success only on a confirmed guarded release. A failure must leave a durable pending state and a retryable owner-free state when the current worker can prove it has stopped its own work. If a final batch may have committed despite a lost response, re-read a durable job identifier and audit state; never infer success or repeat solely from a missing owner.
- [ ] A crash with an owner or an ambiguous put needs an operator runbook. Do not steal the lock or clear intents by a timer alone. Give the administrator a clear pending message. If there is no supported external proof that an ambiguous put has definitively ended, keep the job pending as a manual incident; elapsed time, a negative read, a crashed request and a successful delete are not proof. Document the required evidence and reconciliation procedure. Do not log names, file keys or other private data to public logs.
- [ ] Test concurrent erase submissions, failed R2 deletes, failed D1 cleanup, recovery after a confirmed stopped operation, and a paused put that finishes after erasure begins. An erase response must never claim success while an unresolved intent or a pre-fence write can still persist.

## Task 4. Verify and review

- [ ] Run `npm run check`, the targeted race tests, and a fresh independent security review of the final diff. Verify the migration applies in order to the D1 test adapter.
- [ ] Update the draft PR with the recovery limits and remaining production reconciliation, staging, visual and legal gates. Do not merge or deploy.

## Platform references

- [Cloudflare R2 consistency and in-flight writes](https://developers.cloudflare.com/r2/reference/consistency/).
- [Cloudflare Workers request duration and cancellation](https://developers.cloudflare.com/workers/platform/limits/).
- [Cloudflare D1 batch transactions](https://developers.cloudflare.com/d1/worker-api/d1-database/).
