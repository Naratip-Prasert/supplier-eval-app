import * as fs from 'fs';
import * as path from 'path';

function walk(dir: string, callback: (filepath: string) => void) {
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      if (!file.includes('node_modules') && !file.includes('.git')) {
        walk(file, callback);
      }
    } else {
      callback(file);
    }
  });
}

function replaceSpes(dir: string) {
  walk(dir, (filepath) => {
    if (filepath.endsWith('.ts') || filepath.endsWith('.tsx') || filepath.endsWith('.js')) {
      const content = fs.readFileSync(filepath, 'utf8');
      
      // We want to replace "SPES2_" with "SPES2_" everywhere, except if it's already "SPES2_".
      // Also, we don't want to replace "Master_Data_..." but we are only targeting SPES2_.
      
      // Only replace if it contains SPES2_ (and not SPES2_ already)
      if (content.includes('SPES2_')) {
        // Regex to replace SPES2_ with SPES2_, but ignoring SPES2_
        // (?<!SPES2_) is positive lookbehind, wait, actually just replacing SPES2_ and then fixing any SPES2_ is easier,
        // but let's just use a regex: /SPES2_(?!2)/g is wrong. It's /SPES2_/g
        // Let's replace all 'SPES2_' with 'SPES2_'
        
        let newContent = content.replace(/SPES2_/g, 'SPES2_');
        // If there were any SPES2_ originally, they became SPES2_. Let's fix them back.
        newContent = newContent.replace(/SPES2_/g, 'SPES2_');
        
        if (content !== newContent) {
          fs.writeFileSync(filepath, newContent, 'utf8');
          console.log(`Updated ${filepath}`);
        }
      }
    }
  });
}

// Replace in backend and frontend
replaceSpes(path.join(__dirname, '../backend'));
replaceSpes(path.join(__dirname, '../frontend/src'));
