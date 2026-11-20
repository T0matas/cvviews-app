// As conversas na conta: cada uma num documento do Firestore (users/{uid}/memory/conv-{id}), no mesmo sítio da
// memória do Leo, que só a própria pessoa lê. Assim, quem entra noutro computador, no telemóvel ou na app iOS
// encontra as mesmas conversas. Neste dispositivo continuam também no localStorage (abrem logo, mesmo sem rede).
import { getApp } from 'firebase/app';
import { collection, deleteDoc, doc, getDocs, getFirestore, serverTimestamp, setDoc } from 'firebase/firestore/lite';
import { auth } from './firebase';
import type { Conversation } from './types';

const PREFIX = 'conv-';
// Um documento do Firestore aguenta até 1 MB; uma conversa maior fica só neste dispositivo.
const MAX_BYTES = 900_000;

const db = () => { auth(); return getFirestore(getApp()); };
const ref = (uid: string, id: string) => doc(db(), 'users', uid, 'memory', `${PREFIX}${id}`);

export async function loadRemoteConversations(uid: string): Promise<Conversation[]> {
  const snap = await getDocs(collection(db(), 'users', uid, 'memory'));
  const list: Conversation[] = [];
  snap.forEach((d) => {
    if (!d.id.startsWith(PREFIX)) return;
    try {
      const c = JSON.parse(String((d.data() as { data?: string }).data || 'null')) as Conversation | null;
      if (c?.id && Array.isArray(c.messages)) list.push(c);
    } catch { /* um documento estragado não impede os outros */ }
  });
  return list;
}

export async function saveRemoteConversation(uid: string, conversation: Conversation) {
  const data = JSON.stringify(conversation);
  if (data.length > MAX_BYTES) return console.warn('[conversas] demasiado grande para a conta, fica só neste dispositivo:', conversation.title);
  await setDoc(ref(uid, conversation.id), { data, updatedAt: conversation.updatedAt, savedAt: serverTimestamp() });
}

export async function deleteRemoteConversation(uid: string, id: string) {
  await deleteDoc(ref(uid, id));
}

// Junta as conversas deste dispositivo com as da conta: a mesma conversa nos dois lados fica com a versão mais recente.
export function mergeConversations(local: Conversation[], remote: Conversation[]) {
  const byId = new Map<string, Conversation>();
  for (const c of [...remote, ...local]) {
    const seen = byId.get(c.id);
    if (!seen || (c.updatedAt ?? 0) > (seen.updatedAt ?? 0) || ((c.updatedAt ?? 0) === (seen.updatedAt ?? 0) && c.messages.length > seen.messages.length)) byId.set(c.id, c);
  }
  return [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}
