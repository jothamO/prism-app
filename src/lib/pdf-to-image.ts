import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker from CDN
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export interface PDFConversionResult {
  pageCount: number;
  images: string[]; // Base64 encoded images (without data URL prefix)
}

export async function convertPDFToImages(
  file: File, 
  options: { 
    maxPages?: number;
    scale?: number;
  } = {}
): Promise<PDFConversionResult> {
  const { maxPages = 5, scale = 2.0 } = options;
  
  // Read file as ArrayBuffer
  const arrayBuffer = await file.arrayBuffer();
  const typedArray = new Uint8Array(arrayBuffer);
  
  // Load PDF document
  const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise;
  const pageCount = pdf.numPages;
  const pagesToConvert = Math.min(pageCount, maxPages);
  
  const images: string[] = [];
  
  for (let i = 1; i <= pagesToConvert; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    
    // Create canvas for rendering
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    
    // Render PDF page to canvas
    await page.render({
      canvasContext: context,
      viewport: viewport,
    }).promise;
    
    // Convert canvas to base64 PNG
    const dataUrl = canvas.toDataURL('image/png', 0.92);
    // Remove data URL prefix to get raw base64
    const base64 = dataUrl.split(',')[1];
    images.push(base64);
  }
  
  return { pageCount, images };
}
