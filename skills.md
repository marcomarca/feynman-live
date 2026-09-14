# General AI Development Skills — Node / JavaScript / TypeScript Projects

> General-purpose Markdown for AI-assisted Node, JavaScript, and TypeScript development. It condenses the useful engineering skills into a reusable operating contract for projects that use Bun.

---

# 0. Node Project Defaults

## Required tooling

```txt
Runtime/package manager/test runner: Bun
Dependency metadata: package.json
Lockfile: bun.lock
Language: TypeScript by default for non-trivial projects
Formatter/linter: Biome by default, or ESLint/Prettier if the existing framework already uses them
Type checking: tsc --noEmit
Test runner: bun test by default
Build tool: framework-specific; Vite for generic frontend apps, library bundler only when needed
```

## Hard rules

```txt
Use bun for install, lockfile, scripts, tests, and local command execution.
Do not default to npm, yarn, or pnpm unless the existing repo already uses them.
Commit package.json and bun.lock.
Do not commit node_modules.
Use TypeScript for application code unless the project is intentionally plain JavaScript.
Prefer explicit types at module boundaries.
Keep framework components thin; move domain logic to plain TypeScript modules.
```

## Standard repository shapes

Generic TypeScript app or service:

```txt
project-name/
  package.json
  bun.lock
  tsconfig.json
  README.md
  AI_SKILLS.md
  src/
    domain/
    services/
    adapters/
    config/
    index.ts
  tests/
    unit/
    integration/
    e2e/
  docs/
    adr/
    architecture.md
    testing-strategy.md
  scripts/
```

Vite frontend app:

```txt
project-name/
  package.json
  bun.lock
  index.html
  vite.config.ts
  tsconfig.json
  src/
    app/
    components/
    features/
    domain/
    services/
    adapters/
    styles/
    main.tsx
  tests/
```

Backend Node service:

```txt
src/
  domain/
  services/
  adapters/
  http/
    routes/
    middleware/
    server.ts
  config/
  index.ts
```

Library:

```txt
src/
  index.ts
  internal/
  public-api.ts
```

## Bootstrap commands

```bash
bun init
bun add <runtime-dependency>
bun add -d typescript @types/bun
bun install
bun test
```

For a Vite React app:

```bash
bun create vite <project-name> --template react-ts
cd <project-name>
bun install
bun run dev
bun test
```

For TypeScript checks:

```bash
bun add -d typescript
bunx tsc --init
bunx tsc --noEmit
```

For Biome:

```bash
bun add -d @biomejs/biome
bunx biome init
bunx biome check .
```

## Standard scripts in package.json

```json
{
  "scripts": {
    "dev": "bun --watch src/index.ts",
    "build": "tsc --noEmit",
    "typecheck": "tsc --noEmit",
    "test": "bun test",
    "lint": "biome check .",
    "format": "biome format --write .",
    "check": "bun run typecheck && bun run lint && bun test"
  }
}
```

