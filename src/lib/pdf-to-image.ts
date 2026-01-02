import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Use the worker from the npm package (works with Vite)
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export interface PDFConversionResult {
  pageCount: number;
  images: string[]; // Base64 encoded images (without data URL prefix)
}

export async function convertPDFToImages(
  file: File, 
  options: { 
    scale?: number;
  } = {}
): Promise<PDFConversionResult> {
  const { scale = 2.0 } = options;
  
  // Read file as ArrayBuffer
  const arrayBuffer = await file.arrayBuffer();
  const typedArray = new Uint8Array(arrayBuffer);
  
  // Load PDF document
  const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise;
  const pageCount = pdf.numPages;
  
  const images: string[] = [];
  
  // Convert ALL pages
  for (let i = 1; i <= pageCount; i++) {
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
