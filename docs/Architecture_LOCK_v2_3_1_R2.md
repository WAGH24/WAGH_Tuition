# WAGH TUITION CLASSES — COMPLETE ARCHITECTURE LOCK

**Application baseline:** v2.3.1  
**Architecture-document revision:** R2  
**Status:** LOCKED  
**Lock date:** 17 July 2026  
**Purpose:** Single authoritative ChatGPT Project Source for future WAGH Tuition Classes work

> This file replaces `WAGH_Tuition_Classes_LOCKED_Instructions_v2_3_1.md` and all earlier WAGH Tuition Classes instruction pages. Earlier files remain historical evidence only. If an older instruction conflicts with this file, this file wins.

---

## 1. SCOPE, IDENTITY AND PRECEDENCE

This document applies only to **WAGH Tuition Classes**.

Keep these projects completely separate unless the user explicitly authorizes an integration:

- WAGH Tuition Classes
- WTC Learn
- ScoreBadhao

Never copy or share their Sheets, Apps Script projects, deployment URLs, schemas, authentication, feature engines, routes, configuration or release instructions by assumption.

### Naming

- **WAGH Tuition Classes** is the development system.
- **WAGH Tuition** is the stable student-facing system.
- A code package may retain WAGH Tuition Classes identifiers internally until a controlled stable promotion explicitly changes display branding.

### Non-negotiable global rules

- Dynamic, reusable, API-driven content is the long-term source of truth.
- Chapter-specific static pages remain backward-compatible fallbacks during migration.
- Prefer managed Sheet/API data over hardcoded content.
- Preserve mobile-first behaviour.
- Preserve existing data and unrelated user changes.
- Keep modules backward compatible unless the user approves a migration.
- Never change architecture, schemas, IDs, URLs, authentication or access policy silently.
- Never store passwords, private Sheet IDs, deployment IDs, tokens or other secrets in this Project Source.

---

## 2. ENVIRONMENT ISOLATION — DEVELOPMENT AND STABLE

Development and stable are separate environments. Each environment must have its own:

- GitHub repository or protected branch/release source
- GitHub Pages deployment
- `WTC_CONTENT_ENGINE` workbook copy
- `WTC_FEATURE_ENGINE` workbook copy
- `WTC_AI_CONTENT_ENGINE` workbook copy
- runtime Apps Script project/deployment
- authoring Apps Script project/deployment
- configuration values and Script Properties

### Isolation rules

- Develop and test in WAGH Tuition Classes first.
- Never place a stable Web App URL in the development repository.
- Never use development Sheet IDs or Script Properties in the stable backend.
- Never copy a development configuration file to stable without checking every environment-specific value.
- Search for hardcoded `script.google.com/macros/s/` URLs before promotion; API URLs belong only in their central configuration files.
- Preserve the exact deployed `/exec` URL unless a deployment deliberately changes it.
- Never redeploy or change code merely to solve a browser cache/session symptom; distinguish cache behaviour from a backend failure first.
- Promote only after user confirmation, backup and controlled smoke testing.
- Record the stable Git commit/tag and keep a rollback package before transfer.

### Deployment state

The development v2.3.1 student experience has been tested successfully. Do not infer that stable has been promoted unless the user explicitly confirms it.

---

## 3. COMPLETE PLATFORM TOPOLOGY

WAGH Tuition Classes consists of four cooperating layers:

| Layer | Responsibility | Source of truth |
|---|---|---|
| GitHub Pages frontend | Login and Student, Admin, Teacher and Parent portals; static fallback pages | Repository files |
| Runtime backend | Identity, catalogue, routing, feature registry, results, progress, health and compatibility APIs | Apps Script bound to `WTC_CONTENT_ENGINE` plus `WTC_FEATURE_ENGINE` |
| Authoring/published-content backend | Static import, extraction, review, publishing and published dynamic Lesson/MCQ/Solution/Worksheet reads | Apps Script bound to `WTC_AI_CONTENT_ENGINE` |
| Managed data | Users, chapters, routing, feature policy, authored content, results and progress | Three separate Google workbooks |

### Current two-API frontend contract

- `/assets/js/config.js` contains the runtime API `/exec` URL.
- `/assets/js/assessment-config.js` contains the authoring/published-content API `/exec` URL.
- `/assets/js/api.js` calls the runtime API.
- `/assets/js/assessment-api.js` calls the authoring/published-content API.
- `student-dynamic-content.js` currently reads published dynamic content through `WTC_ASSESSMENT_API`.

