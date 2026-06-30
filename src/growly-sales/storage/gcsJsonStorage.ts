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

export async function gcsBackupBeforeWrite(logicalFileName: string): Promise<string | null> {
  const { bucketName, objectPath } = objectRef(logicalFileName);
  if (!(await gcsJsonExists(logicalFileName))) return null;
  const dest = backupObjectPath(logicalFileName);
  const client = await getGcsClient();
  await client.bucket(bucketName).file(objectPath).copy(client.bucket(bucketName).file(dest));
  return dest;
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
