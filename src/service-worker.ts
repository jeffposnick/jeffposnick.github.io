import {CacheFirst, NetworkOnly} from 'workbox-strategies';
import {cacheNames} from 'workbox-core';
import {cleanupOutdatedCaches, getCacheKeyForURL, precacheAndRoute} from 'workbox-precaching';
import {ExpirationPlugin} from 'workbox-expiration';
import {initialize as initializeOfflineAnalytics} from 'workbox-google-analytics';
import {registerRoute, setCatchHandler} from 'workbox-routing';
import {RouteHandlerCallbackOptions} from 'workbox-core/types';
import {skipWaiting} from 'workbox-core';
import nunjucks from 'nunjucks/browser/nunjucks';

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

async function getPrecachedResponse(url: string) {
  const cacheKey = getCacheKeyForURL(url);
  if (!cacheKey) {
    throw new Error(`${url} is not in the precache manifest.`);
  }

  const cache = await caches.open(cacheNames.precache);
  const cachedResponse = await cache.match(cacheKey);
  if (!cachedResponse) {
    throw new Error(`${url} is not precached.`);
  }

  return cachedResponse;
}

const CacheStorageLoader = nunjucks.Loader.extend({
  async: true,

  getSource: async function(name: string, callback: Function) {
    try {
      const path = `/_posts/_includes/${name}`;
      const cachedResponse = await getPrecachedResponse(path);
      const src = await cachedResponse.text();
      callback(null, {src, path, noCache: false});
    } catch(error) {
      callback(error);
    }
  }
});

const nunjucksEnv = new nunjucks.Environment(
  new CacheStorageLoader()
);

let _site: {string: any};
async function getSiteData() {
  if (!_site) {
    const siteDataResponse = await getPrecachedResponse('/_posts/_data/site.json');
    _site = await siteDataResponse.json();
  }

  return _site;
}

const postHandler = async (options: RouteHandlerCallbackOptions) => {
  const {params} = options;
  if (!(params && Array.isArray(params))) {
    throw new Error(`Couldn't get parameters from router.`);
  }

  const site = await getSiteData();

  // params[3] corresponds to post.fileSlug in 11ty.
  const cachedResponse = await getPrecachedResponse(`/_posts/${params[3]}.json`);

  const context = await cachedResponse.json();
  context.site = site;
  context.content = context.html;

  const html: string = await new Promise((resolve, reject) => {
    nunjucksEnv.render(
      context.layout,
      context,
      (error: Error | undefined, html: string) => {
        if (error) {
          return reject(error);
        }
        return resolve(html);
      }
    );
  }); 

  const headers = {
    'content-type': 'text/html',
  };
  return new Response(html, {headers});
};

registerRoute(
  new RegExp('/(\\d{4})/(\\d{2})/(\\d{2})/(.+)\\.html'),
  postHandler
);

registerRoute(
  new RegExp('/assets/images/'),
  new CacheFirst({
    cacheName: 'images',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 20,
      }),
    ],
  })
);

// If anything goes wrong when handling a route, return the network response.
setCatchHandler(new NetworkOnly());

initializeOfflineAnalytics();

skipWaiting();