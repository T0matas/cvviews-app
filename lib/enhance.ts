'use client';

// Melhorador de imagem com IA: um CV fotografado ou descarregado pequeno (menos de 1400 px) passa por um modelo
// de super-resolução (ESRGAN "slim", 2x) que corre no próprio navegador, sem enviar nada para lado nenhum.
// As letras ganham contornos limpos em vez de ficarem esborratadas ao ampliar. O modelo (≈ 0,9 MB) está em
// public/vendor/esrgan-slim-x2 e só se descarrega quando é preciso.
// Se o aparelho não aguentar, demorar demasiado ou algo falhar, fica a imagem original: nunca fica pior.

const SMALL = 1400;        // abaixo disto (lado maior, em px) vale a pena melhorar
const MAX_INPUT = 1200;    // acima disto o resultado ficaria enorme e lento em telemóveis
const TIME_LIMIT = 45_000;

type Upscaler = { upscale: (img: HTMLImageElement, opts: Record<string, unknown>) => Promise<string>; dispose: () => Promise<void> };

export const needsEnhance = (width: number, height: number) => Math.max(width, height) < SMALL;

function load(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('imagem inválida'));
    img.src = src;
  });
}

// Devolve a imagem melhorada (PNG, o dobro do tamanho) ou null, se não foi possível.
export async function enhanceImage(src: string): Promise<{ src: string; width: number; height: number } | null> {
  let upscaler: Upscaler | null = null;
  try {
    let img = await load(src);
    if (Math.max(img.naturalWidth, img.naturalHeight) > MAX_INPUT) return null;
    // fundo branco (uma transparência ficaria preta para o modelo)
    const flat = document.createElement('canvas');
    flat.width = img.naturalWidth;
    flat.height = img.naturalHeight;
    const ctx = flat.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, flat.width, flat.height);
    ctx.drawImage(img, 0, 0);
    img = await load(flat.toDataURL('image/png'));

    await import('@tensorflow/tfjs');
    const { default: Upscaler } = await import('upscaler');
    upscaler = new Upscaler({
      model: { scale: 2, modelType: 'layers', path: '/vendor/esrgan-slim-x2/model.json', inputRange: [0, 255], outputRange: [0, 255] },
    }) as unknown as Upscaler;
    const work = upscaler.upscale(img, { output: 'base64', patchSize: 128, padding: 8, awaitNextFrame: true });
    const out = await Promise.race([work, new Promise<null>((resolve) => setTimeout(() => resolve(null), TIME_LIMIT))]);
    if (!out) return null;
    const result = await load(out);
    return { src: out, width: result.naturalWidth, height: result.naturalHeight };
  } catch (error) {
    console.warn('[melhorar imagem] ficou a original:', error);
    return null;
  } finally {
    void upscaler?.dispose().catch(() => {});
  }
}
