login, signupStudent, updateStudentProfile, getSubjects, getChapters, getChapterFeatures, getStudentProgress, logAccess, adminDashboard


## Student Profile Change Approval System v1.0

Student actions:

- `changeStudentPassword`
- `createProfileChangeRequest`
- `getMyProfileChangeRequests`
- `cancelProfileChangeRequest`

Admin actions:

- `getProfileChangeRequests`
- `approveProfileChangeRequest`
- `rejectProfileChangeRequest`

The legacy `updateStudentProfile` route remains present for compatibility but rejects direct student changes to name, mobile, board, class, medium, student type or access status.
