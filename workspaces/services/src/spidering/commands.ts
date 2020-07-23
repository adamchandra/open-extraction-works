import { arglib } from 'commons';
import { scrapeUrlAndQuit } from './scraper';
const { opt, config, registerCmd } = arglib;

registerCmd(
  arglib.YArgs,
  "scrape-url",
  "spider via puppeteer testing...",
  config(
    opt.cwd,
    opt.existingDir("working-directory: root directory for logging/tmpfile/downloading"),
    opt.ion("url", {
      required: true
    })
  )
)((args: any) => {
  const { workingDirectory, url } = args;

  scrapeUrlAndQuit(workingDirectory, url)
    .then(() => undefined)
});