Do not remove the published-content read endpoints from the authoring deployment until equivalent runtime endpoints exist, are wired into the frontend and have passed regression testing. The architectural goal of separating authoring from runtime does not authorize breaking the currently validated two-API implementation.

---

## 4. LOCKED REPOSITORY STRUCTURE

Preserve paths and filename letter-case on GitHub Pages.

```text
/
├── index.html
├── student.html
├── admin.html
├── teacher.html
├── parent.html
├── assets/
│   ├── css/
│   ├── js/
│   ├── fonts/
│   ├── components/
│   ├── images/
│   ├── sounds/
│   └── data/
├── chapters/
├── solutions/
├── tests/
├── notes/
├── apps-script/
├── docs/
└── patches/                 # only when a release explicitly includes one
```

Empty or placeholder directories/pages may remain for forward compatibility. Do not delete Teacher or Parent portal files merely because their current feature set is smaller than the Student/Admin portals.

### Central frontend configuration

- Runtime endpoint and portal configuration: `/assets/js/config.js`
- Authoring/published-content endpoint: `/assets/js/assessment-config.js`
- Do not scatter deployment URLs across feature pages.
- `BASE_URL`, login path and filename case must match the deployed repository.

### Static page access declaration

Static feature pages continue to load the existing page loader/access guard and declare `PUBLIC` or `PREMIUM` access. Preserve this mechanism while static fallbacks exist.

---

## 5. THREE-WORKBOOK DATA ARCHITECTURE

The three workbooks have different responsibilities and must never be merged casually.

### 5.1 `WTC_CONTENT_ENGINE` — runtime identity, catalogue and evidence

Core sheets:

- `STUDENT_MASTER`
- `TEACHER_MASTER`
- `ADMIN_MASTER`
- `SUBJECT_MASTER`
- `CHAPTER_MASTER`
- `CHAPTER_LIST`
- `ACCESS_LOGS`
- `TEST_RESULTS`
- `PROGRESS_TRACKER`
- `PARENT_ACCESS`
- `GAMIFICATION_DATA`

MCQ personalization/evidence sheets:

- `MCQ_ATTEMPTS`
- `MCQ_ATTEMPT_DETAILS`
- `STUDENT_SKILL_REPORT`

Runtime system sheets:

- `SYSTEM_INFO`
- `MIGRATION_LOG`

`CHAPTER_LIST` is the current chapter routing/fallback map. Its supported feature URL fields are:

- `lessonUrl`
- `notesUrl`
- `mcqUrl`
- `worksheetUrl`
- `answerWritingUrl`
- `videoUrl`
- `revisionUrl`
- `solutionUrl`
- `status`
- `updatedAt`

### 5.2 `WTC_FEATURE_ENGINE` — reusable feature policy and UI

Required sheets:

- `FEATURE_METADATA`
- `FEATURE_UI`
- `FEATURE_RULES`
- `SYSTEM_INFO`
- `MIGRATION_LOG`

It controls reusable feature identity, engine path, access level, enabled/visible state, login requirement, routing mode, progress/resume/logging, display order, UI labels/icons, XP, level/subscription rules, limits, coming-soon state and status.

### 5.3 `WTC_AI_CONTENT_ENGINE` — authoring and published dynamic content

Required authoring/content sheets:

- `AI_INPUT_QUEUE`
- `OCR_RAW_TEXT`
- `CHAPTER_METADATA`
- `LESSON_ENGINE`
- `MCQ_ENGINE`
- `MCQ_TEST_ENGINE`
- `MCQ_TEST_QUESTION_MAP`
- `SOLUTION_ENGINE`
- `WORKSHEET_ENGINE`
- `FEATURE_MAP`
- `REVIEW_AND_PUBLISH`

This workbook owns extraction, structured content, review/publish state and the IDs used to expose published dynamic features.

### Data safety

- Setup and migrations must be idempotent and non-destructive.
- Create only missing sheets, columns, system rows or seed IDs.
- Never clear or delete populated sheets during an upgrade.
- Never run a legacy setup function that calls `clear()` on a populated production workbook.
- Back up a workbook before schema work.
- Re-running a safe setup may add missing structure but must not duplicate or erase content.
- Schema changes require an explicit migration and regression test.

---

## 6. APPS SCRIPT BACKEND ARCHITECTURE

### 6.1 Runtime project