For Vite apps:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "test": "bun test",
    "lint": "biome check .",
    "format": "biome format --write .",
    "check": "bun run typecheck && bun run lint && bun test"
  }
}
```

## Node / TypeScript coding standards

```txt
Use TypeScript strict mode for non-trivial projects.
Avoid any at module boundaries.
Use unknown for untrusted input, then validate it.
Use discriminated unions for state machines and variant results.
Use zod, valibot, arktype, or framework-native schemas for external input validation when runtime validation is needed.
Keep async side effects at adapters/services boundaries.
Use AbortSignal for cancellable network or long-running work where useful.
Avoid mutable shared module state.
Avoid default exports in shared domain modules unless the project convention requires them.
Prefer named exports for refactorability.
```

## TypeScript module boundary pattern

```txt
src/domain/       Pure types, rules, value objects, validation policies.
src/services/     Use cases and orchestration.
src/adapters/     Database, filesystem, external APIs, browser storage, queues, auth providers.
src/http/         HTTP transport only for backend services.
src/components/   UI components only for frontend apps.
src/features/     Vertical UI feature modules.
src/config/       Config parsing and validation.
```

Rule:

```txt
Domain must not import React, Express, Hono, database clients, browser APIs, or network clients.
Services may depend on domain and adapter interfaces.
Adapters translate external data into internal types.
UI components should call hooks/services, not embed domain workflows directly.
```

## Frontend policy

```txt
Keep rendering components small.
Move data fetching, caching, and orchestration into hooks or services.
Keep domain rules out of JSX.
Make loading, empty, error, and success states explicit.
Use accessible semantic HTML before custom widgets.
Do not couple UI state to server response shapes directly; normalize at the boundary.
Prefer controlled state machines for complex flows.
```

## Backend Node policy

```txt
Routes should be thin.
Schemas validate transport payloads.
Services implement use cases.
Domain models must not depend on Request/Response objects.
External clients are injected.
Translate domain errors into HTTP responses at the transport boundary.
```

## Node testing defaults

```txt
Unit tests: pure TypeScript functions, reducers, state machines, validators.
Integration tests: database adapters, HTTP routes, filesystem, serialization.
Component tests: important UI behavior when applicable.
E2E tests: minimal critical workflows.
Contract tests: adapter behavior and external API normalization.
Property-style tests: use generated cases for parsers, validators, and state machines when beneficial.
```

Recommended conventions:

```txt
Use bun test for default test execution.
Use fake timers for time-dependent behavior.
Use explicit fixtures for external payloads.
Do not mock the function under test.
Mock network, storage, time, browser APIs, and external services.
Prefer testing user-visible UI behavior over component internals.
```

## Node quality gate

Before considering a change complete, run the relevant subset:

```bash
bun run format
bun run lint
bun run typecheck
bun test
```

Or, when configured:

```bash
bun run check
```

For Vite apps:

```bash
bun run build
```

## Node dependency policy

```txt
Use bun add for runtime dependencies.
Use bun add -d for dev dependencies.
After changing dependencies, update bun.lock.
Do not install via npm/yarn/pnpm in a Bun project.
Prefer native platform APIs and small libraries before adding large frameworks.
Avoid packages that are unmaintained, unnecessary, or duplicate existing framework capability.
Review licenses and transitive dependencies for production projects.
```

## Node error handling policy

```txt
Throw typed/custom errors for domain failures when exceptions fit the flow.
Use Result-like unions for expected branching failures.
Never silently swallow rejected promises.
Always await async work or intentionally detach it with documented handling.
Translate infrastructure errors at adapter boundaries.
Log operational context at process boundaries.
```

## TypeScript state modeling policy

Prefer this:

```ts
type LoadState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; error: string };
```

Over this:

```ts
{
  isLoading: boolean;
  data?: T;
  error?: string;
}
```

Reason: discriminated unions prevent impossible states.


---

# 1. Operating Contract for the AI Developer

This file is meant to be pasted into an AI coding agent or stored in the repo as `AI_SKILLS.md` / `AGENTS.md` / `CLAUDE.md`.

The AI must behave as a technical implementer, not as a brainstorming assistant. Its default output must be code, tests, diagnosis, architecture notes, or precise implementation plans.

## Core behavior

1. Work from the repository state, not from assumptions.
2. Prefer small vertical slices over broad rewrites.
3. Preserve existing public behavior unless the task explicitly changes it.
4. Do not invent hidden requirements. When a requirement is missing, make a reasonable assumption and state it in the plan or commit notes.
5. Do not introduce new dependencies unless they solve a specific problem better than existing tools.
6. Every meaningful change must be testable.
7. When touching existing code, first understand call sites, data flow, and tests.
8. When a bug exists, reproduce it before fixing it when feasible.
9. When a behavior is important, encode it in tests or executable checks.
10. Leave the repo cleaner, but do not perform unrelated cleanup.

## Default work loop

```txt
1. Read the relevant files.
2. Identify the smallest useful slice.
3. State the intended change briefly.
4. Add or update tests first when practical.
5. Implement the change.
6. Run the narrowest useful checks.
7. Run the broader quality gate before finalizing.
8. Summarize changed files, checks run, and residual risks.
```

## Non-negotiables

```txt
Do not bypass tests to make a task appear complete.
Do not delete user work without explicit instruction.
Do not use destructive git commands unless explicitly authorized.
Do not mix formatting-only changes with behavioral changes unless unavoidable.
Do not hide uncertainty behind confident language.
Do not add abstractions without a real variation point or clear simplification.
Do not test private implementation details when public behavior can be tested.
```

---

# 2. Skill Router

Use this table to decide which discipline to apply.

| Situation | Skill | Output |
|---|---|---|
| New project, unclear module boundaries, major refactor | Codebase Design | Interfaces, seams, module responsibilities |
| Ambiguous terms, domain rules, business concepts | Domain Modeling | Glossary, invariants, examples, ADR candidates |
| Vague idea or many possible approaches | Decision Mapping | Decision map, risks, staged choices |
| Need to validate UI, algorithm, API, or data model quickly | Prototype | Throwaway prototype answering one question |
| Implementing a feature or bugfix | TDD + Implementation | Tests, code, refactor, quality gate |
| Failing behavior or regression | Diagnosing Bugs | Reproduction, hypothesis, fix, regression test |
| Reviewing branch, PR, generated code, or architecture | Two-Axis Review | Findings separated into Spec and Standards |
| Code feels hard to change or test | Improve Architecture | Deepening opportunities and refactor path |
| Converting a rough idea into product scope | To PRD | PRD with goals, non-goals, stories, risks |
| Converting a plan into work items | To Issues | Vertical issues with acceptance criteria |
| Setting up repo safety | Pre-Commit + Git Guardrails | Hooks, checks, protected workflow |
| Continuing work later or handing off to another agent | Handoff | Current state, decisions, next actions, risks |

---

# 3. Skill: Codebase Design

## Goal

Design deep modules: substantial behavior hidden behind small, stable interfaces.

## Vocabulary

```txt
Module: Function, class, package, endpoint, adapter, service, component, or vertical slice with an interface and implementation.
Interface: Everything a caller must know to use the module correctly: types, invariants, errors, order of calls, performance, side effects.
Implementation: Internal code behind the interface.
Seam: A boundary where behavior can be replaced without editing callers.
Adapter: A concrete implementation behind a seam.
Depth: High value behind a small interface.
Locality: The property that changes and bugs are concentrated in one area.
Pass-through module: A shallow wrapper that adds names but not leverage.
```

## Principles

1. Design interfaces around domain behavior, not around framework mechanics.
2. Prefer explicit inputs and return values over hidden global state.
3. Accept dependencies from the outside. Do not create hard-coded dependencies internally unless they are pure and stable.
4. Use adapters at real boundaries: database, filesystem, network, clock, external APIs, payment providers, queues, auth providers, browser APIs.
5. Avoid premature abstraction. One implementation is usually not enough evidence for an abstraction.
6. But do not duplicate domain rules across call sites. If the same rule appears twice, extract the rule behind a named interface.
7. Prefer deterministic pure functions for calculations, validation, parsing, formatting, and policy decisions.
8. Keep side effects at the edges.

## Interface checklist

```txt
[ ] Does this interface hide real complexity?
[ ] Can callers use it without knowing implementation details?
[ ] Are inputs and outputs typed or schema-validated?
[ ] Are expected errors modeled?
[ ] Are invariants explicit?
[ ] Can behavior be tested only through the public interface?
[ ] Does the module have one main reason to change?
[ ] Would removing this module duplicate complexity in multiple callers?
```

## Refactor trigger smells

```txt
- Many files need edits for one concept change.
- Same validation appears in controllers, UI, and tests.
- Tests require monkeypatching internals instead of using public APIs.
- Framework objects leak into domain logic.
- External API payloads are used directly across the app.
- A service method mostly forwards arguments to another service.
- Boolean flags create multiple hidden modes in one function.
- Error handling is inconsistent across similar paths.
```

---

# 4. Skill: Domain Modeling

## Goal

Make the project language explicit so code, tests, docs, and prompts use the same concepts.

## Required artifacts when domain complexity exists

```txt
CONTEXT.md                  # glossary, entities, invariants, examples
docs/architecture.md         # system shape and module boundaries
docs/adr/0001-*.md           # durable decisions and trade-offs
docs/testing-strategy.md     # test layers and critical paths
```

## Rules

1. If a term is ambiguous, define the canonical term before implementing.
2. If two terms mean the same thing, choose one and remove the synonym from code.
3. If one term means two different things, split it.
4. Put durable decisions in ADRs, not only in chat history.
5. Encode domain invariants in constructors, schemas, validators, or test fixtures.
6. Prefer examples with edge cases over abstract definitions.

## Domain modeling template

```markdown
# Context

