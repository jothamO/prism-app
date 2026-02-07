import { Monty, MontyException } from '@pydantic/monty';

async function testMonty() {
    console.log('--- Monty Performance & Security Test ---');

    // Test 1: Cold Start Timing
    const start = performance.now();
    const monty = Monty.create('print("Hello from Monty sandbox!")', {
        scriptName: 'test.py'
    });
    const end = performance.now();
    console.log(`Cold start time: ${(end - start).toFixed(4)}ms`);

    if (monty instanceof Monty) {
        // Test 2: Basic Execution
        console.log('\nExecuting simple math code...');
        const result = await monty.run();
        console.log('Output:', result);
    } else {
        console.error('Failed to create Monty instance:', monty);
    }

    // Test 3: Security Check (FS access)
    console.log('\nTesting security (detecting unauthorized imports)...');
    try {
        const securityMonty = Monty.create('import os; print("CWD is:", os.getcwd())', {
            scriptName: 'security_test.py'
        });
        if (securityMonty instanceof Monty) {
            const secResult = await securityMonty.run();
            if (secResult instanceof MontyException) {
                console.log('Security check passed: run() returned MontyException.');
                console.log('Error:', secResult.message);
            } else {
                console.warn('WARNING: os module was allowed! Result:', secResult);
            }
        } else {
            console.log('Security check passed: "os" module blocked during create/parse.');
            console.log('Detail:', (securityMonty as any).message || securityMonty);
        }
    } catch (e: any) {
        console.log('Security check passed: Exception thrown during execution.');
        console.log('Error detail:', e.message);
    }

    // Test 4: Resource Limits
    console.log('\nTesting resource limits (infinite loop)...');
    try {
        const timeoutMonty = Monty.create('i = 0\nwhile True: i += 1', {
            scriptName: 'timeout_test.py'
        });
        if (timeoutMonty instanceof Monty) {
            console.log('Starting infinite loop with 100ms limit...');
            const startTime = performance.now();
            const timeoutResult = await timeoutMonty.run({
                limits: {
                    maxDurationSecs: 0.1
                }
            });
            const duration = performance.now() - startTime;
            console.log(`Execution returned after ${duration.toFixed(2)}ms`);

            if (timeoutResult instanceof MontyException) {
                console.log('Resource limit passed: MontyException returned.');
                console.log('Error:', timeoutResult.message);
            } else {
                console.warn('WARNING: Infinite loop returned normally? Result:', timeoutResult);
            }
        }
    } catch (e: any) {
        console.log('Resource limit passed: Exception thrown.');
        console.log('Error detail:', e.message);
    }
}

testMonty().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
