export const SITE = {
  name: 'Reforma Caseira',
  tagline: 'Pesquisamos • Comparamos • Indicamos',
  description:
    'Guias de compra de ferramentas para reformas, marcenaria amadora e pequenos consertos. Pesquisamos specs reais, avaliações de compradores e reclamações para indicar as melhores opções com custo-benefício real.',
  url: 'https://reformacaseira.com.br',
  locale: 'pt-BR',
  author: 'Márcio Costa',
  email: 'contato@reformacaseira.com.br',
  social: {
    instagram: '',
    youtube: '',
  },
} as const;

// Editor responsável — usado em E-E-A-T (Person schema, caixa de autor)
export const AUTHOR = {
  name: 'Márcio Costa',
  role: 'Editor responsável',
  bio: 'Criou a Reforma Caseira para ajudar quem encara reformas e marcenaria amadora a escolher ferramentas sem cair em listas genéricas. Cada recomendação passa pela metodologia de pesquisa do site: especificações oficiais, avaliações reais de compradores e checagem de reclamações.',
  url: 'https://reformacaseira.com.br/sobre/',
} as const;

// Rede de sites do mesmo autor (disclosure honesta na página Sobre / caixa de autor).
export const NETWORK = [
  {
    name: 'Abanou',
    url: 'https://abanou.com.br',
    blurb: 'Reviews de produtos para cães e gatos.',
  },
  {
    name: 'Nerd Caseiro',
    url: 'https://nerdcaseiro.com.br',
    blurb: 'Automação, gadgets e impressão 3D pra sua casa.',
  },
] as const;
