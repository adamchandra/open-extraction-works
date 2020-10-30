import { arglib } from 'commons';
import { scrapeUrlAndQuit } from './scraper';
import { runLocalSpider } from './spider-service';
const { opt, config, registerCmd } = arglib;

registerCmd(
  arglib.YArgs,
  'scrape-url',
  'spider via puppeteer ...',
  config(
    opt.cwd,
    opt.existingDir('working-directory: root directory for logging/tmpfile/downloading'),
    opt.ion('url', {
      required: true
    })
  )
)((args: any) => {
  const { workingDirectory, url } = args;

  scrapeUrlAndQuit(url)
    .then(() => undefined)
});

registerCmd(
  arglib.YArgs,
  'run-spider',
  'run spider service locally',
  config(
    opt.cwd,
    opt.existingDir('working-directory: root directory for logging/tmpfile/downloading'),
    opt.existingFile('alpha-recs: csv file with alpha records')
  )
)((args: any) => {
  const { workingDirectory, alphaRecs } = args;

  runLocalSpider(
    alphaRecs,
  ).then(() => undefined);

});
