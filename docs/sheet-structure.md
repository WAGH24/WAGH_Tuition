STUDENT_MASTER, TEACHER_MASTER, ADMIN_MASTER, SUBJECT_MASTER, CHAPTER_MASTER, CHAPTER_LIST, ACCESS_LOGS, TEST_RESULTS, PROGRESS_TRACKER, PARENT_ACCESS, GAMIFICATION_DATA


## PROFILE_CHANGE_REQUESTS

Additive runtime sheet for Student Profile Change Approval System v1.0.

Columns:

`requestId, studentId, studentName, currentMobile, requestedName, requestedMobile, currentBoard, requestedBoard, currentClassName, requestedClassName, currentMedium, requestedMedium, reason, status, requestedAt, reviewedBy, reviewedAt, adminRemarks, appliedAt, updatedAt`

Status values:

- `PENDING`
- `APPLIED`
- `REJECTED`
- `CANCELLED`

The safe `installProfileChangeApprovalSystem()` function creates only this missing sheet/columns and never clears populated data.
