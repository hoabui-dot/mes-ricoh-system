import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const APP_ROOTS = process.argv.slice(2).length > 0
  ? process.argv.slice(2)
  : ['services/mes-console/src', 'services/kiosk-operator-ui/src', 'portal/src', 'services/wms-console/src'];
const FORBIDDEN_LITERALS = [
  'WorkCenter filter',
  'Shift',
  'Employees',
  'Start date',
  'Period',
  'Days of week',
  'Assign Schedule',
  'Bulk Result',
  'No bulk assignment run yet.',
  'Headcount',
  'Sẽ tạo lịch cho',
];

const IGNORE_TEXT = /^[\s()[\]{}.,:;|/+*\-=<>#%0-9A-Z_]+$/;
const IGNORE_ATTRS = new Set(['className', 'to', 'href', 'type', 'role', 'aria-label', 'title', 'placeholder']);

interface Finding {
  file: string;
  line: number;
  text: string;
}

function listFiles(root: string): string[] {
  try {
    return execFileSync('rg', ['--files', root, '-g', '*.tsx', '-g', '*.jsx'], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean);
  } catch {
    return [];
  }
}

function hasExemption(source: string, pos: number): boolean {
  const before = source.slice(Math.max(0, pos - 180), pos);
  return /i18n-exempt:\s*\S+/.test(before);
}

function lineOf(sourceFile: ts.SourceFile, pos: number): number {
  return sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
}

function scanFile(file: string): Finding[] {
  const source = readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const findings: Finding[] = [];

  function addIfBad(text: string, pos: number) {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized || IGNORE_TEXT.test(normalized) || hasExemption(source, pos)) return;
    if (FORBIDDEN_LITERALS.some((literal) => normalized.includes(literal))) {
      findings.push({ file, line: lineOf(sourceFile, pos), text: normalized });
    }
  }

  function visit(node: ts.Node) {
    if (ts.isJsxText(node)) {
      addIfBad(node.getText(sourceFile), node.getStart(sourceFile));
    }
    if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer) && !IGNORE_ATTRS.has(node.name.text)) {
      addIfBad(node.initializer.text, node.initializer.getStart(sourceFile));
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return findings;
}

const findings = APP_ROOTS.flatMap((root) => listFiles(join(process.cwd(), root)).flatMap(scanFile));

if (findings.length > 0) {
  console.error('i18n static coverage check failed. Move these strings into i18n bundles or add an explicit i18n-exempt comment:');
  for (const finding of findings) {
    console.error(`${finding.file}:${finding.line} ${finding.text}`);
  }
  process.exit(1);
}

console.info('i18n static coverage check passed');
