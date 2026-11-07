// A memória do Leo: notas curtas sobre a pessoa (o que procura, a experiência, as preferências) e o último CV que
// ela partilhou, para não ter de recomeçar do zero em cada conversa. Fica neste dispositivo e, com sessão, na conta
// (Firestore, users/{uid}/memory/main), onde só a própria pessoa a lê. Vê-se e apaga-se nas Configurações.
import { getApp } from 'firebase/app';
import { deleteDoc, doc, getDoc, getFirestore, serverTimestamp, setDoc } from 'firebase/firestore/lite';
import { auth } from './firebase';

export type Memory = { notes: string[]; cv?: { name: string; text: string } };

export const EMPTY_MEMORY: Memory = { notes: [] };
export const MAX_NOTES = 20;
export const MAX_CV = 30000;

const key = (uid?: string) => `cvviews-memory:${uid || 'anon'}`;
const clean = (m: Partial<Memory> | null | undefined): Memory => ({
  notes: (Array.isArray(m?.notes) ? m!.notes : []).filter((n): n is string => typeof n === 'string' && n.trim().length > 0).map((n) => n.trim().slice(0, 240)).slice(0, MAX_NOTES),
  cv: m?.cv?.text ? { name: String(m.cv.name || 'CV').slice(0, 160), text: String(m.cv.text).slice(0, MAX_CV) } : undefined,
});

export function loadLocal(uid?: string): Memory {
  try { return clean(JSON.parse(localStorage.getItem(key(uid)) ?? 'null')); } catch { return EMPTY_MEMORY; }
}

export function saveLocal(uid: string | undefined, memory: Memory) {
  try { localStorage.setItem(key(uid), JSON.stringify(memory)); } catch { /* cheio ou bloqueado */ }
}

const ref = (uid: string) => {
  auth(); // garante que a app Firebase já está iniciada
  return doc(getFirestore(getApp()), 'users', uid, 'memory', 'main');
};

export async function loadRemote(uid: string): Promise<Memory | null> {
  const snap = await getDoc(ref(uid));
  if (!snap.exists()) return null;
  const d = snap.data() as { notes?: string[]; cvName?: string; cvText?: string };
  return clean({ notes: d.notes, cv: d.cvText ? { name: d.cvName || 'CV', text: d.cvText } : undefined });
}

export async function saveRemote(uid: string, memory: Memory) {
  await setDoc(ref(uid), { notes: memory.notes, cvName: memory.cv?.name ?? '', cvText: memory.cv?.text ?? '', updatedAt: serverTimestamp() });
}

export async function clearRemote(uid: string) {
  await deleteDoc(ref(uid));
}

export const isEmpty = (m: Memory) => !m.notes.length && !m.cv;
