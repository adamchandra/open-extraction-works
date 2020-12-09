import { arglib, putStrLn } from 'commons';
import { insertNewUrlChains } from '~/db/db-api';
import { insertNewAlphaRecords } from './spider-service';
import { fetchAllDBRecords } from './workflow-services';
const { opt, config, registerCmd } = arglib;

registerCmd(
  arglib.YArgs,
  'insert-alpha-records',
  'Insert new Alpha Records (as CSV) into database',
  config(
    opt.cwd,
    opt.existingFile('alpha-recs: csv file with alpha records')
  )
)(async (args: any) => {
  const { alphaRecs } = args;
  putStrLn(`importing alphaRecs from ${alphaRecs}`);

  await insertNewAlphaRecords(alphaRecs);

  putStrLn('Updated UrlChains for Spidering');
  await insertNewUrlChains()

  putStrLn('Done');
});

registerCmd(
  arglib.YArgs,
  'spider-new-alpha-records',
  'Run spider against new UrlChain records',
  config(
    opt.ion('take', {
      type: 'number',
      required: false,
      default: 0
    }),
  )
)(async (args: any) => {
  const { take } = args;
  const maxToTake: number = take;

  const isDone = await fetchAllDBRecords(maxToTake);
  putStrLn(`Done=${isDone}`);
});