## Purpose

<What the system does and for whom.>

## Glossary

| Term | Meaning | Notes |
|---|---|---|
| User | ... | ... |
| Account | ... | ... |

## Core entities

### <Entity>

Fields:
- `id`: ...
- `status`: ...

Invariants:
- ...

Examples:
- Valid: ...
- Invalid: ...

## Workflows

### <Workflow>

1. ...
2. ...
3. ...

## Open questions

- ...
```

## ADR template

```markdown
# ADR <number>: <decision>

## Status

Proposed | Accepted | Superseded

## Context

<Problem, constraints, forces.>

## Decision

<Chosen option.>

## Consequences

Positive:
- ...

Negative:
- ...

## Alternatives considered

- Option A: rejected because ...
- Option B: rejected because ...
```

---

# 5. Skill: Decision Mapping

## Goal

Turn an unclear request into ordered decisions so implementation does not start with excessive uncertainty.

## When to use

```txt
- Requirements are broad or contradictory.
- Several architecture choices are possible.
- A dependency, framework, database, or API choice is not obvious.
- The task can be implemented in multiple incompatible ways.
- The user asks for a roadmap, implementation strategy, or migration plan.
```

## Decision map format

```markdown
# Decision Map — <topic>

## Objective

<What must become possible.>

## Hard constraints

