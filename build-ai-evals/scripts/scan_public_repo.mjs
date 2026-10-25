#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';

const root = resolve(process.argv[2] || '.');
const ignoredDirectories = new Set(['.git', 'node_modules', 'coverage']);
const textExtensions = new Set(['.md', '.json', '.mjs', '.js', '.yaml', '.yml', '.html', '.txt']);
const findings = [];
const sensitivePatterns = [
  { label: 'possible Anthropic API key', pattern: /sk-ant-[A-Za-z0-9_-]{16,}/ },
  { label: 'possible OpenAI API key', pattern: /sk-(?:proj-)?[A-Za-z0-9_-]{16,}/ },
  { label: 'possible GitHub token', pattern: /(?:ghp_|github_pat_)[A-Za-z0-9_]{16,}/ },
  { label: 'possible AWS access key', pattern: /AKIA[0-9A-Z]{16}/ },
  { label: 'possible Slack token', pattern: /xox[baprs]-[A-Za-z0-9-]{16,}/ },
  { label: 'email address', pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i },
  { label: 'URL with embedded credentials', pattern: /https?:\/\/[^\s/:]+:[^\s/@]+@/i },
];

function walk(directory) {
  for (const name of readdirSync(directory)) {
    if (ignoredDirectories.has(name)) continue;
    const path = resolve(directory, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      walk(path);
      continue;
    }
    if (!textExtensions.has(extname(name)) && basename(name) !== 'LICENSE') continue;
    const text = readFileSync(path, 'utf8');
    if (/\/(?:Users|home)\/[A-Za-z0-9._-]+\//.test(text)) findings.push(`${path}: absolute home-directory path`);
    if (/[A-Za-z]:\\Users\\[^\\]+\\/.test(text)) findings.push(`${path}: absolute Windows home-directory path`);
    for (const { label, pattern } of sensitivePatterns) {
      if (pattern.test(text)) findings.push(`${path}: ${label}`);
    }
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) findings.push(`${path}: private key material`);
  }
}

walk(root);

if (findings.length) {
  console.error(`Public-repository scan failed with ${findings.length} finding(s):`);
  findings.forEach((finding) => console.error(`- ${finding}`));
  process.exit(1);
}

console.log('Public-repository heuristic scan passed for supported key, credential, email, private-key, and personal-path patterns. Manual review is still required.');
