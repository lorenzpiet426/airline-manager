// Minimal reader for .xlsx spreadsheets (official aircraft registers): unzips with the system's `unzip` tool and
// returns each sheet as rows of text cells. Enough for simple tables; no formulas or formatting.
import { execFileSync } from 'node:child_process';

const unzip = (file: string, entry: string) => {
  try {
    return execFileSync('unzip', ['-p', file, entry], { maxBuffer: 256 * 1024 * 1024 }).toString('utf8');
  } catch {
    return '';
  }
};
const decode = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

export function readSheet(file: string, sheet = 1): string[][] {
  const strings = [...unzip(file, 'xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    decode([...m[1]!.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')),
  );
  const xml = unzip(file, `xl/worksheets/sheet${sheet}.xml`);
  return [...xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((row) =>
    [...row[1]!.matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)].map(([, attrs, body = '']) => {
      const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      const inline = body.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1];
      if (/t="s"/.test(attrs!) && v !== undefined) return strings[Number(v)] ?? '';
      return decode(inline ?? v ?? '');
    }),
  );
}

export function sheetCount(file: string): number {
  return (unzip(file, 'xl/workbook.xml').match(/<sheet /g) ?? []).length;
}
