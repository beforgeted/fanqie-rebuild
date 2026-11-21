const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {pathToFileURL} = require('node:url');
const {build, moduleFiles, root} = require('./build.cjs');
(async () => {
  build({check: true});
  // Native ESM loading also checks that named imports really exist.
  for (const file of moduleFiles) await import(pathToFileURL(path.join(root, file)).href);
  const files = ['src/platform/chrome/background.js', ...fs.readdirSync(__dirname).filter(f => f.endsWith('.cjs')).map(f => 'scripts/' + f)];
  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], {cwd: root, stdio: 'inherit'});
    if (result.error || result.status !== 0) throw result.error || Error(`语法检查失败：${file}`);
  }
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json')));
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
  if (lock.version !== pkg.version || lock.packages[''].version !== pkg.version) throw Error('版本号不一致');
  console.log('模块导入、脚本语法及版本检查通过。');
})().catch(error => {console.error(error); process.exitCode = 1;});
