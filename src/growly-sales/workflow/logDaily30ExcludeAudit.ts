/** 除外永続化の監査ログ（secret / token / credentials は含めない） */
export function logDaily30ExcludePersistAudit(input: {
  candidateId: string;
  companyName: string;
  storageBackend: string;
  candidateCountBefore: number;
  candidateCountAfter: number;
  beforePipelineStatus: string;
  beforeImportStatus: string;
  afterPipelineStatus: string;
  afterImportStatus: string;
  persisted: boolean;
}): void {
  console.log(
    '[daily30-exclude]',
    JSON.stringify({
      candidateId: input.candidateId,
      companyName: input.companyName,
      storageBackend: input.storageBackend,
      candidateCountBefore: input.candidateCountBefore,
      candidateCountAfter: input.candidateCountAfter,
      beforePipelineStatus: input.beforePipelineStatus,
      beforeImportStatus: input.beforeImportStatus,
      afterPipelineStatus: input.afterPipelineStatus,
      afterImportStatus: input.afterImportStatus,
      persisted: input.persisted,
    })
  );
}
