// As avaliações 👍/👎 das respostas do Leo. Cada uma fica na própria conversa (neste dispositivo) e, para quem tem
// sessão, também no Firestore do projeto (coleção "feedback"), para mais tarde melhorar as instruções ou treinar o modelo.
// Só segue a pergunta escrita e a resposta: os ficheiros anexados (CVs) nunca saem daqui.
import { getApp } from 'firebase/app';
import { addDoc, collection, getFirestore, serverTimestamp } from 'firebase/firestore/lite';
import { auth } from './firebase';
import type { Conversation, Mode } from './types';

export type Rating = 'up' | 'down';

export async function sendFeedback(input: { rating: Rating; mode: Mode; question: string; answer: string }) {
  const user = auth().currentUser;
  if (!user) return false;
  await addDoc(collection(getFirestore(getApp()), 'feedback'), {
    uid: user.uid,
    rating: input.rating,
    mode: input.mode,
    question: input.question.slice(0, 4000),
    answer: input.answer.slice(0, 12000),
    createdAt: serverTimestamp(),
  });
  return true;
}

// As respostas com 👍 deste dispositivo, no formato de conversa que as ferramentas de fine-tuning esperam
// (uma linha JSON por exemplo: {"messages": [system, user, assistant]}).
export function trainingJsonl(conversations: Conversation[]) {
  const lines: string[] = [];
  for (const c of conversations) {
    c.messages.forEach((m, i) => {
      if (m.role !== 'assistant' || m.feedback !== 'up' || !m.text.trim() || m.cvReview) return;
      const question = c.messages.slice(0, i).reverse().find((x) => x.role === 'user');
      if (!question?.text.trim()) return;
      lines.push(JSON.stringify({
        messages: [
          { role: 'system', content: `És o Leo, o assistente do CVviews, no modo ${c.mode === 'candidato' ? 'candidato' : 'recrutador'}.` },
          { role: 'user', content: question.text.trim() },
          { role: 'assistant', content: m.text.trim() },
        ],
      }));
    });
  }
  return lines.join('\n');
}