The runtime Apps Script project is attached to `WTC_CONTENT_ENGINE`. Preserve these modular responsibilities:

| Module | Locked responsibility |
|---|---|
| `Code.gs` | Web entry points and legacy-compatible core actions |
| `constants.gs` | Central workbook keys, Script Property names, timezone and system constants |
| `version.gs` | Module/API/platform version registry |
| `workbook_repository.gs` | Workbook resolution and read access |
| `runtime_api.gs` | Subjects, chapters, chapter features and feature-registry reads |
| `api_router.gs` | Single action map and versioned response envelope |
| `feature_engine.gs` | Feature workbook setup, registry and cache behaviour |
| `mcq.gs` | MCQ attempts, question evidence, progress, skill report and gamification |
| `dependency_manager.gs` | Module readiness/dependency reporting |
| `migration_manager.gs` | Safe, recorded, idempotent runtime migrations |
| `health_check.gs` | Read-only health report with short cache |

New backend work should go into the correct module. Do not keep expanding legacy `Code.gs` with unrelated feature logic. Existing compatible functions may remain there until a separately approved migration.

### Runtime Script Properties

- `WTC_FEATURE_ENGINE_ID` — required for the Feature workbook
- `WTC_AI_CONTENT_ENGINE_ID` — optional runtime health/reference only when the deployed modular runtime uses it

The active spreadsheet is `WTC_CONTENT_ENGINE`. Do not hardcode workbook IDs inside modules.

### Runtime API compatibility

Preserve existing action names used by the frontend, including:

- authentication/profile: `login`, `signupStudent`, `updateStudentProfile`
- catalogue: `getSubjects`, `getChapters`, `getChapterFeatures`
- feature registry: `getFeatureRegistry`, `refreshFeatureRegistryCache`
- access/progress: `logAccess`, `getStudentProgress`, MCQ progress/report actions
- admin: `adminDashboard`, `adminGetSubjects`, `adminSaveSubject`, `adminGetChapters`, `adminSaveChapter`, `adminGetChapterFeatures`, `adminSaveChapterFeatures`
- evidence: `saveStaticMCQResult` and the current dynamic MCQ result action
- operations: `healthCheck`, `getSystemVersion`, `getMigrationStatus`, `getDependencyStatus`

Do not rename or remove an action without a versioned compatibility bridge.

### 6.2 Authoring/published-content project

The separate Apps Script project bound to `WTC_AI_CONTENT_ENGINE` owns:

- upload/input queue
- OCR/raw extraction storage
- metadata parsing
- AI/static content generation/import
- Draft review and publishing
- published feature map
- published Lesson, Solution, MCQ and Worksheet read actions currently used by students

If unbound, it may use `WTC_AI_SPREADSHEET_ID`. Its deployed URL stays only in `assessment-config.js`.

### Operational rules

- Use the existing deployment and publish a new version only when backend code changes.
- Frontend-only work does not require Apps Script setup or redeployment.
- Content-only work does not require runtime backend replacement.
- Health checks are read-only. Runtime health requires Content + Feature; authoring health is reported separately.
- Runtime migrations must be recorded in `MIGRATION_LOG` and safe to rerun.

---

## 7. AUTHENTICATION, ROLES AND ACCESS CONTROL

Supported portal roles:

- Student
- Teacher
- Admin
- Parent

### General rules

- Unauthenticated protected-page visitors are redirected to Login.
- Inactive users are logged out/blocked.
- Role-protected portal pages require the correct role.
- Client-side guards provide navigation/UI protection; sensitive backend actions must also validate authorization when server-side authorization is introduced or strengthened.
- Do not bypass guards to make a feature appear.

### Student access types

- `WTC_STUDENT` or equivalent full-access student: may use enabled features allowed by policy.
- `GENERAL_STUDENT`: may access public areas and public Solution content; premium features remain blocked.

Feature access is governed by `FEATURE_METADATA`/`FEATURE_RULES`, including `PUBLIC` or `PREMIUM`, login requirement, enabled/visible/status, coming-soon and subscription rules.

For a blocked premium feature, preserve the branded Full Access message/contact flow. Do not expose premium content merely because its static URL is known.

---

## 8. SUBJECT, CHAPTER AND FEATURE CATALOGUE

The Student portal loads subjects and chapters dynamically from the logged-in student profile:

- Board
- Class
- Medium
- Subject
- Chapter

The normal flow is:

