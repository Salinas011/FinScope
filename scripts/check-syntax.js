import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) walk(full);
    else if (full.endsWith('.js')) {
      try {
        execSync(`node --check "${full}"`);
        console.log('OK:', full);
      } catch (err) {
        console.error('FAIL in:', full, err.message);
      }
    }
  }
}
walk('src');
walk('public');
