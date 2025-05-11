// This data is passed to be used in the replacers. Like a ".env" file.
// I opted to not use .env so it is possible to create custom objects, arrays and logic here.
// You can modify, create or delete any property you want.
const { colors } = require('./theme');

module.exports = {
  user: 'gabriellaines',
  startedProgramming: '10/11/2017',
  repoQuantity: 6,
  header: {
    styles: {
      align: 'center',
      style: 'for-the-badge',
      color: colors.lightSecondary.base,
      logoColor: colors.lightSecondary.over,
    },
    image: {
      src: 'src/resources/images/gabriellaines.png',
      width: 600,
    },
    description: "👋 I'm Gabriel, a brazilian programmer.",
    badges: [
      {
        type: 'badge',
        name: 'twitter',
        href: 'https://twitter.com/xDdgabrielDx',
      },
      {
        type: 'badge',
        name: 'linkedin',
        href: 'https://www.linkedin.com/in/gabriel-alves-dev/',
      },
      {
        type: 'views',
      },
    ],
  },
  aboutme: {
    list: ['* Gabriel Laines, 27 years', '* Full Stack programmer'],
  },
  skillswall: {
    styles: {
      style: 'for-the-badge',
      align: 'left',
      highlightColor: colors.primary,
      wallColors: [colors.secondary, colors.lightSecondary],
    },
    randomOrder: true,
    skills: [
      { name: '', isHighlighted: true },
      { name: '' },
      { name: '', logo: 'angular', isHighlighted: true },
      { name: '' },
      { name: '', isHighlighted: true },
      { name: '' },
      { name: '', isHighlighted: true },
      { name: '' },
      { name: '', logo: 'express', isHighlighted: true },
      { name: '' },
      { name: '', isHighlighted: true },
      { name: '' },
      { name: '', isHighlighted: true },
      { name: '' },
      { name: '', isHighlighted: true },
      { name: '' },
      { name: '', isHighlighted: true },
    ],
  },
  recentworks: {
    styles: {
      title_color: colors.primary.base,
      text_color: colors.secondary.over,
      bg_color: colors.secondary.base,
      border_color: colors.black.base,
      icon_color: colors.secondary.over,
    },
  },
  socialMedias: {
    styles: {
      align: 'left',
      style: 'for-the-badge',
      color: colors.lightSecondary.base,
      logoColor: colors.lightSecondary.over,
    },
    links: [
      {
        name: 'twitter',
        href: 'https://twitter.com/xDdgabrielDx',
      },
      {
        name: 'linkedin',
        href: 'https://www.linkedin.com/in/gabriel-alves-dev/',
      },
      {
        name: 'email',
        logo: 'gmail',
        href: 'mailto:gabrielantonio20111@hotmail.com',
      },
    ],
  },
  githubStats: {
    styles: {
      style: 'for-the-badge',
      align: 'center',
      title_color: colors.primary.base,
      text_color: colors.secondary.over,
      bg_color: colors.secondary.base,
      border_color: colors.black.base,
      show_icons: true,
      icon_color: colors.secondary.over,
      rank_icon: 'github',
    },
  },
};
