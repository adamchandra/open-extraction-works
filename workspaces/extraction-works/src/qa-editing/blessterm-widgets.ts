/**
  * Note: Type checking is turned off in this file because neo-blessed/neo-blessed-contrib don't have
  * typescript .d.ts files available. When they do, the ts-nocheck should be turned off.
 */
import _ from "lodash";
import B from 'blessed';
import * as BB from './blessterm-basics';
import ansiEscapes from 'ansi-escapes';
import { StyledText } from './text-styling';


export function clearScreen(): void {
  process.stdout.write(ansiEscapes.clearTerminal);
  process.stdout.write(ansiEscapes.clearScreen);
}

export function textDivBox(content: string | StyledText):  B.Widgets.BoxElement {
  const c = _.isString(content) ? content : content.render();
  const b = BB.box({
    tags: true,
    width: '100%',
    height: 1,
  });
  b.setContent(c);
  return b;
}

export function appFrame(): B.Widgets.BoxElement {
  return BB.box({
    width: '100%',
    height: '100%',
    style: {
      fg: 'white',
      border: {
        fg: '#f0f0f0'
      },
      hover: {
        bg: 'green'
      }
    }
  });
}

export function createScreen(): B.Widgets.Screen {
  return BB.screen({
    smartCSR: true
  });
}


const defaultIndicators = [
  '○',
  '✓',
  '✗',
  '⚑',
  '●',
];

export function createRadios(
  setOpts: B.Widgets.RadioSetOptions,
  buttonOpts: B.Widgets.RadioButtonOptions[]
): [B.Widgets.RadioSetElement, B.Widgets.RadioButtonElement[]] {

  const radioSet = BB.radioset(setOpts);

  let currLeft = 0;
  const buttons = _.map(buttonOpts, (o, bi) => {
    const buttonOpts = _.merge({}, {
      left: currLeft,
      mouse: true,
      keys: true,
      top: 0,
      height: 1,
      shrink: true,
    }, o);

    const radio = BB.radiobutton(buttonOpts);

    const isFirst = bi === 0;
    const prefix = " ";
    const suffix = " ";

    currLeft += prefix.length + suffix.length + 1;

    if (isFirst) {
      radio.checked = true;
    }

    // Override the default rendering
    radio.render = function() {
      // @ts-ignore
      this.clearPos(true);
      // const indicator = this.checked? defaultIndicators[bi] : ' ';
      const indicator = defaultIndicators[bi];
      const content = `${prefix}${indicator}${suffix}`;
      const isChecked = this.checked;

      this.style.fg = isChecked ? '#ffffff' : '#343434';
      this.style.bg = isChecked ? '#0000ff' : '#442222';
      this.style.bold = isChecked;

      // @ts-ignore
      this.setContent(content, /* no-clear= */false, /* no-tags= */true);
      // @ts-ignore
      return this._render();
    }
    radioSet.append(radio);
    return radio;
  });
  return [radioSet, buttons];
}

export function createRadioEmmitter(
  id: string,
  radioCount: number
): B.Widgets.FormElement<any> {
  const fopts = {
    width: '100%',
    input: true,
    // keys: true,
    height: 1,
    style: {
      bg: "red",
      focus: {
        bg: "yellow"
      }
    }
  };
  const emitterForm = BB.form(fopts);
  const emitterLayout = BB.layout({
    parent: emitterForm, layout: 'inline',
    top: 0, left: `100%-${radioCount*3}-1`, width: "shrink", height: "100%",
    style: {
      bg: "red"
    }
  });

  const buttonOpts = _.map(_.range(radioCount), radioNum => {
    return {
      input: false,
      keys: false,
      name: `radio-${radioNum}`
    }
  });

  const [radioSet, buttons] = createRadios({
    parent: emitterLayout,
  }, buttonOpts);

  _.each(buttons, (button, i) => {
    button.on('check', () => {
      emitterForm.emit('radio-select', { id, check: true, button: i });
    });
    button.on('uncheck', () => {
      emitterForm.emit('radio-select', { id, check: false, button: i });
    });
  });

  return emitterForm;
}
