Audit and correct the Production Version creation and edit flow after the recent Item Revision ownership refactor.

The current UI incorrectly allows users to independently select an Item Revision, EBOM, MBOM, and Routing. These objects now have explicit ownership relationships and must not be combined arbitrarily.

Focus on correcting the Production Version workflow, effective-date handling, backend validation, and UI presentation. Do not introduce unrelated fields or redesign unrelated modules.

# 1. Required Production Version selection flow

Replace the current independent selectors with an ownership-driven flow:

```text
Select Item
  → Select eligible Item Revision
  → Load configuration owned by that Item Revision
  → Display Revision, EBOM, MBOM, and Routing information

The user must first select an Item.

After an Item is selected, show a dropdown containing only eligible revisions belonging to that Item.

After selecting a revision:

Load only EBOMs owned by that revision.
Load only MBOMs owned by that revision.
Load only Routings owned by that revision.
Never display or submit structures owned by another revision.
Clear all derived configuration when the selected Item or Revision changes.

Do not allow the frontend to assemble an arbitrary combination of independent IDs.

The backend must independently enforce the same ownership constraints.

2. UI redesign

After an Item Revision is selected, display the related configuration as separate read-only summary cards below the selector.

Required cards:

Item Revision card

Display:

Item name
Item code
Revision code
Lifecycle status
Effective From
Effective To, or “No end date”
Icon button linking to the Item Revision detail route
EBOM card

Display:

EBOM code
lifecycle status
version
effective period
line count where available
icon button linking to EBOM detail
MBOM card

Display:

MBOM code
lifecycle status
version
Site
base quantity and UOM
effective period
icon button linking to MBOM detail
Routing card

Display:

Routing code
lifecycle status
version
Site
operation count where available
effective period
icon button linking to Routing detail

Reuse the existing common Card, Badge, Button, Tooltip, and navigation patterns.

Do not display raw UUIDs as the primary user-facing value.

3. Multiple configurations

One Item Revision may own multiple EBOM, MBOM, or Routing versions.

If exactly one eligible Released configuration exists for a category:

select it automatically
display it as a read-only card

If multiple eligible Released configurations exist:

show a selector inside or directly above the corresponding card
list only configurations owned by the selected Item Revision
list only configurations valid for the required effective time
preserve clear business code, version, Site, and effective-period labels

Do not auto-select an arbitrary configuration when multiple valid choices exist unless an existing Default rule resolves it unambiguously.

4. Item Revision effective-date correction

Audit and remove the incorrect behavior that automatically updates the previous or adjacent Item Revision’s effective_to when a new revision is created.

Each Item Revision owns its own independent effective interval:

[effective_from, effective_to)

Rules:

effective_from is required according to the existing contract.
effective_to is optional.
effective_to = null means the revision remains valid indefinitely.
Creating a new revision must not automatically modify another revision.
Multiple revisions may have overlapping effective periods when explicitly configured by the user.
Do not infer that the newest revision automatically invalidates the previous revision.
Do not automatically close the previous revision unless a separate explicit business action exists.

Remove or correct this behavior across:

service logic
repository logic
database triggers
migrations
frontend mutation handlers
clone/new-revision workflows
seed scripts
tests

Do not change historical Work Order snapshots.

5. Eligible revision rule

A revision should appear in the Production Version revision dropdown only when it satisfies the confirmed eligibility rules.

At minimum:

effective_from <= evaluation_time
AND
(
  effective_to IS NULL
  OR evaluation_time < effective_to
)

Also apply the existing required lifecycle and Item-type rules.

Use one clearly defined evaluation time:

current time for normal Production Version authoring, or
Production Version valid_from if the form already defines the future effective date before configuration selection

Audit the existing form flow and choose the authoritative rule consistently.

Do not compare date-only strings using browser-local assumptions when values are stored as timestamps.

6. Two-sided validation

Frontend filtering is only UX assistance.

The backend must validate again during Production Version create and update:

Item Revision belongs to the selected Item.
Item Revision is eligible at the authoritative evaluation time.
EBOM belongs to the selected Item Revision.
MBOM belongs to the selected Item Revision.
Routing belongs to the selected Item Revision.
Required structures are Released and effective.
Site consistency is valid.
MBOM issue Operations resolve correctly against the selected Routing.
No independently supplied mismatched IDs are accepted.

Use stable structured errors, reusing existing codes where equivalent codes already exist.

Possible categories:

ITEM_REVISION_NOT_EFFECTIVE
PRODUCTION_VERSION_EBOM_REVISION_MISMATCH
PRODUCTION_VERSION_MBOM_REVISION_MISMATCH
PRODUCTION_VERSION_ROUTING_REVISION_MISMATCH
PRODUCTION_VERSION_CONFIGURATION_NOT_EFFECTIVE
PRODUCTION_VERSION_SITE_MISMATCH
7. API and query behavior

Audit the current endpoints before changing contracts.

Prefer ownership-scoped queries such as:

GET eligible revisions by Item
GET Released/effective EBOMs by Item Revision
GET Released/effective MBOMs by Item Revision
GET Released/effective Routings by Item Revision

Reuse existing endpoints and filters where they already support this behavior.

Do not load all EBOMs, MBOMs, and Routings and rely solely on local frontend filtering.

On Item or Revision change:

cancel or ignore stale requests
clear old selections and cards
refetch current eligible dependencies
prevent stale data from another revision from remaining in the form
8. Production Version payload

The frontend may still submit the required IDs for the selected configuration, but all values must come from the ownership-scoped flow.

Do not trust hidden or stale form values.

Before submit, verify that the visible cards and submitted IDs refer to the same Item Revision.

Do not allow manual Site selection when Site is authoritative and derived from the selected MBOM/Routing configuration under the current architecture.

9. Lifecycle behavior

Preserve the current lifecycle model.

Do not invent new states.

Production Version creation should use only configuration that satisfies the existing release and effective-date policies.

Item Revision effective dates and lifecycle are different concerns:

lifecycle determines whether the revision is approved/released for use
effective dates determine when it is valid
creating a newer revision does not automatically change either field on an older revision
10. Required tests

Add or update tests for:

Selecting an Item shows only its revisions.
Only effective revisions appear.
A revision with effective_to = null remains eligible indefinitely.
A future revision does not appear before its effective_from.
An expired revision does not appear after effective_to.
Creating a new revision does not modify the previous revision’s effective_to.
Overlapping revisions remain independently selectable when both satisfy policy.
Selecting a revision loads only its EBOMs.
Selecting a revision loads only its MBOMs.
Selecting a revision loads only its Routings.
Changing Item clears the selected Revision and all configuration.
Changing Revision clears stale EBOM, MBOM, and Routing selections.
Backend rejects EBOM from another revision.
Backend rejects MBOM from another revision.
Backend rejects Routing from another revision.
Backend rejects a non-effective Item Revision.
One valid configuration is auto-selected.
Multiple valid configurations require an explicit choice unless a unique Default exists.
Detail icon buttons navigate to the correct routes.
Existing historical Work Orders remain unchanged.
11. Constraints

Do not:

add unrelated schema fields
add duplicate Item or Revision identifiers
restore independent arbitrary selectors
automatically close a previous revision
infer eligibility from revision number ordering
assume the latest revision is always the valid revision
modify historical Work Orders
weaken backend validation
change EBOM, MBOM, Routing, or Production Version ownership rules
redesign unrelated pages
12. Acceptance criteria

The change is complete when:

Production Version starts with Item selection.
Revision selection is scoped to the selected Item.
Only eligible revisions are displayed.
Selecting a revision loads only its owned EBOM, MBOM, and Routing.
Related configuration is displayed through clear summary cards.
Each card provides navigation to its detail page.
Users cannot combine structures from different revisions.
Backend enforces the same ownership and effective-date rules.
effective_to = null means open-ended validity.
Creating a new revision no longer changes another revision’s effective period.
Existing Production Version, Work Order, MBOM, EBOM, and Routing logic remains otherwise unchanged.