Please perform a full UI/UX audit of the MES Console.

There is a fundamental UI mindset issue throughout the application:

**The UI is exposing internal database IDs instead of meaningful business information.**

For example, in the Work Order creation page, the Readiness Summary currently displays values such as:

```text
MBOM
ebefe808-545b-4f22-9b70-6151a7557961

Routing
bdf183f0-9d44-4674-8153-134ae7b151c3

This is unacceptable for an enterprise MES. End users do not know or care about UUIDs.

Required UI Principle

The UI must always display human-readable business information, not internal identifiers.

Examples:

MBOM → MBOM code or localized MBOM name
Routing → Routing code or localized Routing name
Production Version → Production Version code
Item Revision → Revision code (R1, R2...)
Work Center → Work Center code + localized name
Equipment → Equipment code + localized name
Employee → Employee code + full name
Site → Site code + localized name
Status → Localized display text
UOM → Display code (PCS, KG, M...)

UUIDs should never appear in the normal UI.

Internal IDs are only acceptable:

API payloads
Developer tools
Logs
Technical debug panels
Copy Technical Details actions
Administrator diagnostics

Never expose them in normal business screens.

Audit Requirement

Review the entire MES Console and find every place where UUIDs or database IDs are rendered directly.

Replace them with proper business display values using the existing localized/i18n data whenever possible.

If an API currently returns only IDs, do not work around it in the frontend. Instead, extend the backend contract to include the required business display fields (code, localized name, display label, etc.).

Follow this UI mindset consistently across the entire application:

The UI is designed for factory users, planners, supervisors, and managers—not developers. Every visible value should answer "What is this?" immediately without requiring knowledge of database IDs.

After the audit, update the implementation report with:

Every screen inspected
Every place where raw IDs were removed
API contracts updated
Display fields added
Remaining places (if any) where IDs are still intentionally shown and the justification.