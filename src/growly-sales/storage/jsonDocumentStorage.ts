import { getStorageBackend } from '../config/storageBackend.js';
import {
  getDaily30CloudRunStatePath,
  getDaily30CollectionSchedulePath,
  getExternalCandidatesJsonPath,
} from '../config/paths.js';
import {
  DAILY30_CLOUD_RUN_STATE_JSON,
  DAILY30_COLLECTION_SCHEDULE_JSON,
  EXTERNAL_CANDIDATES_JSON,
} from './jsonDocumentNames.js';
import {
  gcsBackupBeforeWrite,
  gcsJsonExists,
  gcsReadJson,
  gcsWriteJson,
} from './gcsJsonStorage.js';
import {
  localBackupBeforeWrite,
  localJsonExists,
  localReadJson,
  localWriteJson,
} from './localJsonStorage.js';

export type JsonDocumentName =
  | typeof EXTERNAL_CANDIDATES_JSON
  | typeof DAILY30_CLOUD_RUN_STATE_JSON
  | typeof DAILY30_COLLECTION_SCHEDULE_JSON;

function resolveLocalPath(logicalName: JsonDocumentName): string {
  if (logicalName === EXTERNAL_CANDIDATES_JSON) return getExternalCandidatesJsonPath();
  if (logicalName === DAILY30_CLOUD_RUN_STATE_JSON) return getDaily30CloudRunStatePath();
  if (logicalName === DAILY30_COLLECTION_SCHEDULE_JSON) return getDaily30CollectionSchedulePath();
  throw new Error(`未知の JSON ドキュメント: ${logicalName}`);
}

export async function jsonDocumentExists(logicalName: JsonDocumentName): Promise<boolean> {
  if (getStorageBackend() === 'gcs') return gcsJsonExists(logicalName);
  return localJsonExists(resolveLocalPath(logicalName));
}

export async function readJsonDocument(logicalName: JsonDocumentName): Promise<string | null> {
  if (getStorageBackend() === 'gcs') return gcsReadJson(logicalName);
  return localReadJson(resolveLocalPath(logicalName));
}

export async function writeJsonDocument(
  logicalName: JsonDocumentName,
  jsonText: string
): Promise<void> {
  if (getStorageBackend() === 'gcs') {
    await gcsWriteJson(logicalName, jsonText);
    return;
  }
  await localWriteJson(resolveLocalPath(logicalName), jsonText);
}

export async function backupJsonDocumentBeforeWrite(
  logicalName: JsonDocumentName
): Promise<string | null> {
  if (getStorageBackend() === 'gcs') return gcsBackupBeforeWrite(logicalName);
  return localBackupBeforeWrite(resolveLocalPath(logicalName));
}
