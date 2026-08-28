module.exports = function (userId) {
  return {
    id: 'org.stremio.simkladdon',
    version: '1.0.0',
    name: 'Simkl Sync',
    description: "Your Simkl watched history and plan-to-watch list for movies and TV shows",
    logo: 'https://simkl.in/img_favicon/dark-fav32.png',
    resources: ['catalog'],
    types: ['movie', 'series'],
    idPrefixes: ['tt'],
    catalogs: [
      {
        type: 'movie',
        id: 'simkl-movies-watched',
        name: 'Simkl - Movies Watched'
      },
      {
        type: 'movie',
        id: 'simkl-movies-plantowatch',
        name: 'Simkl - Movies Plan to Watch'
      },
      {
        type: 'series',
        id: 'simkl-shows-watched',
        name: 'Simkl - TV Shows Watched'
      },
      {
        type: 'series',
        id: 'simkl-shows-plantowatch',
        name: 'Simkl - TV Shows Plan to Watch'
      }
    ],
    behaviorHints: {
      configurable: false,
      configurationRequired: false
    }
  };
};
