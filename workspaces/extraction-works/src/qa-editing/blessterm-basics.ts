// @ts-nocheck

/**
  * Note: Type checking is turned off in this file because neo-blessed/neo-blessed-contrib don't have
  * typescript .d.ts files available. When they do, the ts-nocheck should be turned off.
 */
import _ from "lodash";
import B from 'blessed';
import blessed from 'neo-blessed';

export function box(opts: B.Widgets.BoxOptions): B.Widgets.BoxElement {
  return blessed.box(opts);
}

export function screen(opts: B.Widgets.IScreenOptions): B.Widgets.Screen {
  return blessed.screen(opts);
}

export function listtable(opts: B.Widgets.ListTableOptions): B.Widgets.ListTableElement {
  return blessed.listtable(opts);
}

export function checkbox(opts: B.Widgets.CheckboxOptions): B.Widgets.CheckboxElement {
  return blessed.checkbox(opts);
}

export function layout(opts: B.Widgets.LayoutOptions): B.Widgets.LayoutElement {
  return blessed.layout(opts);
}


export function form(opts: B.Widgets.FormOptions): B.Widgets.FormElement {
  return blessed.form(opts);
}

export function radioset(opts: B.Widgets.RadioSetOptions): B.Widgets.RadioSetElement {
  return blessed.radioset(opts);
}

export function radiobutton(opts: B.Widgets.RadioButtonOptions): B.Widgets.RadioButtonElement {
  return blessed.radiobutton(opts);
}
