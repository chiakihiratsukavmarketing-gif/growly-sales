import type { GcsObjectMetadata } from '../storage/gcsJsonStorage.js';
import {
  gcsCopyObjectBetweenPaths,
  gcsGetObjectMetadata,
  gcsGetObjectMetadataAtPath,
  gcsReadJson,
  gcsReadJsonAtPath,
  gcsWriteJsonIfGenerationMatch,
  gcsWriteNewJsonAtPath,
} from '../storage/gcsJsonStorage.js';
import { buildGcsObjectPath } from '../config/storageBackend.js';

export interface GcsJsonStoragePort {
  readJson(logicalFileName: string): Promise<string | null>;
  getMetadata(logicalFileName: string): Promise<GcsObjectMetadata | null>;
  writeIfGenerationMatch(
    logicalFileName: string,
    jsonText: string,
    ifGenerationMatch: string
  ): Promise<void>;
  copyObject(sourceObjectPath: string, destObjectPath: string): Promise<void>;
  writeNewJsonAtPath(objectPath: string, jsonText: string): Promise<void>;
  readJsonAtPath(objectPath: string): Promise<string | null>;
  getMetadataAtPath(objectPath: string): Promise<GcsObjectMetadata | null>;
}

export function createDefaultGcsJsonStoragePort(): GcsJsonStoragePort {
  return {
    readJson: gcsReadJson,
    getMetadata: gcsGetObjectMetadata,
    writeIfGenerationMatch: gcsWriteJsonIfGenerationMatch,
    copyObject: gcsCopyObjectBetweenPaths,
    writeNewJsonAtPath: gcsWriteNewJsonAtPath,
    readJsonAtPath: gcsReadJsonAtPath,
    getMetadataAtPath: gcsGetObjectMetadataAtPath,
  };
}

/** verify / unit — 実 GCS 非接続 */
export class InMemoryGcsJsonStorage implements GcsJsonStoragePort {
  private objects = new Map<string, { text: string; generation: number }>();
  private nextGeneration = 1;

  private keyForLogical(logicalFileName: string): string {
    return buildGcsObjectPath(logicalFileName);
  }

  async readJson(logicalFileName: string): Promise<string | null> {
    return this.readJsonAtPath(this.keyForLogical(logicalFileName));
  }

  async getMetadata(logicalFileName: string): Promise<GcsObjectMetadata | null> {
    return this.getMetadataAtPath(this.keyForLogical(logicalFileName));
  }

  async writeIfGenerationMatch(
    logicalFileName: string,
    jsonText: string,
    ifGenerationMatch: string
  ): Promise<void> {
    await this.writeIfGenerationMatchAtPath(
      this.keyForLogical(logicalFileName),
      jsonText,
      ifGenerationMatch
    );
  }

  async writeIfGenerationMatchAtPath(
    objectPath: string,
    jsonText: string,
    ifGenerationMatch: string
  ): Promise<void> {
    const expected = Number(ifGenerationMatch);
    const existing = this.objects.get(objectPath);
    if (expected === 0) {
      if (existing) {
        const err = Object.assign(new Error('Precondition failed'), { code: 412 });
        throw err;
      }
    } else if (!existing || existing.generation !== expected) {
      const err = Object.assign(new Error('Precondition failed'), { code: 412 });
      throw err;
    }
    const generation = this.nextGeneration++;
    this.objects.set(objectPath, { text: jsonText, generation });
  }

  async copyObject(sourceObjectPath: string, destObjectPath: string): Promise<void> {
    const source = this.objects.get(sourceObjectPath);
    if (!source) {
      throw new Error('source object not found');
    }
    const generation = this.nextGeneration++;
    this.objects.set(destObjectPath, { text: source.text, generation });
  }

  async writeNewJsonAtPath(objectPath: string, jsonText: string): Promise<void> {
    await this.writeIfGenerationMatchAtPath(objectPath, jsonText, '0');
  }

  async readJsonAtPath(objectPath: string): Promise<string | null> {
    return this.objects.get(objectPath)?.text ?? null;
  }

  async getMetadataAtPath(objectPath: string): Promise<GcsObjectMetadata | null> {
    const obj = this.objects.get(objectPath);
    if (!obj) return null;
    return {
      generation: String(obj.generation),
      md5Hash: null,
      size: Buffer.byteLength(obj.text, 'utf-8'),
      updated: new Date().toISOString(),
    };
  }

  seedLogical(logicalFileName: string, jsonText: string, generation?: number): void {
    const path = this.keyForLogical(logicalFileName);
    const gen = generation ?? this.nextGeneration++;
    this.objects.set(path, { text: jsonText, generation: gen });
    if (gen >= this.nextGeneration) {
      this.nextGeneration = gen + 1;
    }
  }

  listObjectPaths(): string[] {
    return [...this.objects.keys()];
  }
}
