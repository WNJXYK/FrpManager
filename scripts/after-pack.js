const fs = require('fs');
const path = require('path');

exports.default = async function(context) {
  const appOutDir = context.appOutDir;
  const resourcesPath = path.join(appOutDir, 'Contents/Resources/app.asar.unpacked');
  
  // 要删除的文件和目录
  const pathsToRemove = [
    'node_modules/@types',
    'node_modules/typescript',
    'node_modules/.bin',
    'node_modules/**/*.map',
    'node_modules/**/*.ts',
    'node_modules/**/*.md',
    'node_modules/**/*.flow',
    'node_modules/**/test',
    'node_modules/**/tests',
    'node_modules/**/docs',
    'node_modules/**/doc',
    'node_modules/**/examples',
    'node_modules/**/demo',
    'node_modules/**/.git',
    'node_modules/**/.github'
  ];

  // 删除不需要的文件和目录
  for (const pattern of pathsToRemove) {
    const fullPath = path.join(resourcesPath, pattern);
    try {
      if (fs.existsSync(fullPath)) {
        if (fs.lstatSync(fullPath).isDirectory()) {
          fs.rmdirSync(fullPath, { recursive: true });
        } else {
          fs.unlinkSync(fullPath);
        }
      }
    } catch (error) {
      console.warn(`Warning: Could not remove ${fullPath}`, error);
    }
  }
}; 