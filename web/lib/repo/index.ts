/* 資料存取介面。說明見 README.md。 */
export * from "./types";
export { createFirestoreRepo, type FirestoreRepoOptions } from "./firestore";
export { createMemoryRepo, demoRecords, memoryStore, type MemoryStore } from "./memory";
export { emptyRecords, splitD, toCoreD } from "./toCoreD";
export { deriveStudentLinks, type StudentLinks } from "./derive";
export { visible, writeDenied } from "./access";
export { scopeOf } from "./scope";
