import getParsedFrontmatterForUrl from './get-parsed-frontmatter-for-url.js';
import Liquid from 'liquid-node';
import loadYaml from './load-yaml.js';
import MarkdownIt from 'markdown-it';
import NetworkFileSystem from './network-file-system.js';

const markdown = new MarkdownIt({html: true});
let liquidEngine = new Liquid.Engine();
liquidEngine.fileSystem = new NetworkFileSystem();

const urlPrefix = 'https://raw.githubusercontent.com/jeffposnick/jeffposnick.github.io/master/';//'http://localhost:8000/';

export default async function jekyllBehavior(url, currentContent='', pageState={}) {
  const siteConfig = await loadYaml(urlPrefix + '_config.yml');
  const parsedFrontmatter = await getParsedFrontmatterForUrl(urlPrefix + url);

  const content = url.match(/\.(?:markdown|md)$/) ?
    markdown.render(parsedFrontmatter.content) :
    parsedFrontmatter.content;

  const parsedTemplate = await liquidEngine.parse(content);

  const accumulatedPageState = Object.assign(pageState, parsedFrontmatter.data);
  const renderedTemplate = await parsedTemplate.render({
    site: siteConfig,
    content: currentContent,
    page: accumulatedPageState
  });

  if (parsedFrontmatter.data && parsedFrontmatter.data.layout) {
    const layoutUrl = `_layouts/${parsedFrontmatter.data.layout}.html`;
    return jekyllBehavior(layoutUrl, renderedTemplate, accumulatedPageState);
  }

  return new Response(renderedTemplate, {
    headers: {'content-type': 'text/html'}
  });
}
