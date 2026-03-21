const fs = require('fs');
const path = require('path');

function getFiles(dir, filesList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (file !== 'node_modules' && file !== '.next' && file !== '.git') {
        getFiles(fullPath, filesList);
      }
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      filesList.push(fullPath);
    }
  }
  return filesList;
}

const allFiles = getFiles('.');
const icons = new Set();

for (const file of allFiles) {
  const content = fs.readFileSync(file, 'utf-8');
  // Handle multiline imports too
  const regex = /import\s+\{([^}]+)\}\s+from\s+['"]lucide-react['"]/gm;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const importedIcons = match[1].split(',').map(i => i.trim()).filter(Boolean);
    // some might have aliases like `import { Search as SearchIcon }...`
    importedIcons.forEach(i => {
      const parts = i.split(' as ');
      icons.add(parts[0].trim());
    });
  }
}

console.log(Array.from(icons).sort().join('\n'));
