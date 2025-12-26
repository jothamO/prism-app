
import dotenv from 'dotenv';
import { classifierService } from './src/services/classifier.service';

dotenv.config();

async function test() {
    console.log('Testing Classifier Service...');
    console.log('Provider:', process.env.AI_PROVIDER);

    const sampleTransaction = {
        amount: 50000,
        narration: "Payment for electrical supplies",
        date: "2023-10-27"
    };

    console.log('\nSample Transaction:', sampleTransaction);

    try {
        const result = await classifierService.classify(sampleTransaction);
        console.log('\nClassification Result:', JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('Error:', error);
    }
}

test();
