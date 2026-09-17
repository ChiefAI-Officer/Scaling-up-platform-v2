# Do emailed URL fragments survive corporate mail? — and the risk we should actually be worried about

**Date:** 2026-09-17
**Question asked:** the member portal's sign-in link carries its secret in the URL fragment
(`/member/sign-in#t=<SECRET>`). Corporate mail rewrites links. Does the fragment survive?
**Why it mattered:** if it does not, the link is dead on arrival for every corporate member,
silently, and the design needs changing before any code is written.

---

## Verdict

**Yes — keep the secret in the fragment. The concern that prompted this research is largely
answered by our own production system, and the research turned up a different risk that the
fragment design happens to defend against.**

Three findings, in order of how much they should change the plan:

1. **We already do this, at scale, for the same people.** Every assessment invitation email this
   platform sends carries its credential in a fragment — `services/notifications.ts:1129` builds
   `${baseUrl}/org-survey/${alias}#t=${rawToken}` — and production holds 101 respondent
   submissions across 10 organizations. Those submissions are the empirical answer: fragments
   are reaching these recipients' browsers through their mail paths today. This is stronger
   evidence than any vendor document, because it is our link, our audience, and our mail path.
2. **The real risk is the opposite one: scanners that *click* the link and burn it.** Supabase
   documents this as a known production failure mode. It does not apply to our invitation link,
   because that link is deliberately reusable — a scanner opening it costs nothing. It applies
   squarely to a **single-use** sign-in link, which is new.
3. **The fragment is the standard defence against exactly that** — and the design therefore has
   a second, better reason to exist than the log-hygiene one it was chosen for. But it only
   works if redemption requires an explicit human click. See "What this changes" below.

---

## What is actually documented, and what is not