```text
Login → Student Home → Subjects → Chapters → Features → Dynamic content or static fallback
```

Do not open students directly into a hardcoded chapter as the normal portal flow.

### Admin managers

Preserve the Admin capabilities that write to the managed catalogue:

- Subject Manager → `SUBJECT_MASTER`
- Chapter Manager → `CHAPTER_MASTER`
- Feature URL Manager → `CHAPTER_LIST`
- AI/Static Content Manager → `WTC_AI_CONTENT_ENGINE`
- Dashboard/analytics → runtime data

Admin saves must upsert by stable ID, not create uncontrolled duplicates.

---

## 9. FEATURE ENGINE AND ROUTING LOCK

Use stable string feature IDs:

- `LESSON`
- `SOLUTION`
- `NOTES`
- `MCQ`
- `WORKSHEET`
- `ANSWER_WRITING`
- `VIDEO`
- `REVISION`
- `DIGITAL_LAB`
- `ACTIVITY`

### Routing priority

1. Existing in-portal dynamic content handler
2. Reusable dynamic `enginePath` with chapter/content parameters
3. Existing chapter-specific static URL fallback

Never reverse this priority.

### Compatibility rule

Keep `CHAPTER_LIST` for current routing/fallback while `FEATURE_METADATA`, `FEATURE_UI` and `FEATURE_RULES` control reusable behaviour. A chapter feature may be visible only when it has an active published dynamic ID or a valid fallback URL and its feature policy allows it.

Do not upload a static page merely to make an already published dynamic feature work. Static pages are required only when the chapter still depends on the fallback route.

---

## 10. STATIC IMPORT, AUTHORING AND PUBLISHING LOCK

### Supported source formats

The importer must preserve compatibility with:

- modern `window.WTC_STATIC_MCQ`
- legacy `BANK` + `TESTS`
- Solution Engine `.q-card`
- alternate `.q-title`, `.solution-card` and `.question-card` solution layouts

### Locked content preservation

Preserve:

- topic and full-length test definitions
- test IDs and question order
- `sourceQuestionId`, `sortOrder`, `topic` and difficulty
- options, correct answer and explanation
- structured HTML, diagrams, mathematics and chemistry
- `finalAnswerHTML` and `gujaratiFinalHTML`
- `contentHash` and source page reference
- Gujarati metadata and content

### Safe import workflow

1. Load/upload the source in Admin.
2. Analyze before writing.
3. Verify detected format and counts.
4. Confirm Board, Class, Medium, Subject ID and Chapter ID.
5. For inferred Solution IDs, require explicit admin confirmation of the existing Chapter ID.
6. Import as `Draft`.
7. Review rows in the authoring workbook.
8. Correct metadata/content if needed.
9. Approve and Publish the reviewed upload batch.
10. Confirm `FEATURE_MAP` and the main catalogue chapter mapping.
11. Test with the correct student type.

### Duplicate and removal behaviour

- Upsert by stable IDs/content hashes.
- An identical re-import must be duplicate-safe.
- Archive removed/replaced rows; do not delete historical content silently.
- Student read APIs expose only Published/Active content.
- Draft rows are never student-visible.
- Static source pages remain unchanged during import.

---

## 11. DYNAMIC MCQ, RESULTS AND PERSONALIZATION LOCK

Dynamic MCQ uses:

- `MCQ_ENGINE` for questions
- `MCQ_TEST_ENGINE` for topic/full-length test definitions
- `MCQ_TEST_QUESTION_MAP` for ordered membership
- stable `testId` and `mcqId` identifiers

Student evidence is stored in the runtime workbook:

- summary result
- attempt and retry number
- student/test/chapter identity
- score, percentage and duration
- per-question selected/correct option
- correct/wrong/unanswered status
- topic, difficulty and time evidence
- progress, topic skill report and gamification

### Locked MCQ behaviour

- Multiple topic and full-length tests are supported.
- Do not repeat a question within one test unless explicitly configured.
- One-question-at-a-time mobile test UX.
- Timer, answered count, palette, previous/next and clear answer.
- Automatic student-and-test-specific resume.
- Branded confirmations for zero, partial and complete answer states.
- Result review shows correct/wrong/unanswered and explanations.
- Submission updates personalized Progress.
- Statistics are chapter/test specific.
- Bottom/side navigation hides only during an active test.
- Exit Test and timer remain accessible.
- Navigation returns on hub, result and exit.
- Scoring/backend schemas must not change during a frontend-only release.

