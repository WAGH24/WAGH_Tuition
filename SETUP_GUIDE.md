# WAGH Tuition Classes — Feature Engine v1.0
## Third Workbook Edition

This patch uses the locked three-workbook architecture:

1. **WTC_CONTENT_ENGINE** — students, chapters, current routing, progress, results.
2. **WTC_AI_CONTENT_ENGINE** — upload, OCR, AI generation, review, publishing.
3. **WTC_FEATURE_ENGINE** — global feature behaviour, UI, rules and reusable engine routing.

---

## Files included

```text
apps-script/feature_engine.gs       NEW separate Apps Script module
assets/js/feature-engine.js         NEW frontend Feature Engine
assets/js/api.js                    UPDATED complete file
assets/js/student.js                UPDATED complete file
student.html                        UPDATED complete file
patches/apicode_PATCH.txt           Small manual backend routing patch
```

---

# Part A — Prepare WTC_FEATURE_ENGINE workbook

1. Create/open the third Google Spreadsheet named exactly:

```text
WTC_FEATURE_ENGINE
```

2. Copy its spreadsheet ID from the URL:

```text
https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
```

3. Open the existing WAGH Tuition Classes Apps Script project.

4. Go to:

```text
Project Settings → Script Properties
```

5. Add:

```text
Property: WTC_FEATURE_ENGINE_ID
Value:    your copied spreadsheet ID
```

---

# Part B — Add the separate backend module

1. In Apps Script, create a new script file:

```text
feature_engine.gs
```

2. Paste the complete code from:

```text
apps-script/feature_engine.gs
```

3. Save.

4. From the function dropdown, run only:

```text
setupWTCFeatureEngineWorkbook
```

5. Approve permission if Google asks.

This safe setup function:

- creates only missing sheets;
- adds only missing headers;
- seeds only missing feature IDs;
- never clears or deletes existing data.

Expected sheets:

```text
FEATURE_METADATA
FEATURE_UI
FEATURE_RULES
```

**Do not run `setupWTCContentEngine()`.**

---

# Part C — Register API actions

Follow:

```text
patches/apicode_PATCH.txt
```

Add these to the existing `doPost()` action map:

```text
getFeatureRegistry
refreshFeatureRegistryCache
```

Then deploy a new Apps Script version:

```text
Deploy → Manage deployments → Edit → New version → Deploy
```

---

# Part D — Upload GitHub files

Replace/upload these files:

```text
assets/js/api.js
assets/js/student.js
student.html
```

Add this new file:

```text
assets/js/feature-engine.js
```

Do not remove:

```text
assets/js/access-guard.js
assets/js/student-dynamic-content.js
existing static MCQ and Solution pages
```

---

# Routing behaviour

```text
Dynamic content handler
        ↓ if unavailable
Reusable enginePath with chapterId/contentId
        ↓ if unavailable
Existing static URL fallback
```

This means all current static pages remain operational while dynamic engines are introduced gradually.

---

# Initial test checklist

## 1. API
Open the student portal and confirm subjects/chapters still load.

## 2. WTC_STUDENT
- MCQ opens.
- Solution opens.
- Existing static URLs still work.

## 3. GENERAL_STUDENT
- Solution opens.
- MCQ and other PREMIUM features show the contact popup.

## 4. Metadata control
In `FEATURE_METADATA`, temporarily set:

```text
MCQ → enabled = FALSE
```

Then run `refreshFeatureRegistryCache` from Apps Script or wait 5 minutes.
MCQ should show “This feature is currently disabled.”

Restore:

```text
MCQ → enabled = TRUE
```

## 5. Dynamic-first migration
Current feature records without `contentId` continue using static URLs.
Future dynamic records containing `contentId` use `enginePath` first.

---

# Locked development rule

All future feature development must target reusable API-driven engines.
Chapter-specific static pages are temporary fallback routes only.
