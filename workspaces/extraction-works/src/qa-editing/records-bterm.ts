import _ from "lodash";
import B from 'blessed';
import * as BB from './blessterm-basics';
import { toQualifiedPaths, QualifiedPath, ObjectPath, toObjectPath } from '~/qa-review/to-pairs-deep';
// import { createListTable, createForm, createCheckBox, createLayout, createRadios, textDivBox, createRadioEmmitter } from './blessterm-widgets';
import { blue, red, bold, StyledText, text, dim, gray, concatStyledText, wrapStyledText, textLength, appendStyledTexts } from './text-styling';
import { textDivBox, createRadioEmmitter } from './blessterm-widgets';
import { splitScreenWithMessageBar } from './blessterm-layouts';


export function renderAnyVal(item: any): StyledText {
  if (_.isString(item)) return blue(item);

  const isNumOrBool = _.isNumber(item) || _.isBoolean(item);

  if (isNumOrBool) return red(`${item}`);
  if (_.isNull(item)) return bold(blue('null'));
  if (_.isUndefined(item)) return bold(blue('undef'));

  return bold(blue('UNIMPLEMENTED'));
}


export function layoutTreeWithInlineControls<T>(inputRec: T): B.Widgets.LayoutElement {
  const qualifiedPaths = toQualifiedPaths(inputRec);

  const { leftSide, rightSide, footerBar, outerLayout } = splitScreenWithMessageBar();

  const messageArea = textDivBox('<messages>');

  footerBar.append(messageArea);

  _.each(qualifiedPaths, (qpath) => {
    const qpathRender = renderQualifiedPath(qpath);
    if (qpathRender.length > 0) {
      const [kpath] = qpath;
      const localKey = kpath.map(p => p.key).join(".");
      const shouldHaveCheckbox = /(count|exists|value|errors\.\d+)/.test(localKey);
      if (shouldHaveCheckbox) {
        const radioEmitter: B.Widgets.FormElement<any> = createRadioEmmitter(localKey, 3)
        leftSide.append(radioEmitter);

        radioEmitter.on('radio-select', (data: any) => {
          const dbg = _.toPairs(data).map(([k, v]) => `${k}: ${v}`).join(', ');
          messageArea.setContent(dbg);
        });

        radioEmitter.focus();
      } else {
        const filler = textDivBox('');
        leftSide.append(filler);
      }

      _.each(qpathRender, (qpathLine, i) => {
        const rline = textDivBox(qpathLine);
        rightSide.append(rline);
        if (i > 0) {
          const filler = textDivBox('...');
          leftSide.append(filler);
        }
      });
    }
  });

  return outerLayout;
}


export function layoutMarginalControls(qualifiedPaths: QualifiedPath[]): QualifiedLayoutLine[] {
  return _.map(qualifiedPaths, (qpath) => {
    const objPathArray = toObjectPath(qpath);
    const localKey = objPathArray.join(".");
    const shouldHaveControl = /(count|exists|value|errors\.\d+)/.test(localKey);
    if (shouldHaveControl) {
      const radioEmitter: B.Widgets.FormElement<any> = createRadioEmmitter(localKey, 3)
      return [objPathArray, radioEmitter]
    }
    return [objPathArray, undefined]
  });
}

export function layoutTreeAndMarginalControls<T>(inputRec: T): B.Widgets.LayoutElement {
  const qualifiedPaths = toQualifiedPaths(inputRec);

  const { leftSide, rightSide, footerBar, outerLayout } = splitScreenWithMessageBar();

  const messageArea = textDivBox('<messages>');

  footerBar.append(messageArea);

  leftSide.style.bg = '#586e75';
  rightSide.style.bg = '#93a1a1';

  const qpRecordLayout = layoutQualifiedPaths(qualifiedPaths);
  const qpControlLayout = layoutMarginalControls(qualifiedPaths);
  _.each(
    _.zip(qpControlLayout, qpRecordLayout),
    ([ctrlLayout, recLayout], linenum) => {
      const ctrl = ctrlLayout? ctrlLayout[1] : undefined;
      const rec = recLayout? recLayout[1] : undefined;
      if (ctrl) {
        ctrl.top = linenum;
        ctrl.left = 0;
        ctrl.width = '100%';
        ctrl.height = 1;
        leftSide.append(ctrl);
      }
      if (rec) {
        rec.top = linenum;
        rec.left = 0;
        rec.width = '100%';
        rec.height = 1;
        rightSide.append(rec);
      }
    }
  );
  // const filler = textDivBox('...');
  // leftSide.append(filler);
  return outerLayout;
}

