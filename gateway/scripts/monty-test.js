const Monty = require('@pydantic/monty');

async function testMonty() {
    console.log('--- Monty Performance & Security Test ---');

    // Test 1: Cold Start Timing
    const start = performance.now();
    const monty = new Monty({
        code: 'print("Hello from Monty sandbox!")',
        script_name: 'test.py'
    });
    const end = performance.now();
    console.log(`Cold start time: ${(end - start).toFixed(4)}ms`);

    // Test 2: Basic Execution
    console.log('\nExecuting simple math code...');
    const result = await monty.run();
    console.log('Output:', result.stdout);

    // Test 3: Security Check (FS access)
    console.log('\nTesting security (detecting unauthorized imports)...');
    try {
        const securityMonty = new Monty({
            code: 'import os; print(os.getcwd())',
            script_name: 'security_test.py'
        });
        await securityMonty.run();
        console.warn('WARNING: os module was allowed! (Check defaults)');
    } catch (e) {
        console.log('Security check passed: "os" module blocked as expected.');
        console.log('Error detail:', e.message);
    }

    // Test 4: Resource Limits
    console.log('\nTesting resource limits (infinite loop)...');
    try {
        const timeoutMonty = new Monty({
            code: 'while True: pass',
            script_name: 'timeout_test.py',
            limits: {
                max_execution_ms: 100
            }
        });
        await timeoutMonty.run();
    } catch (e) {
        console.log('Resource limit passed: Infinite loop terminated.');
        console.log('Error detail:', e.message);
    }
}

testMonty().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