### Progress dashboard

Preserve:

- overall progress
- attempts
- best score
- completed tests
- XP and level
- topic accuracy
- personal recommendations
- recent history
- student-specific isolation

---

## 12. SOLUTION, LESSON AND WORKSHEET CONTENT LOCK

### Typography and notation

- Educational English content uses the self-hosted Noto Serif textbook-style font.
- Gujarati educational content uses self-hosted Noto Serif Gujarati.
- Portal controls/navigation retain the UI font.
- Automatic language detection selects the content font.
- MathJax with `mhchem` renders mathematics and chemistry.
- Dynamic content is re-typeset after rendering.

### Solution behaviour

- Show complete question text.
- Keep answers collapsed initially.
- Toggle on question tap/click.
- Allow only one answer open at a time.
- Separate question instruction from the answer body.
- Format sequential `(a)` through `(h)` parts as readable individual rows.
- Never treat `(aq)`, `(s)`, `(g)` or `(l)` as multipart markers.
- Preserve diagrams and structured HTML.
- Keep cards inside the mobile viewport.
- Long equations scroll horizontally inside their content area.
- Leave bottom clearance above fixed navigation.
- Bottom navigation remains visible on Solution/Lesson/Worksheet pages.

---

## 13. VALIDATED STUDENT FRONTEND BASELINE

### v2.0

- Dynamic MCQ engine
- Multiple test definitions
- Result saving
- Personalization and Progress
- Dynamic feature routing

### v2.1

- Branded confirmations
- Zero/partial/full submission states
- Saved-test restart protection
- Chapter-specific completion/best score

### v2.2

- Self-hosted English/Gujarati textbook fonts
- Language detection
- MathJax + `mhchem`
- MCQ focus mode
- Single-open Solution accordion

### v2.2.1

- Solution mobile width/equation/bottom-spacing fix

### v2.2.2

- Structured multipart Solution question layout
- State-symbol protection

### v2.3.0

Refresh restores the same tab-scoped student route, including Home/Subjects/Progress/Profile, Chapters, Features, dynamic content, MCQ hub, active MCQ, result and practical reading position. Active MCQ state remains student/test-specific.

### v2.3.1

A branded restoration cover prevents the Home dashboard flashing before the saved route returns. Failed restoration safely falls back to Home. The user has validated this behaviour.

---

## 14. TESTED FRONTEND FILE MATRIX

Keep these cumulative tested versions together:

| File | Version |
|---|---:|
| `/student.html` | v2.3.1 |
| `/assets/js/student.js` | v2.3.1 |
| `/assets/js/student-dynamic-content.js` | v2.3.0 |
| `/assets/css/dynamic-mcq.css` | v2.2.2 |
| `/assets/fonts/` Noto Serif English/Gujarati + licences | v2.2 |

Required existing dependencies that must not be casually replaced:

- `/assets/js/config.js`
- `/assets/js/assessment-config.js`
- `/assets/js/api.js`
- `/assets/js/assessment-api.js`
- `/assets/js/feature-engine.js`
- `/assets/js/auth.js`
- `/assets/js/access-guard.js`
- `/assets/js/page-loader.js`
- `/assets/js/ui.js`
- current runtime Apps Script modules
- current authoring Apps Script

The frontend version and backend module versions are independent. Do not label a backend as v2.3.1 merely because the Student portal is v2.3.1.

---

## 15. RELEASE AND CHANGE-SCOPE RULES

Before any change, classify it:

| Change type | Normal required action |
|---|---|
| Frontend-only | Replace named GitHub files; no setup, Sheet change, re-import or Apps Script deployment |
| Runtime backend | Back up code/data, replace named runtime modules, run only approved safe migration/setup, deploy runtime version |
| Authoring backend | Back up authoring script/data, replace named authoring module, run only safe setup, deploy authoring version |
| Content-only | Draft/review/publish; no frontend/backend replacement unless a renderer/schema changes |
| Schema migration | Explicit migration plan, backup, idempotent migration and regression test |

Every release/hotfix must state:

- semantic version
- cumulative or incremental
- exact files to add/replace
- files that must not change
- backend/setup/deployment requirements
- content re-import requirement
- rollback steps
- test results and required live checks

Prefer a cumulative production package for stable promotion. Historical incremental ZIPs are patches, not the production source of truth.

---

## 16. CONTROLLED STABLE PROMOTION

