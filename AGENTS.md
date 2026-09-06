# AGENTS.md — Guidelines for AI Agents and Contributors

This document establishes standard practices, file organization rules, language guidelines, and historical logging procedures for all AI agents and contributors working on the **Spritemotion** project.

---

## 1. Language Policy

- **English Only**:
  - All source code comments and docstrings.
  - Commit messages and pull request descriptions.
  - All files in `RECORD/`.
  - All files in `ROADMAP/`.
  - `AGENTS.md`, `README.md`, and project documentation.

---

## 2. Work Logging: `RECORD/` Directory

Every planned and executed task must be captured inside the `RECORD/` folder.

### File Naming Convention
```text
RECORD/YYYY-MM-DD.<summary>.<status>.md
```
Where:
- `YYYY-MM-DD`: Current date in ISO 8601 format (e.g., `2026-09-06`).
- `<summary>`: Short, hyphen-separated or dot-separated descriptive slug of the task (e.g., `core-eval-engine` or `wasm-bindings`).
- `<status>`: Either `WIP` (Work In Progress) or `completed`.

### Content Structure
Each record file must include:
1. **Goal / Context**: Objective and motivation for the work.
2. **Tasks & Changes**: Detailed breakdown of implemented modules, functions, or UI elements.
3. **Verification**: Automated test results, commands executed, and verification notes.
4. **Status**: Current completion state and links to relevant code files.

---

## 3. Roadmap Snapshots: `ROADMAP/` Directory

The project roadmap is maintained as chronological snapshots under dated directories:

```text
ROADMAP/YYYY-MM-DD/
```

Inside each `ROADMAP/YYYY-MM-DD/` directory, agents must provide:

1. **Markdown Status Reports (`.md`)**:
   - **Completed Work**: What has already been developed and verified up to this date.
   - **Planned Work**: Next planned iterations, upcoming modules, and priorities.
   - **Pending & Backlog**: Features, architectural decisions, or questions awaiting definition.

2. **Visual Gantt Schedules (`.html`)**:
   - Self-contained HTML files containing a visual Gantt chart representing milestones, phases, and task timelines.
   - Styled with modern aesthetics, readable layout, and interactive or visual timeline bars (e.g., Mermaid.js or SVG/CSS Gantt layout).

---

## 4. Strictly Additive Rule (Append-Only)

> [!IMPORTANT]
> **Files in `RECORD/` and `ROADMAP/` are strictly additive:**
> - **Never modify or overwrite past record or roadmap files.**
> - Every new milestone, review, planning session, or status update must create a new file or directory corresponding to the current date/session.
> - This preserves an immutable chronological audit trail of project evolution, architectural decisions, and development progress.

---

## 5. Development Workflow Checklist for Agents

Whenever an agent takes on work:
1. **Review**: Read previous `RECORD/` and `ROADMAP/` entries to understand historical context and current status.
2. **Plan / WIP Record**: If undertaking non-trivial work, create `RECORD/YYYY-MM-DD.<summary>.WIP.md`.
3. **Implement**: Write code conforming to the architecture, using English comments.
4. **Verify**: Run automated tests (`cargo test`, wasm builds, etc.).
5. **Complete Record**: Generate `RECORD/YYYY-MM-DD.<summary>.completed.md` summarizing what was achieved.
6. **Update Roadmap**: When milestones change or planning advances, create a new snapshot folder `ROADMAP/YYYY-MM-DD/` containing the updated `.md` status and `.html` Gantt view.
