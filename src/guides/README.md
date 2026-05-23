# Guides

The Guide domain is split by ownership:

- `catalog/` holds built-in definitions and project Guide discovery.
- `schemas/` holds definition, snapshot, and output-contract schemas.
- `runtime/` resolves Guides and records run-local Guide state such as
  participants, arbitration evidence, exports, and suggestions.

Project definitions live under `.amaco/guides/`. They are schema-validated
data, not executable code. Provider invocation and approval behavior stay in
the orchestrator and runtime services.
