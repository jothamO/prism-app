import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  FileText, 
  Upload, 
  Image, 
  Building2, 
  Receipt, 
  FileCheck,
  Loader2,
  Check,
  Send,
  X
} from "lucide-react";

export interface ExtractedData {
  documentType: 'bank_statement' | 'invoice' | 'tax_document';
  bank?: string;
  accountNumber?: string;
  accountName?: string;
  period?: string;
  openingBalance?: number;
  closingBalance?: number;
  transactions?: Array<{
    date: string;
    description: string;
    credit?: number;
    debit?: number;
  }>;
  vendor?: string;
  invoiceNumber?: string;
  date?: string;
  items?: Array<{
    description: string;
    qty: number;
    unitPrice: number;
    vatRate: number;
  }>;
  subtotal?: number;
  vatAmount?: number;
  total?: number;
  tin?: string;
  taxpayerName?: string;
  registrationDate?: string;
  status?: string;
  validThrough?: string;
}

interface DocumentTestUploaderProps {
  onDocumentProcessed: (data: ExtractedData, summary: string) => void;
}

type DocumentType = 'bank_statement' | 'invoice' | 'tax_document';

const MOCK_DATA: Record<DocumentType, ExtractedData> = {
  bank_statement: {
    documentType: 'bank_statement',
    bank: 'Guaranty Trust Bank',
    accountNumber: '****1234',
    accountName: 'ACME TRADING LTD',
    period: '2025-01-01 to 2025-01-31',
    openingBalance: 2500000,
    closingBalance: 3750000,
    transactions: [
      { date: '2025-01-05', description: 'TRANSFER FROM JOHN DOE', credit: 1500000 },
      { date: '2025-01-12', description: 'POS PURCHASE SHOPRITE', debit: 45000 },
      { date: '2025-01-15', description: 'NEFT FROM DANGOTE PLC', credit: 850000 },
      { date: '2025-01-18', description: 'SALARY PAYMENT', debit: 200000 },
      { date: '2025-01-22', description: 'UTILITY BILL EKEDC', debit: 55000 },
      { date: '2025-01-28', description: 'TRANSFER TO VENDOR', debit: 300000 },
    ]
  },
  invoice: {
    documentType: 'invoice',
    vendor: 'Dangote Cement Plc',
    invoiceNumber: 'INV-2025-00123',
    date: '2025-01-15',
    items: [
      { description: 'Portland Cement 50kg', qty: 100, unitPrice: 8500, vatRate: 0.075 },
      { description: 'Delivery Charge', qty: 1, unitPrice: 25000, vatRate: 0.075 }
    ],
    subtotal: 875000,
    vatAmount: 65625,
    total: 940625
  },
  tax_document: {
    documentType: 'tax_document',
    tin: '12345678-0001',
    taxpayerName: 'ACME TRADING LIMITED',
    registrationDate: '2024-06-15',
    status: 'Active',
    validThrough: '2025-12-31'
  }
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount);
};

