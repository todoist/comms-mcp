// `npm run verify`: every check CI runs on a pull request, in a few seconds.
// Records a fingerprint of the tree only when everything passed; the push check reads it.

import { CHECKOUT_ROOT, branchBase, defaultBranchRef } from './lib/git.ts'
import { forgetPassedChanges } from './lib/patches.ts'
import { clearVerified } from './lib/state.ts'
import { BLIND_SPOTS, dropNonCiEnv, preflight, VERIFY_STEPS } from './lib/steps.ts'
import { runVerify } from './lib/verify.ts'

const root = CHECKOUT_ROOT
const ref = defaultBranchRef(root)
const base = ref ? branchBase(root, ref) : undefined

const problems = preflight(root)
if (problems.length > 0) {
    for (const problem of problems) console.log(`✗ ${problem}`)
    // exitCode, not exit(): on macOS a piped stdout is written asynchronously, and exit() could
    // cut off the lines an agent reads.
    process.exitCode = 1
    // A run that stops here is a run that didn't pass: forget the tree and the branch's changes, as
    // a failing check would. After the problems, which still say what to fix when forgetting fails.
    clearVerified(root)
    if (base !== undefined) forgetPassedChanges(root, base)
} else {
    await main()
}

async function main(): Promise<void> {
    dropNonCiEnv(process.env, console.log)

    const result = await runVerify({
        root,
        steps: VERIFY_STEPS,
        base,
        baseName: ref?.replace(/^refs\/(remotes|heads)\//, '') ?? 'main',
    })

    if (result.recorded) {
        console.log('Not covered by these checks:')
        for (const spot of BLIND_SPOTS) console.log(`- ${spot}`)
    }
    process.exitCode = result.ok ? 0 : 1
}