1. Freeze the validated development build.
2. Create one cumulative package from the exact tested files.
3. Include font licences, installation guide, test report, manifest and checksum.
4. Back up stable files and record the current commit/tag.
5. Verify stable configuration and deployment endpoints separately from development.
6. Transfer files without editing during upload.
7. Wait for GitHub Pages publishing.
8. Test stable with a controlled student account.
9. Verify English and Gujarati MCQ.
10. Verify Gujarati chemistry Solution with long equations.
11. Verify multipart Solution layout.
12. Verify access restrictions for full/general students.
13. Verify result saving, Progress and personalization.
14. Verify active-test refresh restoration.
15. Verify Solution/Features/Chapters refresh with no dashboard flash.
16. Mark production only after all smoke tests pass.

If a stable smoke test fails, restore the backup and diagnose in development.

---

## 17. REQUIRED REGRESSION CHECKLIST

### Identity and access

- Student, Admin, Teacher and Parent role routing
- unauthenticated redirect
- inactive-account block
- `GENERAL_STUDENT` public/premium restriction
- full-access student behaviour

### Catalogue and routing

- profile-filtered Subjects
- Chapters
- Feature buttons
- dynamic-first routing
- static fallback
- Admin subject/chapter/feature upserts

### Content

- English typography
- Gujarati typography
- mathematics
- chemistry and state symbols
- diagrams
- Solution accordion
- multipart question layout
- mobile width/equation scroll/bottom spacing

### MCQ and evidence

- hub and all test IDs
- focus mode
- timer/resume/palette
- branded submit states
- score and review
- result save
- question evidence
- retries
- Progress, recommendations and gamification

### Refresh

- Home/Subjects/Progress/Profile
- Chapters
- Features
- Solution/Lesson/Worksheet
- MCQ hub
- active MCQ with answers/time/question
- result/review
- no dashboard flash
- new tab starts at Home

### Operations

- runtime health/dependencies/migrations
- authoring Draft not visible
- Published content visible
- duplicate-safe re-import
- existing workbook data preserved
- development/stable configuration isolation

---

## 18. FUTURE CONTENT EXPANSION

After the validated baseline is safely deployed:

1. Add one Gujarati chapter.
2. Add one English chapter.
3. Add one chemistry chapter containing equations.
4. Test both MCQ and Solution for each.
5. Verify fonts, notation, mapping, access and Progress.
6. Continue chapter-by-chapter only after representative cases pass.

Do not bulk-publish before the first representative chapters are validated.

---

## 19. INSTRUCTIONS FOR FUTURE CHATGPT WORK

When assisting with this project:

- Read this file first and treat it as authoritative.
- Inspect the newest supplied project files before a broad patch.
- Do not rely only on a historical ZIP filename or earlier conversation.
- Ask when stable/development target or deployment state is genuinely ambiguous.
- Preserve validated UI and architecture unless the user requests a change.
- Keep changes within the named project and scope.
- Use reusable dynamic engines and preserve static compatibility.
- Never expose or invent credentials, Sheet IDs or deployment URLs.
- Never replace configuration files unnecessarily.
- Never request setup/redeployment for a frontend-only patch.
- Never request content re-import for a renderer-only patch.
- Never run destructive setup on populated workbooks.
- State exact replacement/addition paths and exact files not to change.
- Preserve user changes and unrelated files.
- Test development before stable promotion.
- Provide rollback instructions.
- Identify assumptions and unresolved deployment facts explicitly.
- Do not describe a proposed future architecture as already deployed.

---

## 20. COMPLETE LOCK CONFIRMATION

The following are now locked together:

- strict project separation
- separate development and stable environments
- GitHub Pages frontend
- three-workbook architecture
- separate runtime and authoring Apps Script deployments
- current two-API frontend contract
- modular runtime backend and safe migrations
- role/student-type access policy
- managed subject/chapter/feature catalogue
- dynamic-first/static-fallback routing
- Draft → Review → Publish workflow
- duplicate-safe static importer compatibility
- dynamic MCQ evidence and personalized Progress
- textbook typography, MathJax/mhchem and mobile Solution rules
- refresh restoration and no-dashboard-flash behaviour
- cumulative v2.3.1 tested frontend matrix
- controlled release, rollback and regression process

This is a **complete architecture lock for the validated system as it exists now**. It does not claim that unimplemented future modules are already deployed, and it does not authorize changing live configuration or data.