export const DocumentTestUploader = ({ onDocumentProcessed }: DocumentTestUploaderProps) => {
  const [selectedType, setSelectedType] = useState<DocumentType | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      setExtractedData(null);
    }
  };

  const processDocument = async () => {
    if (!selectedType) return;
    
    setIsProcessing(true);
    
    // Simulate OCR processing delay
    await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 1000));
    
    const data = MOCK_DATA[selectedType];
    setExtractedData(data);
    setIsProcessing(false);
  };

  const generateSummary = (data: ExtractedData): string => {
    if (data.documentType === 'bank_statement') {
      const totalCredits = data.transactions?.reduce((sum, t) => sum + (t.credit || 0), 0) || 0;
      const totalDebits = data.transactions?.reduce((sum, t) => sum + (t.debit || 0), 0) || 0;
      return `📄 Bank Statement - ${data.bank}\n` +
        `Account: ${data.accountName} (${data.accountNumber})\n` +
        `Period: ${data.period}\n` +
        `Opening: ${formatCurrency(data.openingBalance || 0)}\n` +
        `Closing: ${formatCurrency(data.closingBalance || 0)}\n` +
        `Total Credits: ${formatCurrency(totalCredits)}\n` +
        `Total Debits: ${formatCurrency(totalDebits)}`;
    }
    
    if (data.documentType === 'invoice') {
      return `🧾 Invoice from ${data.vendor}\n` +
        `Invoice #: ${data.invoiceNumber}\n` +
        `Date: ${data.date}\n` +
        `Items: ${data.items?.length || 0}\n` +
        `Subtotal: ${formatCurrency(data.subtotal || 0)}\n` +
        `VAT: ${formatCurrency(data.vatAmount || 0)}\n` +
        `Total: ${formatCurrency(data.total || 0)}`;
    }
    
    return `📋 Tax Document - TIN Certificate\n` +
      `TIN: ${data.tin}\n` +
      `Name: ${data.taxpayerName}\n` +
      `Status: ${data.status}\n` +
      `Valid Through: ${data.validThrough}`;
  };

  const sendToChat = () => {
    if (extractedData) {
      const summary = generateSummary(extractedData);
      onDocumentProcessed(extractedData, summary);
      // Reset state
      setUploadedFile(null);
      setPreviewUrl(null);
      setExtractedData(null);
      setSelectedType(null);
    }
  };

  const clearAll = () => {
    setUploadedFile(null);
    setPreviewUrl(null);
    setExtractedData(null);
    setSelectedType(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <FileText className="w-4 h-4" />
          Document Test Upload
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Document Type Selection */}
        <div className="grid grid-cols-3 gap-2">
          <Button
            variant={selectedType === 'bank_statement' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedType('bank_statement')}
            className="flex-col h-auto py-2 gap-1"
          >
            <Building2 className="w-4 h-4" />
            <span className="text-xs">Bank</span>
          </Button>
          <Button
            variant={selectedType === 'invoice' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedType('invoice')}
            className="flex-col h-auto py-2 gap-1"
          >
            <Receipt className="w-4 h-4" />
            <span className="text-xs">Invoice</span>
          </Button>
          <Button
            variant={selectedType === 'tax_document' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedType('tax_document')}
            className="flex-col h-auto py-2 gap-1"
          >
            <FileCheck className="w-4 h-4" />
            <span className="text-xs">Tax Doc</span>
          </Button>
        </div>

        {/* Upload Zone */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          accept="image/*,.pdf"
          className="hidden"
        />
        
        {!uploadedFile ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
          >
            <Upload className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              Click or drag to upload
            </p>
          </div>
        ) : (
          <div className="relative">
            {previewUrl && uploadedFile.type.startsWith('image/') ? (
              <img 
                src={previewUrl} 
                alt="Preview" 
                className="w-full h-24 object-cover rounded-lg"
              />
            ) : (
              <div className="w-full h-24 bg-muted rounded-lg flex items-center justify-center">
                <FileText className="w-8 h-8 text-muted-foreground" />
              </div>
            )}
            <Button
              variant="destructive"
              size="icon"
              className="absolute top-1 right-1 h-6 w-6"
              onClick={clearAll}
            >
              <X className="w-3 h-3" />
            </Button>
            <p className="text-xs mt-1 truncate">{uploadedFile.name}</p>
          </div>
        )}

        {/* Process Button */}
        {uploadedFile && selectedType && !extractedData && (
          <Button 
            size="sm" 
            className="w-full gap-2"
            onClick={processDocument}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Image className="w-3 h-3" />
                Process Document
              </>
            )}
          </Button>
        )}

        {/* Extracted Data Preview */}
        {extractedData && (
          <div className="space-y-2">
            <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-1 text-green-700 dark:text-green-400 text-xs font-medium mb-1">
                <Check className="w-3 h-3" />
                Extracted Successfully
              </div>
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap">
                {generateSummary(extractedData)}
              </pre>
            </div>
            
            <Button 
              size="sm" 
              className="w-full gap-2"
              onClick={sendToChat}
            >
              <Send className="w-3 h-3" />
              Send to Chat
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default DocumentTestUploader;
