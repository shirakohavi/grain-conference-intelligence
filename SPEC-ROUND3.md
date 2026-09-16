# Round 3 spec, agreed 16 Sep 2026

Everything below is decided. Anything marked DECISION is a call I made where
Shira had not said, flagged in chat for her to overturn.

## Contacts table, final column list

Name · Lead status · Company · ICP fit · Relationship · Met · Where and last
seen · Spoke to them · HubSpot

Removed: ICP score, Signal, the priority 0-100, Segment.

## ICP fit, High / Medium / Low

A rule. Company fit 70, role fit 30, banded 80+ High, 50-79 Medium, under 50
Low. The band is what shows. The arithmetic stays in the tooltip and the
drawer, not in the table, because Shira asked for one label, not two marks.

- Company fit comes from the ICP segment on the lead (PSP, Travel,
  Marketplace, BNPL, Payroll, Stablecoin, Treasury, Other), which is Grain's
  own list from their LinkedIn.
- Role fit comes from the title, on the same seniority ladder already used
  elsewhere: founder and C-level top, then VP, then Head or Director, then
  Lead, then Manager, then unreadable.

## Relationship, four states

New / Developing / Active / Dormant. Set automatically, editable by the rep.
An override sticks and is marked as an override, so the rule and the human can
visibly disagree.

- New        first interaction
- Developing repeat interactions, movement in the history
- Active     clear commercial intent or a named next step
- Dormant    previous engagement, no momentum now

DECISION: the tire-kicker lands in Dormant. "No momentum" is read as nothing
moving, not nothing recent. Four polite meetings with no commercial signal is
no momentum even if the last one was Tuesday. The detail page says exactly
that, in words, from the history.

DECISION: hot / warm / cold survives as the per-meeting input a rep picks in
field mode and on each encounter. It is what makes "Active" mean anything, and
it is the established language in the video script. It is no longer a
contact-level column, which is what "no separate signal" meant.

## HubSpot

No manual push anywhere. Every contact syncs, carrying its lead status, ICP
fit and relationship. Every new encounter appends to the SAME HubSpot contact,
matched by work email, so a person met at four conferences is one record with
four notes.

The HubSpot column becomes read-only sync state, not a button.

The draft follow-up email still only appears when a rule says something
happened, and still goes to HubSpot as a draft, never sent.

## The rest of the list

1.  Drop "Identity unclear" from the HubSpot filter
2.  Employee filter, MULTI-SELECT, on Conferences, Contacts and Plan the year
3.  Edit a contact any time, from the drawer and from field mode, not only at
    the merge moment
4.  Field mode label "Your role" becomes "Role"
5.  Field mode: a visible way back to which conference and which person
6.  Create one real HubSpot draft email in the test portal to see how it
    renders. Approved. The record cannot be deleted afterwards.
7.  Remove "Ask the model" from the identity review
8.  Log a new meeting on an existing contact: conference, note, signal, same
    fields as adding a new person
9.  No model or demo wording inside the prose. Demo state is a badge on the
    card, never a sentence in the middle of a sales brief.
10. Company normaliser must merge "monday" and "monday.com" so one employer
    does not read as three
11. Lead status is the human's call, Relationship is computed. Lead status is
    relabelled so the two do not read as the same thing.