- ...

## Decisions

### D1 — <decision>

Options:
- A: ...
- B: ...

Recommendation:
- Choose <A/B> because ...

Risks:
- ...

Validation:
- ...

## Sequence

1. Decide D1 before D3 because ...
2. Prototype D2 before committing because ...

## Reversible vs irreversible

Reversible:
- ...

Hard to reverse:
- ...
```

## Rule

Do not turn every detail into an up-front decision. Decide only what blocks safe implementation.

---

# 6. Skill: Prototype

## Goal

Build a temporary artifact to answer a specific uncertainty, then discard or rewrite it cleanly.

## Prototype contract

A prototype must define:

```txt
Question: What is being validated?
Scope: What is intentionally excluded?
Success: What observation decides the question?
Disposal: What must be deleted or rewritten if the prototype succeeds?
```

## Good prototype questions

```txt
Can this library render the required interaction?
Can this API return enough data with acceptable latency?
Can this parser represent the grammar cleanly?
Can this storage shape support the query pattern?
Can this algorithm produce deterministic output on edge cases?
```

## Rules

1. Do not ship prototype code unless it passes normal production standards.
2. Mark throwaway files clearly.
3. Keep prototype dependencies isolated.
4. Convert learnings into ADRs, tests, or implementation tasks.
5. Delete the prototype once the production slice exists.

---

# 7. Skill: TDD

## Goal

Use tests to define behavior and prevent regressions, not to mirror implementation.

## Red-Green-Refactor loop

```txt
1. Red: Add the smallest failing test for desired behavior.
2. Green: Implement the simplest code that satisfies the test.
3. Refactor: Improve structure while keeping tests green.
4. Repeat with the next behavior or edge case.
```

## Test pyramid

```txt
Many unit tests for pure rules and transformations.
Some integration tests for adapters, persistence, and framework boundaries.
Few end-to-end tests for critical user workflows.
Contract tests for external APIs or module interfaces.
Property-based tests for parsers, validators, calculations, and state machines.
Regression tests for every non-trivial bug fix.
```

## Good tests

```txt
[ ] Assert public behavior, not private implementation.
[ ] Have one clear reason to fail.
[ ] Use meaningful fixtures.
[ ] Cover edge cases and invalid input.
[ ] Avoid sleeps, randomness, and network dependency unless explicitly isolated.
[ ] Fail with useful messages.
[ ] Are deterministic in any order.
```

## Bad tests

```txt
- Tests that only assert a mock was called while no behavior is verified.
- Tests that duplicate the implementation line by line.
- Snapshot tests for unstable or irrelevant output.
- Tests that require a specific internal file structure.
- Tests that pass even when the feature is broken.
```

## Mocking rules

```txt
Mock external systems, time, randomness, network, filesystem boundaries, payment providers, email/SMS providers, queues, and browser APIs.
Do not mock the domain logic being tested.
Prefer fake implementations over over-specified mocks.
Use contract tests to ensure fakes match real adapters.
```

---

# 8. Skill: Implementation Workflow

## Before coding

```txt
[ ] Read the task and identify acceptance criteria.
[ ] Inspect existing files and tests.
[ ] Identify the module boundary.
[ ] Decide whether this is feature, bugfix, refactor, test-only, or docs.
[ ] Choose the narrowest useful quality gate.
```

## During coding

```txt
[ ] Keep changes scoped.
[ ] Add types/schemas before business logic when useful.
[ ] Keep side effects at boundaries.
[ ] Update tests alongside code.
[ ] Prefer small commits or logical change groups.
[ ] Do not mix unrelated refactors.
```

## Before final answer or commit

```txt
[ ] Run formatter.
[ ] Run lint/static checks.
[ ] Run relevant tests.
[ ] Run full test suite when the change touches shared or critical code.
[ ] Check git diff.
[ ] Summarize behavior changes and files touched.
[ ] State any checks not run and why.
```

---

# 9. Skill: Diagnosing Bugs

## Goal

Fix bugs by narrowing uncertainty, not by guessing.

## Debug loop

```txt
1. Describe the observed failure.
2. Identify expected behavior.
3. Create or find a reproduction.
4. Reduce the reproduction to the smallest failing case.
5. Form one hypothesis at a time.
6. Test the hypothesis with logs, debugger, assertions, or targeted tests.
7. Fix the root cause.
8. Add a regression test.
9. Remove temporary instrumentation.
```

## Bug report template

```markdown
# Bug Diagnosis — <title>

