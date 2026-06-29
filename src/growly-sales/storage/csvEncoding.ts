import { readFile } from 'node:fs/promises';

/** Unicode replacement character — typical sign of UTF-8 misread as another encoding */
export const MOJIBAKE_REPLACEMENT_CHAR = '\uFFFD';

export const INPUT_TEXT_FIELDS = ['companyName', 'area', 'industry'] as const;

export type InputTextField = (typeof INPUT_TEXT_FIELDS)[number];

export function stripUtf8Bom(content: string): string {
  return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
}

export async function readCsvFileAsUtf8(filePath: string): Promise<string> {
  const raw = await readFile(filePath, 'utf-8');
  return stripUtf8Bom(raw);
}

export function hasMojibake(text: string): boolean {
  return text.includes(MOJIBAKE_REPLACEMENT_CHAR);
}

export function hasMojibakeInInputFields(row: {
  companyName: string;
  area: string;
  industry: string;
}): boolean {
  return INPUT_TEXT_FIELDS.some((field) => hasMojibake(row[field]));
}

export function detectInputFieldMojibake(row: {
  companyName: string;
  area: string;
  industry: string;
}): string[] {
  const warnings: string[] = [];
  for (const field of INPUT_TEXT_FIELDS) {
    if (hasMojibake(row[field])) {
      warnings.push(
        `CSV encoding warning: mojibake () detected in ${field}="${row[field]}"`
      );
    }
  }
  return warnings;
}

export function hasMojibakeInLeadTextFields(lead: {
  companyName: string;
  area: string;
  industry: string;
}): boolean {
  return hasMojibakeInInputFields(lead);
}