// type QualifiedLayoutLine = Readonly<[ObjectPath, number, B.Widgets.Node | undefined]>;
type QualifiedLayoutLine = Readonly<[ObjectPath, B.Widgets.BlessedElement | undefined]>;

export function layoutQualifiedPaths(qualifiedPaths: QualifiedPath[]): QualifiedLayoutLine[] {
  return _.map(qualifiedPaths, (qpath) => {
    const objPathArray = toObjectPath(qpath);
    const renderedPathLines = renderQualifiedPath(qpath);
    const col = BB.box({});
    _.each(renderedPathLines, (l, lnum) => {
      const tbox = textDivBox(l);
      tbox.top = lnum;
      // tbox.width = "100%";
      col.append(tbox)
    });
    return [objPathArray, col]
  });
}

function renderQualifiedPath(qpath: QualifiedPath): string[] {

  const [fst, lst, mid, sole] = "╭╰│═".split(''); /*  "┏┗┃═" */

  const [kpath, item] = qpath;
  const hasValue = qpath.length === 2;
  const parentPath = kpath.slice(0, kpath.length - 1);

  const indentIndicators0: StyledText[] = _.map(parentPath, (pathPart) => {

    const { key, n, sibs } = pathPart;
    const isLast = n === sibs - 1;
    const isSolo = sibs === 1;
    const isNotEnd = !(isLast || isSolo);

    const isArrayIndex = /^\d+$/.test(key);

    if (isArrayIndex) {
      return text('');
    }
    const prefix = isNotEnd ? mid : ' ';

    return appendStyledTexts(
      dim(gray(prefix)),
      text('    ')
    );
  });

  const indentIndicators = indentIndicators0.length > 0 ?
    concatStyledText(indentIndicators0) : text('');

  const valueLines: StyledText[] = hasValue ? wrapStyledText(180, renderAnyVal(item)) : [];

  const appendValueLines = (l: StyledText): StyledText[] => {
    if (valueLines.length === 0) {
      return [l];
    }

    if (valueLines.length === 1) {
      return [appendStyledTexts(l, text('  '), valueLines[0])];
    }
    const firstLine = appendStyledTexts(l, text('  '), valueLines[0]);
    const continuedLines = valueLines.slice(1);
    const len = textLength(l);
    const indictorsLen = textLength(indentIndicators);
    const padding = text('  ' + ''.padStart(len - indictorsLen));
    const paddedVLines = _.map(continuedLines, vl => {
      return appendStyledTexts(
        indentIndicators,
        padding, vl
      )
    });
    return [firstLine, ...paddedVLines];
  }

  const keyPath = _.last(kpath);
  if (keyPath) {
    const { key, n, sibs, pathType } = keyPath;
    const isFirst = n === 0;
    const isLast = n === sibs - 1;
    const isSolo = sibs === 1;

    if (pathType === 'array') {
      if (!hasValue) return [];

      const res = appendValueLines(
        appendStyledTexts(indentIndicators, dim(gray(`${n}.`)))
      );
      return _.map(res, r => r.render());
    }

    const prefixChar = isSolo ? sole
      : isFirst ? fst
        : isLast ? lst
          : mid;

    const capitalizeDottedString = (s: string) => {
      return _.map(s.split('.'), k => _.capitalize(k)).join(" ");
    };
    const capCaseKey = capitalizeDottedString(key);

    const res = appendValueLines(
      appendStyledTexts(indentIndicators, dim(gray(`${prefixChar} `)), red(bold(`${capCaseKey}`)), text(' ->'))
    );
    return _.map(res, r => r.render());
  }

  const res = appendValueLines(indentIndicators);
  return _.map(res, r => r.render());
}