## Observed behavior

...

## Expected behavior

...

## Reproduction

...

## Scope

Affected:
- ...

Not affected:
- ...

## Root cause

...

## Fix

...

## Regression test

...
```

## Rules

```txt
Do not patch symptoms before locating the root cause.
Do not keep debug logs unless they are useful operational logs.
Do not change multiple suspected causes at once.
Do not mark fixed without a reproduction or a targeted verification.
```

---

# 10. Skill: Two-Axis Review

## Goal

Review changes along two independent axes:

```txt
Spec axis: Does the change implement the requested behavior?
Standards axis: Is the change maintainable, safe, tested, and aligned with project conventions?
```

## Review output format

```markdown
# Review

## Blocking findings

1. <Finding>
   - Axis: Spec | Standards
   - Evidence: <file/function/test>
   - Why it matters: ...
   - Required change: ...

## Non-blocking findings

1. ...

## Tests and verification gaps

- ...

## Suggested follow-ups

- ...
```

## Review checklist

```txt
[ ] Requirement coverage is complete.
[ ] No obvious edge case is ignored.
[ ] Types/schemas validate external input.
[ ] Errors are explicit and actionable.
[ ] Tests would fail if behavior regressed.
[ ] No unnecessary dependency was added.
[ ] No secret, token, or generated artifact was committed.
[ ] No large unrelated formatting diff is mixed in.
[ ] Naming matches domain language.
[ ] Public interfaces remain stable or migration is handled.
```

---

# 11. Skill: Improve Codebase Architecture

## Goal

Improve architecture by increasing locality, reducing interface burden, and making behavior easier to test.

## Process

```txt
1. Identify pain: hard to test, hard to change, duplicated rule, leaky abstraction.
2. Trace the behavior across files.
3. Find the current interface and hidden assumptions.
4. Propose the smallest refactor that improves locality.
5. Add characterization tests before moving behavior.
6. Refactor behind existing public behavior.
7. Remove dead code and obsolete tests.
```

## Deepening opportunities

```txt
- Move repeated validation into a value object or schema.
- Replace scattered conditionals with a policy object or rules function.
- Wrap external API payloads in normalized internal models.
- Convert framework-bound business logic into pure services.
- Split command/query paths when one method does too much.
- Replace global config reads with explicit injected settings.
- Introduce a repository only when persistence behavior is non-trivial.
```

## Refactor safety rules

```txt
Do not refactor and change product behavior in the same step unless necessary.
Preserve public contracts or document migration.
Prefer characterization tests before touching tangled legacy code.
Measure performance-sensitive refactors before claiming improvement.
```

---

# 12. Skill: To PRD

## Goal

Convert a rough idea into a scoped product requirement document.

## PRD template

```markdown
# PRD — <feature/product>

## Problem

<Concrete problem and user.>

## Goals

- ...

## Non-goals

- ...

## Users and use cases

- ...

## Functional requirements

1. ...

## Non-functional requirements

- Performance: ...
- Security: ...
- Accessibility: ...
- Reliability: ...
- Observability: ...

## UX/API behavior

- ...

## Data model impact

- ...

## Edge cases

- ...

## Acceptance criteria

- ...

## Test strategy

- Unit: ...
- Integration: ...
- E2E: ...

