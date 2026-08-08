# Standalone Operation Skill Requirement UI Decision

The standalone `/master-data/operation-skill-requirements` console flow was removed.

This is a UI-flow removal, not a domain or API removal:

- Operation Catalog remains the owner of default employee skill requirements for an Operation.
- Routing Operation remains the owner of Routing-specific overrides.
- The shared `md_operation_skill_requirement` table remains required by both flows and by worker readiness evaluation.
- Specialized APIs under `/operations/:id/worker-skill-requirements` and `/routing-operations/:id/worker-skill-requirements` remain active.

The generic Planning Constraints page duplicated authoring responsibility and exposed a confusing third entry point. The sidebar and all four standalone routes were removed. Existing backend records are preserved; no destructive data migration is performed.
