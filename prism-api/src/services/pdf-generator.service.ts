import PDFDocument from 'pdfkit';

export class PDFGeneratorService {
    async generateVATReturn(data: {
        tin: string;
        businessName: string;
        period: string;
        invoices: any[];
        expenses: any[];
        totalOutputVAT: number;
        totalInputVAT: number;
        netVATPayable: number;
    }): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const doc = new PDFDocument({ size: 'A4', margin: 50 });
            const chunks: Buffer[] = [];

            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            doc.fontSize(20).text('VALUE ADDED TAX (VAT) RETURN', { align: 'center' });
            doc.fontSize(10).text('Federal Republic of Nigeria', { align: 'center' });
            doc.moveDown(2);

            doc.fontSize(12).text('TAXPAYER INFORMATION', { underline: true });
            doc.fontSize(10);
            doc.text(`TIN: ${data.tin}`);
            doc.text(`Business Name: ${data.businessName}`);
            doc.text(`Tax Period: ${data.period}`);
            doc.moveDown();

            doc.fontSize(12).text('VAT COMPUTATION', { underline: true });
            doc.fontSize(10).moveDown(0.5);

            doc.text('OUTPUT VAT (Sales):', { continued: true });
            doc.text(`₦${data.totalOutputVAT.toLocaleString()}`, { align: 'right' });

            data.invoices.slice(0, 10).forEach((inv, i) => {
                doc.fontSize(8).text(
                    `  ${i + 1}. ${inv.customer_name} - ₦${inv.vat_amount.toLocaleString()}`,
                    { indent: 20 }
                );
            });
            if (data.invoices.length > 10) {
                doc.text(`  ... and ${data.invoices.length - 10} more`, { indent: 20 });
            }

            doc.fontSize(10).moveDown();

            doc.text('INPUT VAT (Purchases):', { continued: true });
            doc.text(`₦${data.totalInputVAT.toLocaleString()}`, { align: 'right' });

            data.expenses.forEach((exp, i) => {
                doc.fontSize(8).text(
                    `  ${i + 1}. ${exp.description} - ₦${exp.vat_amount.toLocaleString()}`,
                    { indent: 20 }
                );
            });

            doc.fontSize(10).moveDown();

            doc.fontSize(12);
            doc.text('NET VAT PAYABLE:', { continued: true, underline: true });
            doc.text(`₦${data.netVATPayable.toLocaleString()}`, {
                align: 'right',
                underline: true
            });
            doc.moveDown(2);

            doc.fontSize(9);
            doc.text('DECLARATION:', { underline: true });
            doc.text(
                'I declare that the information provided in this return is true, correct and complete.',
                { align: 'justify' }
            );
            doc.moveDown(2);

            doc.text(`Date: ${new Date().toLocaleDateString('en-NG')}`);
            doc.moveDown();
            doc.text('_________________________');
            doc.text('Authorized Signature');

            doc.fontSize(8).text(
                `Filed via PRISM Tax Compliance Platform | Reference: VAT-${data.tin}-${data.period}`,
                { align: 'center' }
            );

            doc.end();
        });
    }
}

export const pdfGeneratorService = new PDFGeneratorService();
