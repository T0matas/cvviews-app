'use client';

// Lê os ficheiros no navegador, antes de seguirem para o servidor:
// um PDF com texto segue como texto; um PDF feito de imagens (digitalizado, ou o CV corrigido que o site
// descarrega) segue como fotografias das páginas, que o servidor transcreve com o modelo de visão.

const MAX_PAGES = 4;
const MAX_SIDE = 1800;

type PdfResult = { text: string } | { images: string[] };

async function pdfjs() {
  const lib = await import('pdfjs-dist');
  lib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  return lib;
}

export async function readPdf(file: File): Promise<PdfResult> {
  const { getDocument } = await pdfjs();
  const task = getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pdf = await task.promise;
  try {
    const pages: string[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const content = await (await pdf.getPage(n)).getTextContent();
      pages.push(content.items.map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '')).join(''));
    }
    const text = pages.join('\n\n').replace(/[ \t]+\n/g, '\n').trim();
    if (text.replace(/\s/g, '').length >= 40) return { text };

    // Sem texto: desenha as primeiras páginas em JPEG.
    const images: string[] = [];
    for (let n = 1; n <= Math.min(pdf.numPages, MAX_PAGES); n++) {
      const page = await pdf.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(2.5, MAX_SIDE / Math.max(base.width, base.height)) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      images.push(canvas.toDataURL('image/jpeg', 0.85));
    }
    return { images };
  } finally {
    void task.destroy();
  }
}

// O PDF original em base64, para desenhar as correções por cima das páginas.
export async function toBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
}

// Um documento Word (.docx), lido como texto no navegador.
export async function readWord(file: File) {
  const mammoth = await import('mammoth');
  const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return value.trim();
}

// Fotografias de um CV: reduzidas para caberem no limite do modelo de visão.
export async function readImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('imagem inválida'));
      image.src = url;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}
