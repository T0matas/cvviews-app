// Contas do CVviews: o mesmo projeto Firebase do site oficial (cvviews-ofcsite/public/firebase-config.js).
// Estes valores só dizem ao SDK com que projeto falar; são públicos. As contas são protegidas
// pelas definições da consola Firebase (métodos de entrada, domínios autorizados).
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyArp3G2y8LTFukY8Q0hy-xPub-H_Ht4O8U',
  // Em cvviews.me a entrada com a Google passa pelo próprio site (ver next.config.ts); noutros endereços
  // (localhost, pré-visualizações da Vercel) continua pelo domínio da Firebase.
  authDomain: typeof window !== 'undefined' && /(^|\.)cvviews\.me$/.test(window.location.hostname) ? window.location.hostname : 'cvviews-26241.firebaseapp.com',
  projectId: 'cvviews-26241',
  storageBucket: 'cvviews-26241.firebasestorage.app',
  messagingSenderId: '1000049135591',
  appId: '1:1000049135591:web:e337af02675041fb42f742',
};

export function auth() {
  const instance = getAuth(getApps().length ? getApp() : initializeApp(firebaseConfig));
  instance.languageCode = 'pt-PT';
  return instance;
}

// Os códigos de erro da Firebase em palavras que se percebem (os mesmos do site).
const WRONG = 'O email ou a palavra-passe não estão certos.';
const MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'Isso não parece um email. Vê se há algum erro, como em nome@exemplo.pt.',
  'auth/missing-password': 'Escreve a tua palavra-passe.',
  'auth/invalid-credential': WRONG,
  'auth/invalid-login-credentials': WRONG,
  'auth/wrong-password': WRONG,
  'auth/user-not-found': WRONG,
  'auth/user-disabled': 'Esta conta foi desativada.',
  'auth/email-already-in-use': 'Já existe uma conta com este email. Entra com a palavra-passe.',
  'auth/weak-password': 'Essa palavra-passe é fácil de adivinhar. Escolhe outra mais longa.',
  'auth/too-many-requests': 'Foram muitas tentativas seguidas. Espera um bocado e tenta de novo.',
  'auth/network-request-failed': 'Sem ligação à internet. Verifica a rede e tenta de novo.',
  'auth/popup-blocked': 'O navegador bloqueou a janela da Google. Deixa este site abrir janelas e tenta de novo.',
  'auth/unauthorized-domain': 'Este endereço ainda não está autorizado a entrar com a Google.',
  'auth/account-exists-with-different-credential': 'Já tens conta com este email. Entra com o email e a palavra-passe.',
};
// A pessoa fechou a janela da Google: não há nada a dizer.
export const QUIET = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled']);
export const messageFor = (error: unknown) => MESSAGES[(error as { code?: string })?.code ?? ''] || 'Algo correu mal. Tenta de novo.';
