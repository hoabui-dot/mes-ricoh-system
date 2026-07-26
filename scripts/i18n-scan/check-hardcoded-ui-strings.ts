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
const RAW_TRANSLATION_KEY = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9_]*)+$/;

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

function resourceKeys(root: string): Set<string> {
  const keys = new Set<string>();
  let files: string[] = [];
  try {
    files = execFileSync('rg', ['--files', root, '-g', 'i18n.ts', '-g', 'i18n.tsx', '-g', 'index.ts'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    return keys;
  }
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/['"]([a-z][a-z0-9]*(?:\.[a-z][a-z0-9_]*)+)['"]\s*:/g)) keys.add(match[1]);
  }
  return keys;
}

function hasExemption(source: string, pos: number): boolean {
  const before = source.slice(Math.max(0, pos - 180), pos);
  return /i18n-exempt:\s*\S+/.test(before);
}

function lineOf(sourceFile: ts.SourceFile, pos: number): number {
  return sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
}

function scanFile(file: string, knownKeys: Set<string>): Finding[] {
  const source = readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const findings: Finding[] = [];

  function addIfBad(text: string, pos: number) {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized || hasExemption(source, pos)) return;
    if (RAW_TRANSLATION_KEY.test(normalized)) {
      findings.push({ file, line: lineOf(sourceFile, pos), text: normalized });
      return;
    }
    if (IGNORE_TEXT.test(normalized)) return;
    if (FORBIDDEN_LITERALS.some((literal) => normalized.includes(literal))) {
      findings.push({ file, line: lineOf(sourceFile, pos), text: normalized });
    }
  }

  function visit(node: ts.Node) {
    if (ts.isJsxText(node)) {
      addIfBad(node.getText(sourceFile), node.getStart(sourceFile));
    }
    if (
      ts.isJsxAttribute(node) &&
      node.initializer &&
      ts.isStringLiteral(node.initializer) &&
      !IGNORE_ATTRS.has(node.name.text) &&
      !/Key$/.test(node.name.text)
    ) {
      addIfBad(node.initializer.text, node.initializer.getStart(sourceFile));
    }
    if (ts.isCallExpression(node) && node.arguments.length > 0 && ts.isStringLiteral(node.arguments[0])) {
      const callee = node.expression.getText(sourceFile);
      const key = node.arguments[0].text;
      if ((callee === 't' || callee.endsWith('.t')) && RAW_TRANSLATION_KEY.test(key) && !knownKeys.has(key)) {
        findings.push({ file, line: lineOf(sourceFile, node.arguments[0].getStart(sourceFile)), text: `missing translation key: ${key}` });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return findings;
}

const sharedKeys = resourceKeys(join(process.cwd(), 'libs/i18n-ui-shared/src'));
const findings = APP_ROOTS.flatMap((root) => {
  const absoluteRoot = join(process.cwd(), root);
  const knownKeys = resourceKeys(absoluteRoot);
  sharedKeys.forEach((key) => knownKeys.add(key));
  return listFiles(absoluteRoot).flatMap((file) => scanFile(file, knownKeys));
});

if (findings.length > 0) {
  console.error('i18n static coverage check failed. Move these strings into i18n bundles or add an explicit i18n-exempt comment:');
  for (const finding of findings) {
    console.error(`${finding.file}:${finding.line} ${finding.text}`);
  }
  process.exit(1);
}

console.info('i18n static coverage check passed');
