import _ from "lodash";
import React from "react";
import { Text, Box, BoxProps } from "ink";

//@ts-ignore
import Divider from 'ink-divider';

interface TitledBoxArgs {
  title: string;
  body: string;
}

export type ModJSX = (fc: JSX.Element) => JSX.Element;
export type StringToJSX = (s: string) => JSX.Element;

// TODO splice the JSX attributes together rather than nesting them
export const dim: ModJSX = e => <Text dimColor>{e}</Text>;
export const dimGray: ModJSX = e => <Text dimColor color="gray">{e}</Text>;
export const gray: ModJSX = e => <Text color="gray">{e}</Text>;
export const bold: ModJSX = e => <Text bold>{e}</Text>;
export const red: ModJSX = e => <Text color="red">{e}</Text>;
export const blue: ModJSX = e => <Text color="blue">{e}</Text>;
export const boldBlue: ModJSX = e => <Text bold color="blue">{e}</Text>;

export function text(s: string): JSX.Element {
  return <Text>{s}</Text>;
}

const objKeyColor: StringToJSX = (key: string) => red(text(key));
const kvSepColor: StringToJSX = (key: string) => dimGray(text(key));

export const Row: React.FC<BoxProps> = (bps) => {
  return <Box {...bps} />;
};
export const Col: React.FC<BoxProps> = (bps) => {
  return <Box flexDirection="column" {...bps} />;
};

export const TitledBox: React.FC<TitledBoxArgs> = ({ title, body }) => {
  return (
    <Col>
      <Divider title={title} />

      <Box marginLeft={4} marginBottom={1} width="80%" height={15} >
        {bold(blue(text(body)))}
      </Box>

    </Col>
  );
};

interface KeyValBoxArgs {
  keyname: string;
  val?: string;
}

export const KeyValBox: React.FC<KeyValBoxArgs> = ({ keyname, val }) => {
  return (
    <Box marginLeft={2} width="80%" height={1} >
      {bold(red(text(keyname)))}
      {bold(blue(text(val ? val : '<none>')))}
    </Box>
  );
};

interface RenderAnyArgs {
  item: any;
  renderOverrides?: RenderOverride[];
  depth: number;
}

export type RenderAnyType = React.FC<RenderAnyArgs>;

export const RenderAnyTruncated: RenderAnyType = ({ item, renderOverrides, depth }) => {
  if (_.isString(item)) {
    let itemstr = item;
    if (item.length > 10) {
      itemstr = item.slice(0, 10) + '...';
    }
    return boldBlue(text(`${itemstr}`));
  }
  if (_.isArray(item)) {
    return (
      <Row>
        {dim(gray(text(`[ len: ${item.length} ]`)))}
      </Row>
    );
  }
  return <RenderAny item={item} depth={depth} renderOverrides={renderOverrides} />;
}

export const RenderAny: React.FC<RenderAnyArgs> = ({ item, renderOverrides, depth }) => {

  const isPrimitive = _.isString(item) || _.isNumber(item) || _.isBoolean(item);

  if (isPrimitive) {
    return boldBlue(text(`${item}`));
  }

  if (_.isNull(item)) {
    return boldBlue(text('null'));
  }

  if (_.isArray(item)) {
    const ritems = _.map(item, (item0, i) => {
      return (
        <Box key={`r-item-${i}`} >
          {dim(gray(text(`${i}.`)))}
          <RenderAny item={item0} renderOverrides={renderOverrides} depth={depth + 1} />
        </Box>
      )
    });
    return (
      <Box flexDirection="column">
        {ritems}
      </Box>
    );
  }
  if (_.isObject(item)) {
    return (
      <RenderRecImpl rec={item} depth={depth} renderOverrides={renderOverrides} />
    );
  }

  return (
    <Box marginLeft={2} marginBottom={0} width="80%" >
      { bold(red(text('UNIMPLEMENTED')))}
    </Box>
  );
};

interface RenderRecImplArgs {
  rec: Record<string, any>;
  renderOverrides?: RenderOverride[];
  depth: number;
}

const [fst, lst, mid, sole] = "╭╰│═".split(''); /*  "┏┗┃═" */

const capitalizeDottedString = (s: string) => {
  return _.map(s.split('.'), k => _.capitalize(k)).join(" ");
};

const RenderRecImpl: React.FC<RenderRecImplArgs> = ({ rec, renderOverrides, depth }) => {
  const asPairs = _.toPairs(rec);
  const longestKeyLen = _.max(_.map(asPairs, ([key]) => key.length));
  const padRight = longestKeyLen || 1;

  const allBoxes = _.map(asPairs, ([key, val], i) => {
    const prefixChar = asPairs.length == 1 ? sole :
      i === 0 ? fst :
        i === asPairs.length - 1 ? lst : mid;

    const overrides = renderOverrides || [];

    const override = overrides.filter(([k,]) => k === key)[0];

    const itemBox = override ?
      override[1]({ item: val, depth: depth + 1 })
      : <RenderAny item={val} depth={depth + 1} renderOverrides={renderOverrides} />;

    const prefix = gray(text(prefixChar));

    const capCaseKey = capitalizeDottedString(key)
      .padEnd(padRight);

    if (_.isArray(val) || _.isObject(val)) {
      return (
        <Box key={`render.rec.${i}`}>
          {prefix}
          <Col>
            {objKeyColor(capCaseKey)}
            <Box marginLeft={2}>
              {itemBox}
            </Box>
          </Col>
        </Box>
      );
    }

    return (
      <Box key={`render.rec.${i}`} >
        {prefix}
        {objKeyColor(capCaseKey)}
        {kvSepColor(' ─> ')}
        {itemBox}
      </Box>
    );
  });

  return (
    <Col width="80%">
      {allBoxes}
    </Col>
  );
};

export type RenderOverride = [string, RenderAnyType];

interface RenderRecArgs {
  rec: any;
  renderOverrides?: RenderOverride[];
}

export const RenderRec: React.FC<RenderRecArgs> = ({ rec, renderOverrides }) => {
  return <RenderRecImpl rec={rec} depth={0} renderOverrides={renderOverrides} />
}
