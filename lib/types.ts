import type { FullCv, Review } from './review';
import type { CvEdit } from '@/components/cv-editor';
import type { OriginalLook } from '@/components/review-view';
import type { CvLayoutInfo } from '@/app/api/layout/route';

export type Role = 'user' | 'assistant';

export type Attachment = {
  name: string;
  kind: 'text' | 'pdf' | 'image' | 'word';
  /** O texto do ficheiro, já lido no anexo (PDFs com pdf.js; imagens e PDFs digitalizados em /api/read). */
  data: string;
  size: number;
};

export type Message = {
  id: string;
  role: Role;
  /** Numa revisão, um resumo em texto: é o que o Leo recebe como contexto nas perguntas seguintes. */
  text: string;
  attachments?: Pick<Attachment, 'name' | 'kind' | 'size'>[];
  error?: boolean;
  /** A avaliação de quem leu a resposta (👍/👎). */
  feedback?: 'up' | 'down';
  /** Presente quando a resposta é a revisão de um CV anexado (como no site). */
  cvReview?: { cvText: string; cvName: string; target: string; review?: Review; full?: FullCv; /** O CV original na estrutura (chega antes da revisão). */ original?: FullCv; error?: string; /** O CV como ficou no editor (texto e desenho). */ edit?: CvEdit; /** O desenho do original (cores, colunas, foto). */ look?: OriginalLook; /** A estrutura do original lida pelo modelo de visão. */ layout?: CvLayoutInfo };
};

export type Conversation = {
  id: string;
  title: string;
  mode: Mode;
  messages: Message[];
  updatedAt: number;
  pinned?: boolean;
};

export type Mode = 'recrutador' | 'candidato';

/** Caráter que o servidor mete no texto da resposta quando o Leo começa a pesquisar na web. */
export const SEARCH_SIGNAL = '\u001e';

/** Corpo enviado para /api/chat. Os anexos só seguem com a mensagem em que foram adicionados. */
export type ChatRequest = {
  mode: Mode;
  /** Pesquisa na web (Groq browser_search). Ligada por omissão. */
  web?: boolean;
  messages: { role: Role; text: string; attachments?: Attachment[] }[];
  /** O que o Leo se lembra desta pessoa (notas e o último CV), quando a memória está ligada. */
  memory?: { notes: string[]; cv?: { name: string; text: string }; applications?: { company: string; role: string; status: string }[] };
};
