//
import B from 'blessed';
import _ from "lodash";
import { createRadioEmmitter } from './blessterm-widgets';



export async function elementFocusingDemoApp(): Promise<void> {

  const emitters = _.map(_.range(1, 10), (i) => {
    const key = `emitter-${i}`;
    const radioEmitter: B.Widgets.FormElement<any> = createRadioEmmitter(key, 3)
    return radioEmitter;
  });

}
