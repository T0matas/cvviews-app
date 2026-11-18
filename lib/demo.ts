import type { Mode } from './types';

const DEMO_NOTE = '\n\n> Resposta de demonstração — configura `GROQ_API_KEY` para ligar a IA.';

export function demoReply(message: string, mode: Mode, hasAttachment: boolean) {
  const text = message.toLocaleLowerCase('pt-PT');

  if (hasAttachment) {
    return `Recebi o ficheiro. Numa análise real, eu iria:

1. **Resumir o perfil** — experiência, funções e duração de cada etapa.
2. **Mapear competências** — técnicas e transversais, com a evidência de onde aparecem.
3. **Comparar com os requisitos** — o que está demonstrado, o que é parcial e o que falta confirmar.
4. **Sugerir perguntas** para a entrevista sobre os pontos em aberto.

Nada disto substitui a leitura humana: cada sugestão deve ser revista.${DEMO_NOTE}`;
  }

  if (text.includes('compar') || text.includes('vaga')) {
    return `Para comparar perfis de forma consistente:

- **Separe requisitos essenciais** de competências desejáveis.
- **Registe evidências observáveis** para cada critério, em vez de impressões.
- **Use a mesma grelha** para todas as candidaturas.
- **Valide numa conversa** o que o currículo deixa em aberto.

Quer que prepare uma grelha para uma função específica?${DEMO_NOTE}`;
  }

  if (text.includes('compet')) {
    return `Comece por definir as competências realmente necessárias para o trabalho e distinga:

| Tipo | Exemplo | Como confirmar |
| --- | --- | --- |
| Obrigatória | SQL avançado | Exercício prático |
| Desejável | Experiência com BI | Pergunta na entrevista |
| Desenvolvível | Liderança de equipa | Exemplos de projetos |

Procure exemplos concretos de aplicação e use os mesmos critérios para todos.${DEMO_NOTE}`;
  }

  if (mode === 'candidato' || text.includes('currículo') || text.includes('curriculo') || text.includes('cv')) {
    return `Algumas formas de tornar um currículo mais claro:

- **Comece pelo impacto**: "Reduzi o tempo de resposta em 30%" diz mais do que "Responsável pelo apoio ao cliente".
- **Adapte à vaga**: destaque primeiro as competências que o anúncio pede.
- **Seja concreto**: ferramentas, dimensão das equipas, resultados.
- **Mantenha-o legível**: uma a duas páginas, secções consistentes.

Pode anexar o seu currículo e eu sugiro melhorias específicas.${DEMO_NOTE}`;
  }

  return `Posso ajudar a organizar critérios de seleção, resumir currículos, preparar perguntas de entrevista ou melhorar o seu próprio CV.

Experimente, por exemplo:
- "Cria uma grelha de avaliação para um Product Designer"
- "Que perguntas devo fazer sobre liderança?"
- Anexar um currículo em PDF ou TXT${DEMO_NOTE}`;
}
