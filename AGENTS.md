# Comms MCP Server - Development Guidelines

## Definition of done

- **Done means proven:** a test that failed before the change and passes after, or the tool's real answer (`npm run tool`, on a test account). For a refactor: tests that pin the behaviour, passing before and after. Reading code or a passing compile is not proof.
- **Run `npm run verify` before calling a change done.** It runs every check CI runs, in a few seconds, and records the pass. It prints what it cannot see. When only docs changed, it checks just their formatting.
- **Never weaken a check to pass it.** Don't skip, delete or loosen tests, edit lint, type or test config to get green, or use `--no-verify`. If a check looks wrong, say so and stop.
- **Report honestly:** what ran, what it showed, and what you did not verify.

## Skills

Use the matching skill without being asked. They live in `.agents/skills/` (Claude Code reads them through `.claude/skills/`).

- `verify`: before saying a change is done, fixed or ready.
- `fix-bug`: something is broken or wrong.
- `build-feature`: a new tool, parameter or behaviour.
- `refactor`: changing structure without changing behaviour. Other tasks send restructuring here, as a separate change.
- `write-tests`: writing or changing tests; `.agents/skills/write-tests/references/test-rules.md` is the quality bar.
- `learn`: after a correction, to turn it into a check.
- `review-changes`: when the owner says a change is ready for a PR, or asks for a review.

## Review checks

Reviewers, Doistbot included, apply these to every change:

- [Tests](.agents/checks/tests.md): not weakened, new behaviour tested.
- [Architecture](.agents/checks/architecture.md): rules lint can't express.
- [Security](.agents/checks/security.md): the token, notifications, destructive tools.
- [Privacy and secrets](.agents/checks/privacy.md): this repository is public.
- [Tool surface](.agents/checks/tool-surface.md): what models see.
- [Evidence](.agents/checks/evidence.md): claims backed by what ran.

## Git hooks and agent tooling

- Commits and pushes to `main` are refused by the git hooks. Work on a branch.
- Your `git push` and `gh pr create` are stopped until `npm run verify` has passed on exactly the commit being pushed (Claude Code and Codex hooks, Cursor untested, and a Pi extension; start Pi at the repository root). Verify, then commit exactly what it saw, or commit first and verify the clean tree. If something must be pushed unverified, ask the person you're working with to push it.
- Agent tooling lives in `.agents/scripts/`, never in `scripts/`.
- How it all fits together: [`docs/agents.md`](docs/agents.md).

## Adding a New Tool

A tool's `execute` returns `{ textContent, structuredContent }`. Registration, result shaping, null stripping and the schema contract suites come from [`@todoist/mcp-core`](https://github.com/todoist/mcp-core), which todoist-mcp and automations-mcp share; change shared behaviour there, not in a local copy.

When adding a new tool, it must be registered in **all** of these locations:

1. `src/utils/tool-names.ts` — add tool name constant
2. `src/tools/<tool-name>.ts` — create tool definition
3. `src/tool-registry.ts` — add it to `registeredTools`, which `src/mcp-server.ts` registers; add to the LLM `instructions` string in `src/mcp-server.ts` only when it needs cross-tool guidance
4. `src/index.ts` — import and add to both the `tools` object and the named exports
5. `scripts/run-tool.ts` — import and add to the `tools` record
6. `src/tools/tool-annotations.test.ts` — add annotation expectation entry
7. `src/tools/<tool-name>.test.ts` — create test file

If the tool pushes the fixed cost (the `tools/list` payload plus `instructions`) over `DEFAULT_TOKEN_BUDGET` in `src/token-footprint.test.ts`, raise the budget in the same PR and say why in the description. The test prints the cost per tool, so a reviewer can see where it went.

## Ask before a write that cannot be undone

`delete-object` asks the user to confirm before it deletes, and `create-thread` and `reply` ask before notifying everyone in a channel of 10 or more people, as the web app does (`src/utils/notify-everyone.ts`). Both go through `request.confirm` from `@todoist/mcp-core` (the third argument of `execute`). A client that can show a form puts the question to the user; one that cannot gets `unavailable`, and the tool acts as it did before. Follow it for a new tool whose write cannot be undone:

- Declare `request?` optional, so the tool can still be called with two arguments.
- Run every check that can refuse the call before `confirm`, and write nothing before it: the tool runs from the top again once the user answers.
- Pass `message` as a function when naming the object costs a lookup; it is built only when the question is asked. The lookup only names the object, so degrade it (`degradeWithLog`) to a question naming it by ID rather than failing the call.
- Record each settled outcome with `logConfirmation` (`src/utils/confirmation-log.ts`), so declines and clients that cannot ask can be counted.
- On `declined`, write nothing and tell the model not to try again: in a normal result when the tool's output schema can describe nothing having happened, otherwise in a thrown error (as a declined post does).
- Test it with `createMockToolRequest` from `src/utils/test-helpers.ts`.

## Code Style

- Prefer `function` declarations over `const` arrow-function assignments for named
  helpers (module-level or nested). Reserve arrow functions for inline callbacks
  (e.g. `.map()`, `.filter()`, `.catch()`). Lint (`func-style` in `.oxlintrc.json`) enforces this in `.agents/scripts/` and `.pi/`; `src/` still has a few older exceptions.

## Testing Requirements

When adding new tool parameters:

1. Add comprehensive test coverage for new fields
2. Test setting values
3. Test clearing values (if applicable)
4. Run `npm run verify`, and `npm run build`, which CI and verify do not run

## Documentation Requirements

When adding new tool features:

1. Update tool schema descriptions in the source file
2. Update `src/mcp-server.ts` tool usage guidelines
3. Add tests demonstrating the feature
4. Include examples in descriptions where helpful

## Running Tools Directly

`npm run tool` runs any tool through `scripts/run-tool.ts`, without the MCP server:

```bash
npm run tool -- <tool-name> '<json-args>'
npm run tool:list  # list all tools
```

Examples:

```bash
npm run tool -- user-info '{}'
npm run tool -- search-content '{"query":"project update"}'
npm run tool -- fetch-inbox '{"workspaceId":12345}'
```

Requires `COMMS_API_KEY` in `.env` (and optionally `COMMS_BASE_URL`, e.g. `https://comms.staging.todoist.com` for staging).
