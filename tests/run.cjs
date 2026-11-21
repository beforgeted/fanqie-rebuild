const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const tests = [
  ['--test', 'tests/unit/analysis-service.test.mjs', 'tests/unit/architecture.test.mjs'],
  ...['history', 'infinite', 'official', 'intro', 'review', 'profiles', 'backup', 'selection-page', 'navigation'].map(name => [`tests/integration/verify-${name}.cjs`])
];
for (const args of tests) {
  const result = spawnSync(process.execPath, args, {cwd: root, stdio: 'inherit', timeout: 120000});
  if (result.error || result.status !== 0) {
    console.error(result.error || `测试失败：${args.join(' ')}`);
    process.exit(1);
  }
}
