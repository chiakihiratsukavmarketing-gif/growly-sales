import {
  assertGcsStorageConfigured,
  buildGcsObjectPath,
  getGcsBucketName,
} from '../config/storageBackend.js';

let storageClient: import('@google-cloud/storage').Storage | null = null;

function backupObjectPath(logicalFileName: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const base = buildGcsObjectPath(logicalFileName);
  return `${base}.${stamp}.bak`;
}

async function getGcsClient(): Promise<import('@google-cloud/storage').Storage> {
  assertGcsStorageConfigured();
  if (!storageClient) {
    const { Storage } = await import('@google-cloud/storage');
    storageClient = new Storage();
  }
  return storageClient;
}

function objectRef(logicalFileName: string) {
  const bucketName = getGcsBucketName();
  if (!bucketName) {
    throw new Error('GCS bucket is not configured');
  }
  const objectPath = buildGcsObjectPath(logicalFileName);
  return { bucketName, objectPath };
}

export async function gcsJsonExists(logicalFileName: string): Promise<boolean> {
  const { bucketName, objectPath } = objectRef(logicalFileName);
  const client = await getGcsClient();
  const [exists] = await client.bucket(bucketName).file(objectPath).exists();
  return exists;
}

export async function gcsReadJson(logicalFileName: string): Promise<string | null> {
  const { bucketName, objectPath } = objectRef(logicalFileName);
  const client = await getGcsClient();
  const file = client.bucket(bucketName).file(objectPath);
  if (!(await gcsJsonExists(logicalFileName))) return null;
  const [buf] = await file.download();
  const text = buf.toString('utf-8').trim();
  return text || null;
}

export interface GcsObjectMetadata {
  generation: string;
  md5Hash: string | null;
  size: number;
  updated: string | null;
}

/** 読み取り専用 — apply 前の generation / サイズ確認用 */
export async function gcsGetObjectMetadata(
  logicalFileName: string
): Promise<GcsObjectMetadata | null> {
  const { bucketName, objectPath } = objectRef(logicalFileName);
  const client = await getGcsClient();
  const file = client.bucket(bucketName).file(objectPath);
  if (!(await gcsJsonExists(logicalFileName))) return null;
  const [meta] = await file.getMetadata();
  return {
    generation: String(meta.generation ?? ''),
    md5Hash: meta.md5Hash ?? null,
    size: Number(meta.size ?? 0),
    updated: meta.updated ?? null,
  };
}

export async function gcsBackupBeforeWrite(logicalFileName: string): Promise<string | null> {
  const { bucketName, objectPath } = objectRef(logicalFileName);
  if (!(await gcsJsonExists(logicalFileName))) return null;
  const dest = backupObjectPath(logicalFileName);
  const client = await getGcsClient();
  await client.bucket(bucketName).file(objectPath).copy(client.bucket(bucketName).file(dest));
  return dest;
}

/** バックアップオブジェクトのメタデータ（相対 object path） */
export async function gcsGetObjectMetadataAtPath(
  objectPath: string
): Promise<GcsObjectMetadata | null> {
  const bucketName = getGcsBucketName();
  if (!bucketName) throw new Error('GCS bucket is not configured');
  const client = await getGcsClient();
  const file = client.bucket(bucketName).file(objectPath);
  const [exists] = await file.exists();
  if (!exists) return null;
  const [meta] = await file.getMetadata();
  return {
    generation: String(meta.generation ?? ''),
    md5Hash: meta.md5Hash ?? null,
    size: Number(meta.size ?? 0),
    updated: meta.updated ?? null,
  };
}

export async function gcsReadJsonAtPath(objectPath: string): Promise<string | null> {
  const bucketName = getGcsBucketName();
  if (!bucketName) throw new Error('GCS bucket is not configured');
  const client = await getGcsClient();
  const file = client.bucket(bucketName).file(objectPath);
  const [exists] = await file.exists();
  if (!exists) return null;
  const [buf] = await file.download();
  const text = buf.toString('utf-8').trim();
  return text || null;
}

export async function gcsWriteJsonIfGenerationMatch(
  logicalFileName: string,
  jsonText: string,
  ifGenerationMatch: string
): Promise<void> {
  const { bucketName, objectPath } = objectRef(logicalFileName);
  await gcsWriteJsonIfGenerationMatchAtPath(objectPath, jsonText, ifGenerationMatch, bucketName);
}

/** フル object path 指定（mail-operations audit 等） */
export async function gcsWriteJsonIfGenerationMatchAtPath(
  objectPath: string,
  jsonText: string,
  ifGenerationMatch: string,
  bucketName?: string
): Promise<void> {
  const bucket = bucketName ?? getGcsBucketName();
  if (!bucket) throw new Error('GCS bucket is not configured');
  const client = await getGcsClient();
  const file = client.bucket(bucket).file(objectPath);
  await file.save(jsonText, {
    contentType: 'application/json; charset=utf-8',
    preconditionOpts: { ifGenerationMatch: Number(ifGenerationMatch) },
  });
}

/** 新規 object のみ（ifGenerationMatch=0） */
export async function gcsWriteNewJsonAtPath(objectPath: string, jsonText: string): Promise<void> {
  await gcsWriteJsonIfGenerationMatchAtPath(objectPath, jsonText, '0');
}

export async function gcsCopyObjectBetweenPaths(
  sourceObjectPath: string,
  destObjectPath: string
): Promise<void> {
  const bucketName = getGcsBucketName();
  if (!bucketName) throw new Error('GCS bucket is not configured');
  const client = await getGcsClient();
  await client
    .bucket(bucketName)
    .file(sourceObjectPath)
    .copy(client.bucket(bucketName).file(destObjectPath));
}

export function isGcsPreconditionFailure(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: number; errors?: Array<{ reason?: string }> };
  if (e.code === 412) return true;
  return Boolean(e.errors?.some((item) => item.reason === 'conditionNotMet'));
}

export async function gcsWriteJson(logicalFileName: string, jsonText: string): Promise<void> {
  const { bucketName, objectPath } = objectRef(logicalFileName);
  const client = await getGcsClient();
  const file = client.bucket(bucketName).file(objectPath);
  if (await gcsJsonExists(logicalFileName)) {
    await gcsBackupBeforeWrite(logicalFileName);
  }
  await file.save(jsonText, { contentType: 'application/json; charset=utf-8' });
}

/** verify / tests: reset cached client */
export function resetGcsClientForTests(): void {
  storageClient = null;
}
