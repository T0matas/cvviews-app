// Corre no <head>, antes de pintar: liga o modo leve (data-lite) em aparelhos fracos. Ver lib/perf.ts.
export const LITE_BOOT = "try{var n=navigator,c=n.hardwareConcurrency||8,m=n.deviceMemory||8,s=n.connection&&n.connection.saveData;if(c<=2||m<=2||s||localStorage.getItem('cvviews-lite')==='1')document.documentElement.dataset.lite='1'}catch(e){}";
