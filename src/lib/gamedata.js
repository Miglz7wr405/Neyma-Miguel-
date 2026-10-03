// Lightweight content for couple games (Portuguese).

export const TRUTHS = [
  'Qual foi o momento em que percebeste que gostavas mesmo de mim?',
  'O que mais te atrai em mim fisicamente?',
  'Tens algum sonho que ainda não me contaste?',
  'Qual foi o teu primeiro pensamento quando me viste?',
  'O que te faz sentir mais amado(a) por mim?',
  'Já tiveste ciúmes de alguém meu? De quem?',
  'Qual é a tua recordação favorita nossa?',
  'O que gostarias de fazer comigo que ainda não fizemos?',
  'Qual música te faz lembrar de mim?',
  'O que mais sentes falta quando estou longe?',
  'Qual é a tua fantasia de encontro perfeito connosco?',
  'Há algo que queres mudar na nossa relação?',
  'Qual foi a mentira mais fofa que me contaste?',
  'O que te deixa com borboletas na barriga?',
  'Em que lugar do mundo gostarias de me beijar?',
];

export const DARES = [
  'Manda uma mensagem de voz a dizer o que mais amas em mim.',
  'Envia uma selfie a fazer o teu olhar mais apaixonado.',
  'Escreve um pequeno poema sobre nós (2 linhas).',
  'Diz três coisas que te fazem feliz nesta relação.',
  'Descreve o nosso futuro juntos em 3 frases.',
  'Manda um áudio a cantar a nossa música.',
  'Faz uma declaração de amor em 10 palavras.',
  'Envia um emoji que descreve o que sentes agora e explica.',
  'Conta uma coisa que querias ter-me dito há tempos.',
  'Descreve o beijo perfeito que queres dar-me.',
  'Diz o que farias se estivéssemos juntos agora.',
  'Manda uma foto de algo que te lembra de mim.',
];

export const COUPLE_QUESTIONS = [
  'Se pudéssemos viajar amanhã, para onde íamos?',
  'Qual é a nossa maior força como casal?',
  'Que tradição gostarias de criar só nossa?',
  'Como imaginas o nosso aniversário de namoro ideal?',
  'Qual filme nos descreve como casal?',
  'O que é, para ti, um dia perfeito comigo?',
  'Que pequeno gesto meu te faz o dia melhor?',
  'Se tivéssemos um lema de casal, qual seria?',
  'O que aprendeste sobre o amor por estarmos juntos?',
  'Qual é o teu sonho que queres que eu faça parte?',
  'Como te vês comigo daqui a 5 anos?',
  'Que nome fofo gostavas que eu te chamasse?',
];

export const WOULD_YOU_RATHER = [
  ['Um jantar romântico em casa', 'Um encontro surpresa fora'],
  ['Abraços o dia todo', 'Beijos o dia todo'],
  ['Viajar pela praia', 'Viajar pela montanha'],
  ['Maratona de filmes', 'Noite a dançar'],
  ['Pequeno-almoço na cama', 'Jantar à luz das velas'],
  ['Mensagens o dia todo', 'Uma chamada longa à noite'],
  ['Férias na cidade', 'Férias no campo'],
  ['Cozinhar juntos', 'Pedir comida e relaxar'],
  ['Passeio de mãos dadas', 'Colo no sofá'],
  ['Música romântica', 'Música animada'],
  ['Surpresas', 'Planos combinados'],
  ['Praia ao nascer do sol', 'Praia ao pôr do sol'],
];

export function pick(arr) {
  return Math.floor(Math.random() * arr.length);
}
