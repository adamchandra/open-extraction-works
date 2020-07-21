import _ from "lodash";
import B from 'blessed';
import { createScreen, appFrame } from './blessterm-widgets';
import { layoutTreeWithInlineControls, layoutTreeAndMarginalControls } from './records-bterm';

const sampleRec2: Record<string, any> = {
  quux: [
    {
      alpha: {
        omega: 1,
        juliet: "Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.",
      },
      crux: null,
      crax: undefined,
      gamma: {
        romeo: "Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.",
        houses: 2,
      },
      baz: [
        {
          alpha: 'alpha',
          beta: 33,
        },
        'alpha',
        false,
      ]
    }
  ],
  bar: "some bar value",
};


const sampleRec4 = {
  evidence: null,
  value1: "Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.",
  value2: "Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo ",
};


export async function promisifyBlessedApp(f: (screen: B.Widgets.Screen) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const screen = createScreen();
    try {
      f(screen);
      resolve();
    } catch (e) {
      screen.destroy();
      reject(e);
    }
  });
}

export async function runMainUI(): Promise<void> {
  return promisifyBlessedApp((screen) => {
    screen.title = 'Q/A Interactive Review';
    const frame = appFrame();
    screen.append(frame);

    const recLayout = layoutTreeAndMarginalControls(sampleRec2);

    frame.append(recLayout);
    recLayout.focus();

    // Quit on Escape, q, or Control-C.
    screen.key(
      ['escape', 'q', 'C-c'],
      (_ch: string, _key: B.Widgets.Events.IKeyEventArg) => {
        screen.destroy();
        process.exit();
      });

    // Render the screen.
    screen.render();
  });
}


runMainUI();