| Claim | Status | Evidence |
|---|---|---|
| Our invitation emails already put the token in a fragment | **Verified** | First-party code: `src/src/services/notifications.ts:1129`; `invitation-tokens.ts` header; `email-html-sanitizer.ts:23` |
| Those links reach real recipients successfully | **Verified, with a caveat** | 101 respondent submissions in production (measured 2026-09-16). Caveat: we have not proven every one arrived by an emailed click rather than a coach-relayed link |
| Email security scanners automatically open links in emails, consuming single-use tokens | **Verified — vendor documentation** | Supabase: *"Services such as security tools commonly used by organizations (e.g., for safe link analysis), or similar security scanners, automatically 'click' or access links within emails to analyze their content"* ([Supabase troubleshooting](https://supabase.com/docs/guides/troubleshooting/otp-verification-failures-token-has-expired-or-otp_expired-errors-5ee4d0)) |
| This breaks magic links in enterprise, university and hospital environments specifically | **Reported, community source** | [Supabase discussion #41618](https://github.com/orgs/supabase/discussions/41618): *"Magic links and password reset links are frequently consumed by automated email scanners in enterprise, university, and hospital environments."* No Supabase staff reply in the thread |
| Wrapping the token in a fragment defeats scanner consumption, because *"URL fragments are not fetched by scanners"* | **Community recommendation, mechanically sound, not vendor-confirmed** | [Supabase discussion #41618](https://github.com/orgs/supabase/discussions/41618). The mechanism is correct by construction — a fragment is never transmitted to a server (RFC 3986), so a scanner performing an HTTP fetch cannot see it |
| Supabase's own docs recommend the fragment approach | **No — they do not mention fragments at all** | Their mitigations are: ask your mail vendor about prefetch suppression, delay token invalidation until explicit submission, or make the link lead to a page where the user *enters* a code ([same doc](https://supabase.com/docs/guides/troubleshooting/otp-verification-failures-token-has-expired-or-otp_expired-errors-5ee4d0)) |
| Microsoft Safe Links preserves the fragment when it rewrites a URL | **NOT DOCUMENTED — I could not find Microsoft stating this either way** | [Safe Links overview](https://learn.microsoft.com/en-us/defender-office-365/safe-links-about) and [policy configuration](https://learn.microsoft.com/en-us/defender-office-365/safe-links-policies-configure) describe rewriting to `https://<region>.safelinks.protection.outlook.com` but say nothing about fragment handling |
| Mimecast / Proofpoint / Cisco fragment handling | **NOT ESTABLISHED** | Not researched to primary sources; superseded by finding 1 |

**On that Microsoft gap.** There are two ways a rewriter can handle `https://x/p#t=S`, and *both*
preserve the secret: encode it into the wrapper (`?url=https%3A%2F%2Fx%2Fp%23t%3DS`) and restore
it on redirect, or wrap only the part before the `#` and leave `#t=S` trailing on the wrapper —
in which case the browser re-attaches the fragment to the redirect target, since a redirect whose
target carries no fragment of its own inherits the original's. Only a rewriter that actively
discards the fragment would break it. **I did not find documentation confirming which path
Microsoft takes, and I am not going to assert one.** Finding 1 is what carries the decision.

---

## What this changes in the design

**Keep the fragment.** Two independent reasons now, not one: the credential stays out of server
and proxy logs and the `Referer` header, *and* a scanner performing an HTTP fetch of the link
never sees it.

**One real change: the exchange must require a click.** The spec currently has
`/member/sign-in` read the fragment and exchange it automatically on page load. If any scanner
both opens the link *and* executes the page's JavaScript, an auto-exchange burns the single-use
token before the member ever arrives — the fragment protects the token from a plain fetch, not
from a renderer. Putting the redemption behind an explicit **"View my reports"** button on the
landing page closes that, and it is exactly the shape the Supabase thread describes
(*"extracts the confirmation URL from the fragment … redirects on user action"*). The cost is
one extra click, on a page the member reached deliberately.

This is a change to spec §5.1 and plan Task 11, and it is small.

**Why the existing invitation link needs no change.** It is reusable by design, so a scanner
opening it is harmless. Do not "fix" it by making it single-use.

---

## What a definitive test would look like

Not needed for the decision, but recorded so nobody has to re-derive it:

Send a real sign-in-shaped email to one address inside a Microsoft 365 tenant with Safe Links
enabled and one behind Mimecast, each carrying a distinct fragment token, and instrument the
landing page to log whether it received a fragment — **and separately** log any server-side hit
on the landing URL that arrives before the human clicks, which is the scanner-prefetch signal.
The three prod accounts that are both staff and roster member are the natural first testers.

Until that runs, the claims marked **NOT DOCUMENTED** above stay marked that way.

---

## Addendum — two further research passes (same day)

### The spec gap from the table above is now closed

**RFC 9110, Location field** — verbatim: *"If the Location value provided in a 3xx (Redirection)
response does not have a fragment component, a user agent MUST process the redirection as if the
value inherits the fragment component of the URI reference used to generate the request target."*
([rfc-editor.org/rfc/rfc9110.html](https://www.rfc-editor.org/rfc/rfc9110.html))

So the "fragment left trailing on the wrapper" case is **required** to survive by current spec.
Microsoft's own archived IE-team write-up confirms this was historically *not* interoperable
(IE and Safari dropped it; Chrome, Firefox and Opera re-attached it) and that IE10 fixed it —
so the divergence is real but settled.

### No vendor documents it. Anywhere.

A dedicated pass across Microsoft, Google and Apple first-party documentation found **no
statement, in any product doc, known-issues page or developer reference, about what happens to a
URL fragment when a user clicks a link in a mail client.** Not Outlook (Win32, New, Mac, web),
not Gmail (web, iOS, Android), not Apple Mail. The Safe Links overview does not document the
wrapper's URL grammar at all. This is a documentation vacuum, not a negative finding.

The one place Microsoft *does* say a `#` truncates a URL is the `mailto:` protocol reference,
about Internet Explorer parsing `some#one@example.com`. **It does not generalise and must not be
cited as evidence here.**

### Two cheap safeguards worth adopting regardless

1. **Deliver the link as an HTML `<a href>`, never as bare text.** Outlook's documented
   autolink behaviour truncates a bare-text URL at the first space, and that is first-party
   ([support.microsoft.com](https://support.microsoft.com/en-us/office/prevent-inserted-links-with-spaces-from-breaking-8354450d-7dee-4a32-a09a-2e2289eee64c)).
2. **Keep the secret out of the plain-text alternative part, or keep the whole URL short.**
   RFC 5322 §2.1.1 sets a 998-char MUST and a 78-char SHOULD per line, and a sender that
   hard-wraps to honour the SHOULD splits a long URL permanently. Note the usual folklore is
   half wrong: quoted-printable *soft* breaks (`=CRLF`) are lossless and are **not** the
   mechanism — a hard CRLF inserted by the sender is.

   ⚠️ Our existing invitation email does both of the risky things: `invitation-email.ts:226`
   appends `Start the assessment: {url}` to the **text** part, and `:342` renders the raw URL in
   a "paste this into your browser" span. They have not caused a known failure, but the member
   sign-in email should not copy the pattern without thought.

### One honest limit on this document's headline

The production evidence (101 invited submissions through `#t=` links) proves fragments survive
**for the recipients we actually have**. It does **not** prove they survive Microsoft Safe Links
specifically, because we have never established which of those recipients sit behind a
Defender-for-Office-365 tenant with rewriting on. The verdict stands — but the empirical test
described at the end of this document is still worth running before launch, not instead of it.

### One partial data point, and it is the one that settled the decision

A fourth research pass on the enterprise rewriters was cut off by a rate limit before it could
write up. It had reported one confirmed finding: **Cisco's rewriter percent-encodes the fragment
into the wrapper as `%23`.**

That is the bad branch. When a rewriter folds `#t=SECRET` into its own `?url=` value, the secret
stops being a fragment and becomes an ordinary query parameter travelling to **the scanner's**
server, where it is logged by a third party we have no relationship with. It is strictly worse
than the secret sitting in our own logs, which we control and can redact.

One vendor doing this is enough. We cannot know which rewriter any given member sits behind, and
the behaviour is undocumented, unversioned and free to change. **This is what moved the design to
the query string with a one-hour, single-use, click-to-redeem token** — a form whose behaviour is
fully documented at every hop, and whose worst case is a short-lived secret in logs we own.

Google Workspace and Mimecast were not reached. They no longer change the decision.

---

## Decision record

**2026-09-17 — the sign-in link carries its token in the query string, expires in 1 hour, is
single-use, and is redeemed only by an explicit button click.** Superseding the fragment design
in the first draft of `docs/superpowers/specs/2026-09-17-member-portal-v1-design.md` §5.1 and the
14-day expiry in §7.2. Reasons, in the order they carried weight:

1. A fragment hides nothing from a scanner that reads the email to decide what to rewrite.
2. At least one rewriter (Cisco) encodes the fragment into the wrapper, sending our secret to a
   third party's logs.
3. No auth vendor puts a magic-link token in a fragment; the consensus safety property is a short
   single-use life, not concealment.
4. Click-to-redeem was required under either design, so it is not a cost of this one.

The invitation link is **unchanged** and keeps its `#t=` fragment. It is reusable by design, so a
scanner opening it costs nothing.
