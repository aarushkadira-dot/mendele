const fs = require('fs');
const path = require('path');

function getFiles(dir, filesList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (!['node_modules', '.next', '.git'].includes(file)) {
        getFiles(fullPath, filesList);
      }
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      filesList.push(fullPath);
    }
  }
  return filesList;
}

const allFiles = getFiles('.');
let count = 0;
for (const file of allFiles) {
  if (file.includes('icons.tsx')) continue; 
  let content = fs.readFileSync(file, 'utf-8');
  if (content.match(/from\s+['"]lucide-react['"]/)) {
    content = content.replace(/from\s+['"]lucide-react['"]/g, 'from "@/components/ui/icons"');
    fs.writeFileSync(file, content, 'utf-8');
    count++;
  }
}
console.log(`Replaced lucide-react imports in ${count} files.`);
