/**
 * Test Script: Statement Hydration Verification
 * Verifies that StatementHydrator correctly aggregates bank_transactions into ytd_state.
 */

import { supabase } from '../src/config';
import { StatementHydrator } from '../src/agent-core/statement-hydrator';

const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';

async function main() {
    console.log('=== P6.17: Statement Hydration Test ===\n');

    const fiscalYear = new Date().getFullYear();

    // 1. Clear old test data
    console.log('1. Cleaning up old test data...');
    await supabase.from('ytd_state').delete().eq('user_id', TEST_USER_ID);
    await supabase.from('bank_transactions').delete().eq('user_id', TEST_USER_ID);
    await supabase.from('users').delete().eq('id', TEST_USER_ID);

    // 1.5 Create test user
    console.log('1.5. Creating test user...');
    const { error: userError } = await supabase.from('users').insert({
        id: TEST_USER_ID,
        whatsapp_number: '+2340000000001',
        business_name: 'Test Business',
        tin: 'TEST-TIN-001'
    });
    if (userError) {
        console.error('Failed to create test user:', userError);
        process.exit(1);
    }

    // 2. Insert mock transactions

    console.log('2. Inserting mock transactions...');
    const mockTransactions = [
        { user_id: TEST_USER_ID, transaction_date: `${fiscalYear}-01-15`, description: 'POS Sale', credit: 50000, debit: null, is_revenue: true, is_expense: false, vat_amount: 3750 },
        { user_id: TEST_USER_ID, transaction_date: `${fiscalYear}-02-10`, description: 'OPay Transfer', credit: 30000, debit: null, is_revenue: true, is_expense: false, vat_amount: 2250 },
        { user_id: TEST_USER_ID, transaction_date: `${fiscalYear}-03-05`, description: 'Office Supplies', credit: null, debit: 15000, is_revenue: false, is_expense: true, vat_amount: 1125 },
        { user_id: TEST_USER_ID, transaction_date: `${fiscalYear}-04-20`, description: 'Electricity Bill', credit: null, debit: 8000, is_revenue: false, is_expense: true, vat_amount: 0 },
        { user_id: TEST_USER_ID, transaction_date: `${fiscalYear}-05-01`, description: 'Customer Payment', credit: 100000, debit: null, is_revenue: true, is_expense: false, vat_amount: 7500 },
    ];

    const { error: insertError } = await supabase.from('bank_transactions').insert(mockTransactions);
    if (insertError) {
        console.error('Failed to insert mock transactions:', insertError);
        process.exit(1);
    }
    console.log(`   Inserted ${mockTransactions.length} transactions.`);

    // 3. Run hydration
    console.log('3. Running StatementHydrator.hydrate()...');
    await StatementHydrator.hydrate(TEST_USER_ID, null);
    console.log('   Hydration complete.');

    // 4. Verify ytd_state
    console.log('4. Verifying ytd_state...');
    const { data: ytd, error: ytdError } = await supabase
        .from('ytd_state')
        .select('*')
        .eq('user_id', TEST_USER_ID)
        .eq('fiscal_year', fiscalYear)
        .single();

    if (ytdError) {
        console.error('Failed to fetch ytd_state:', ytdError);
        process.exit(1);
    }

    console.log('\n=== YTD State ===');
    console.log(`   Revenue: ₦${ytd.revenue.toLocaleString()}`);
    console.log(`   Expenses: ₦${ytd.expenses.toLocaleString()}`);
    console.log(`   VAT Paid: ₦${ytd.vat_paid.toLocaleString()}`);
    console.log(`   Revenue Txn Count: ${ytd.revenue_txn_count}`);
    console.log(`   Expense Txn Count: ${ytd.expense_txn_count}`);

    // 5. Assertions
    const expectedRevenue = 50000 + 30000 + 100000;
    const expectedExpenses = 15000 + 8000;
    const expectedVat = 3750 + 2250 + 1125 + 0 + 7500;

    const passed = ytd.revenue === expectedRevenue &&
        ytd.expenses === expectedExpenses &&
        ytd.vat_paid === expectedVat &&
        ytd.revenue_txn_count === 3 &&
        ytd.expense_txn_count === 2;

    if (passed) {
        console.log('\n✅ PASS: All assertions passed.');
    } else {
        console.log('\n❌ FAIL: Assertion mismatch.');
        console.log(`   Expected Revenue: ${expectedRevenue}, Got: ${ytd.revenue}`);
        console.log(`   Expected Expenses: ${expectedExpenses}, Got: ${ytd.expenses}`);
        console.log(`   Expected VAT: ${expectedVat}, Got: ${ytd.vat_paid}`);
    }

    // 6. Cleanup
    console.log('\n5. Cleaning up...');
    await supabase.from('ytd_state').delete().eq('user_id', TEST_USER_ID);
    await supabase.from('bank_transactions').delete().eq('user_id', TEST_USER_ID);
    await supabase.from('users').delete().eq('id', TEST_USER_ID);
    console.log('   Done.');
}


main().catch(console.error);
