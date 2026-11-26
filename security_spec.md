# OBREN Firestore Security Specification (Phase 0)

## 1. Data Invariants
1. A private `users/{userId}` document can only be read or modified by the authenticated owner whose `uid == userId` and `email_verified == true`.
2. A `publicProfiles/{userId}` document contains zero PII (no email, phone, or private credentials) and can only be written by `userId`.
3. Every `pyqBanks`, `pyqQuestions`, `testAttempts`, `bookmarks`, `plannerTasks`, and `studySessions` document requires `ownerId == request.auth.uid` on creation and forbids changing `ownerId` or `createdAt` on update.
4. `studyFolders`, `studyNotes`, and `studyGroups` enforce membership arrays (`memberIds`, strictly bounded `<= 50`) so `allow list` verifies `request.auth.uid in resource.data.memberIds` without `get()`/`exists()` inside `allow list`.
5. `studyGroups/{groupId}/messages/{messageId}` verifies group membership via `get()` on `studyGroups/{groupId}` during `create`/`get` and checks `request.auth.uid in resource.data.memberIds` on `list`.
6. `duels/{duelId}` enforces strict state transitions (`WAITING` -> `ACTIVE` -> `FINISHED`), locking terminal `FINISHED` duels from further mutations.

## 2. Adversarial "Dirty Dozen" Payloads Blocked
1. Spoofed `ownerId` during `create` on `testAttempts` -> `PERMISSION_DENIED`.
2. Unverified email user attempting write -> `PERMISSION_DENIED`.
3. Shadow field injection (`isAdmin: true`) on `users/{userId}` -> `PERMISSION_DENIED` (`hasOnly` rejection).
4. Reading another user's `users/{otherUid}` PII document -> `PERMISSION_DENIED`.
5. Modifying immutable `createdAt` or `ownerId` on `bookmarks` update -> `PERMISSION_DENIED`.
6. Mutating a `FINISHED` `duels/{duelId}` winner or score -> `PERMISSION_DENIED`.
7. Injecting an oversized (> 128 chars) or invalid-character document ID -> `PERMISSION_DENIED` (`isValidId`).
8. Unbounded array injection (> 50 UIDs) in `studyGroups.memberIds` -> `PERMISSION_DENIED`.
9. Client-forged `createdAt` timestamp not equal to `request.time` -> `PERMISSION_DENIED`.
10. Non-member listing private `studyNotes` -> `PERMISSION_DENIED`.
11. Deleting another user's `pyqQuestions` -> `PERMISSION_DENIED`.
12. Hostile 1MB string poisoning in `displayName` or `topic` -> `PERMISSION_DENIED`.
13. Reading, modifying, or deleting another student's `generatedPapers` or `savedAiQuestions` -> `PERMISSION_DENIED`.
14. Non-admin updating `aiSettings/global` or querying another user's `aiGenerationLogs` -> `PERMISSION_DENIED`.
15. Injecting oversized `diagramSvg` (>20KB) or invalid `examTarget`/`aiFormat` enum into `savedAiQuestions` or `generatedPapers` -> `PERMISSION_DENIED`.
16. Mutating `ownerId` or `createdAt` during `generatedPapers` update -> `PERMISSION_DENIED`.

