import { copyFile, mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { dirname } from 'node:path';

function backupPathFor(filePath: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${filePath}.${stamp}.bak`;
}

export async function localJsonExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function localReadJson(filePath: string): Promise<string | null> {
  try {
    const raw = await readFile(filePath, 'utf-8');
    return raw.trim() ? raw : null;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

export async function localWriteJson(filePath: string, jsonText: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  if (await localJsonExists(filePath)) {
    await localBackupBeforeWrite(filePath);
  }
  await writeFile(filePath, jsonText, 'utf-8');
}

export async function localBackupBeforeWrite(filePath: string): Promise<string | null> {
  if (!(await localJsonExists(filePath))) return null;
  const backup = backupPathFor(filePath);
  await copyFile(filePath, backup);
  return backup;
}