## Open questions

- ...
```

## Rules

```txt
Keep PRDs implementation-aware but not implementation-locked unless a technical constraint is already decided.
Explicitly list non-goals to prevent scope creep.
Acceptance criteria must be externally observable.
```

---

# 13. Skill: To Issues

## Goal

Break work into implementable vertical issues.

## Issue template

```markdown
# <Issue title>

## Objective

<One outcome.>

## Context

<Relevant decision, link, or constraint.>

## Scope

In:
- ...

Out:
- ...

## Implementation notes

- ...

## Acceptance criteria

- [ ] ...
- [ ] ...

## Tests required

- [ ] Unit: ...
- [ ] Integration: ...
- [ ] E2E: ...

## Dependencies

- ...
```

## Rules

```txt
Each issue should deliver user-visible behavior, domain capability, or infrastructure required by the next vertical slice.
Avoid issues that only say "build backend" or "create UI".
Keep issue dependencies explicit.
```

---

# 14. Skill: Pre-Commit and Quality Gates

## Goal

Make correct behavior cheaper than incorrect behavior.

## Minimum hooks

```txt
format
lint
static typecheck where available
test fast suite
secret scan if the project handles credentials
block large generated files unless explicitly allowed
```

## Rules

```txt
Hooks should be fast enough to run locally.
CI can run slower checks.
Do not rely only on pre-commit; document commands in README.
Do not let generated files churn unless they are required artifacts.
```

---

# 15. Skill: Git Guardrails

## Goal

Prevent accidental loss of work while allowing normal development.

## Rules for AI agents

```txt
Allowed without explicit permission:
- git status
- git diff
- git log
- git show
- git branch --show-current

Ask before:
- git add
- git commit
- git push
- git pull --rebase
- creating or deleting branches

Never run unless explicitly authorized for the exact command:
- git reset --hard
- git clean -fd
- git checkout -- .
- git restore .
- git rebase
- git push --force
- rm -rf on project directories
```

## Before editing

```txt
Run git status.
Notice uncommitted user changes.
Do not overwrite files the user changed unless the task requires it and the diff is understood.
```

---

# 16. Skill: Handoff

## Goal

Let another agent or future session continue without rediscovering context.

## Handoff template

````markdown
# Handoff — <project/task>

## Current objective

...

## Completed

- ...

## Current state

- Branch: ...
- Relevant files: ...
- Tests passing/failing: ...

## Decisions made

- ...

## Important constraints

- ...

## Next steps

1. ...
2. ...
3. ...

## Risks / unknowns

- ...

## Commands last run

```txt
...
```
````

---

# 17. Prompt to Start a New AI Coding Session

Use this when starting work with an AI coding agent:

```txt
You are working in this repository as an implementation agent.

First read this file and obey it as the project operating contract.

Task:
<describe the task>

Constraints:
- Preserve existing behavior unless explicitly changing it.
- Work in the smallest safe vertical slice.
- Add or update tests for meaningful behavior.
- Use the project's documented package manager, runtime, formatter, linter, and test commands.
- Before editing, inspect relevant files and current git status.
- After editing, run the narrowest useful checks and report exactly what passed or failed.

Return:
- Summary of changes.
- Files changed.
- Commands run.
- Remaining risks or follow-up work.
```

---

# 18. Node/Bun-Specific Final Checklist

```txt
[ ] package.json exists and scripts use bun-compatible commands.
[ ] bun.lock is current and committed.
[ ] node_modules is ignored.
[ ] TypeScript strict mode is enabled for non-trivial projects.
[ ] Commands in README use bun / bun run / bunx.
[ ] Domain logic is not coupled to React, Vite, Express, Hono, database clients, or browser APIs unless that is the domain.
[ ] Tests cover public behavior.
[ ] bun run typecheck passes if configured.
[ ] bun run lint passes.
[ ] bun test passes.
[ ] bun run build passes for buildable apps.
```

# 19. Minimal Node/Bun Agent Prompt

```txt
You are implementing a Node/JavaScript/TypeScript project.
Use Bun for package management, lockfile, scripts, tests, and command execution.
Do not use npm, yarn, or pnpm unless the existing repository already requires them.

Follow AI_SKILLS.md.
Work in a small vertical slice.
Add/update tests for meaningful behavior.
Run Bun-based quality gates before finalizing.
Report changed files, commands run, and remaining risks.
```