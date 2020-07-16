import _ from "lodash";
import { ExpandedDir } from "commons";
import B from 'blessed';
import path from "path";

import { readExtractionRecord } from '~/extract/abstracts/extract-abstracts';
// import { resolveCachedNormalFile } from '~/extract/core/field-extract';
// import { updateCorpusJsonFile, readCorpusJsonFile, listCorpusArtifacts } from '~/corpora/corpus-file-walkers';
// import { initGroundTruthEntry, GroundTruthLog, initGroundTruthLog } from '~/extract/core/ground-truth-records';
import { openFileWithLess, openFileWithBrowser } from '~/qa-editing/view-files';
import { appFrame, createScreen, textDivBox } from './blessterm-widgets';
import { layoutTreeWithInlineControls } from './records-bterm';
import { bold, red, blue } from './text-styling';

const openWithLess = (filename: string) => () => {
  openFileWithLess(filename);
  // .then(() => setRedraws(i => i + 1));
};

const openWithBrowser = (filename: string) => () => {
  openFileWithBrowser(filename);
  // .then(() => setRedraws(i => i + 1));
};



export async function interactiveUIAppMain(entryPath: ExpandedDir): Promise<void> {

  const screen = createScreen();

  return new Promise((resolve, reject) => {
    try {
      const extractionRecord = readExtractionRecord(entryPath.dir);

      screen.title = 'Q/A Interactive Review';
      const frame = appFrame();
      screen.append(frame);

      const headerLine1 = textDivBox(bold(red('--- Entry ----')));
      const headerLine2 = textDivBox(bold(blue(path.basename(entryPath.dir))));
      headerLine1.top = 1;
      headerLine2.top = 2;

      frame.append(headerLine1);
      frame.append(headerLine2);

      const treeWithControls = layoutTreeWithInlineControls(extractionRecord);
      treeWithControls.top = 4;
      treeWithControls.left = 2;

      frame.append(treeWithControls);
      screen.sendFocus

      screen.key(
        ['escape', 'q', 'C-c'],
        (_ch: string, _key: B.Widgets.Events.IKeyEventArg) => {
          screen.destroy();
          process.exit();
        });
      screen.key(
        ['j'],
        (_ch: string, _key: B.Widgets.Events.IKeyEventArg) => {
          screen.focusNext();
        });

      screen.key(
        'k',
        (_ch: string, _key: B.Widgets.Events.IKeyEventArg) => {
          screen.focusPrevious();
        });

      screen.key('n', () => {
        screen.destroy();
        resolve();
      });

      screen.render();
    } catch (e) {
      screen.destroy();
      reject(e);
    }
  });
}
