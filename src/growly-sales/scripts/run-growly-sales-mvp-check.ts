import { checkLocalMvpReadiness } from '../mvp/checkLocalMvpReadiness.js';

async function main(): Promise<void> {
  console.log('Local Manual MVP Readiness');
  console.log('==========================');

  const result = await checkLocalMvpReadiness();

  console.log('');
  console.log(`ready: ${result.ready ? 'true ✅' : 'false ❌'}`);
  console.log('');

  console.log(`passed: ${result.passedChecks.length}`);
  result.passedChecks.forEach((c) => console.log(`  ✅ ${c}`));

  console.log('');
  console.log(`failed: ${result.failedChecks.length}`);
  result.failedChecks.forEach((c) => console.log(`  ❌ ${c}`));

  console.log('');
  console.log(`warnings: ${result.warnings.length}`);
  result.warnings.forEach((w) => console.log(`  ⚠️  ${w}`));

  console.log('');
  console.log('nextSteps:');
  if (result.nextSteps.length === 0) {
    console.log('  - （なし）');
  } else {
    result.nextSteps.forEach((s) => console.log(`  - ${s}`));
  }
}

main().catch((err) => {
  console.error('MVP check fatal error:', err);
  process.exit(1);
});

