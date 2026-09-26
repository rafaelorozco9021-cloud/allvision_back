export const sources = [
  {
    name: 'El Tiempo',
    domain: 'https://www.eltiempo.com',
    baseUrl: 'https://www.eltiempo.com',
    feedUrl: 'https://www.eltiempo.com/rss/colombia.xml',
    frequencyMinutes: 30,
    selectors: {
      list: 'article',
      title: 'h2, h3',
      link: 'a',
      image: 'img',
      body: 'p',
    },
    rssEnabled: true,
  },
  {
    name: 'El Heraldo',
    domain: 'https://www.elheraldo.co',
    baseUrl: 'https://www.elheraldo.co',
    feedUrl: 'https://www.elheraldo.co/arc/outboundfeeds/rss/',
    frequencyMinutes: 30,
    selectors: {
      list: '.featured-story-card',
      title: 'h1, h2, h3, h4',
      link: 'a.ingl-link',
      image: 'img',
      body: 'p',
    },
    rssEnabled: true,
  },
  {
    name: 'El Espectador',
    domain: 'elespectador.com',
    baseUrl: 'https://www.elespectador.com',
    feedUrl: 'https://news.google.com/rss/search?q=site:elespectador.com&hl=es-419&gl=CO&ceid=CO:es-419',
    frequencyMinutes: 30,
    selectors: {
      list: '.Card-HomeEE',
      title: 'h2, h3',
      link: 'a',
      image: 'img',
      body: 'p',
    },
    rssEnabled: false,
  },
  {
    name: 'Zona Cero',
    domain: 'zonacero.com',
    baseUrl: 'https://zonacero.com',
    feedUrl: 'https://zonacero.com/rss.xml',
    frequencyMinutes: 30,
    selectors: {
      list: '.view-ultimas-noticas-home .views-row',
      title: 'h2, h3',
      link: 'a',
      image: 'img',
      body: 'p',
    },
    rssEnabled: false,
  },
  {
    name: 'Semana',
    domain: 'https://www.semana.com',
    baseUrl: 'https://www.semana.com',
    feedUrl: 'https://www.semana.com/arc/outboundfeeds/rss/',
    frequencyMinutes: 30,
    selectors: {
      list: 'article',
      title: 'h2, h3',
      link: 'a',
      image: 'img',
      body: 'p',
    },
    rssEnabled: true,
  },
  {
    name: 'La Patilla',
    domain: 'lapatilla.com',
    baseUrl: 'https://lapatilla.com',
    feedUrl: 'https://lapatilla.com/feed',
    frequencyMinutes: 30,
    selectors: {
      list: 'article',
      title: 'h2, h3',
      link: 'a',
      image: 'img',
      body: 'p',
    },
    rssEnabled: false,
  },
  {
    name: 'El Nacional',
    domain: 'https://www.elnacional.com',
    baseUrl: 'https://www.elnacional.com',
    feedUrl: 'https://www.elnacional.com/feed',
    frequencyMinutes: 30,
    selectors: {
      list: 'article',
      title: 'h2, h3',
      link: 'a',
      image: 'img',
      body: 'p',
    },
    rssEnabled: true,
  },
  {
    name: 'Noticia al Dia',
    domain: 'noticialdia.com',
    baseUrl: 'https://noticialdia.com',
    feedUrl: 'https://noticialdia.com/feed',
    frequencyMinutes: 30,
    selectors: {
      list: 'article',
      title: 'h2, h3',
      link: 'a',
      image: 'img',
      body: 'p',
    },
    rssEnabled: true,
  },
];

export interface SourceConfig {
  name: string;
  domain: string;
  baseUrl: string;
  feedUrl: string;
  frequencyMinutes: number;
  selectors: {
    list: string;
    title: string;
    link: string;
    image: string;
    body: string;
  };
  rssEnabled: boolean;
}
