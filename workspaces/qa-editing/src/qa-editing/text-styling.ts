import _ from "lodash";
import wrapAnsi from 'wrap-ansi';

export interface SimpleStyledText {
  kind: 'simple';
  text: string;
  fg: [number, number, number];
  bg: [number, number, number];
  mods: string[];
  render: () => string;
}

export interface CompoundStyledText {
  kind: 'compound';
  stexts: StyledText[];
  render: () => string;
}

export type StyledText = SimpleStyledText | CompoundStyledText;

export interface StyledTextFoldCases<A> {
  onSimple: (v: SimpleStyledText) => A;
  onCompound: (v: CompoundStyledText, as: A[]) => A;
}


export function mapStyledText(
  styledText: StyledText,
  cases: Partial<StyledTextFoldCases<StyledText>>
): StyledText {
  const empty: StyledTextFoldCases<StyledText> = {
    onSimple: (s) => s,
    onCompound: (s) => s,
  }
  const cs = _.merge({}, empty, cases);
  switch (styledText.kind) {
    case "simple": return cs.onSimple(styledText);
    case "compound": return cs.onCompound(styledText, []);
  }
}

export function foldStyledText<A>(
  styledText: StyledText,
  cases: StyledTextFoldCases<A>
): A {
  switch (styledText.kind) {
    case "simple": return cases.onSimple(styledText) ;
    case "compound": {
      const stas = styledText.stexts
        .map(st => foldStyledText<A>(st, cases));
      return cases.onCompound(styledText, stas);
    }
  }
}


export type ModStyle = (fc: string | StyledText) => StyledText;
export type StringToJSX = (s: string) => string;

export function text(s: string): StyledText {
  return {
    kind: 'simple',
    text: s,
    fg: [255, 255, 255],
    bg: [0, 0, 0],
    mods: [],
    render: function() { return renderStyledText(this); }
  };
}

export const styled: ModStyle = e => _.isString(e) ? text(e) : e;

export const mod = (st: StyledText, f: (s: StyledText) => StyledText): StyledText => {
  return f(_.clone(st));
};

export const dim: ModStyle = e => mod(styled(e), (stext: StyledText) => {
  const clamp0 = (n: number) => Math.max(0, n);
  const dimPercent = (n: number) => n - (0.2 * n)
  const clampDim = (n: number) => clamp0(Math.floor(dimPercent(n)));
  return mapStyledText(stext, {
    onSimple: (st) => {
      const [r, g, b] = st.fg;
      st.fg = [clampDim(r), clampDim(g), clampDim(b)];
      return st;
    }
  })
});

// export const rgb: (rbgHex: string) => ModStyle = rgbHex => e => {
//   parseInt()
//   mod(styled(e), (stext: StyledText) => {
// }

// TODO these should be wrappers, evaluated lazily
export const blue: ModStyle = e => mod(styled(e), (stext: StyledText) => {
  return mapStyledText(stext, {
    onSimple: (st) => {
      st.fg = [0, 0, 255];
      return st;
    }
  });
});
export const red: ModStyle = e => mod(styled(e), (stext: StyledText) => {
  return mapStyledText(stext, {
    onSimple: (st) => {
      st.fg = [255, 0, 0];
      return st;
    }
  });
});

export const gray: ModStyle = e => mod(styled(e), (stext: StyledText) => {
  return mapStyledText(stext, {
    onSimple: (st) => {
      st.fg = [128, 128, 128];
      return st;
    }
  });
});

export const bold: ModStyle = e => mod(styled(e), (stext: StyledText) => {
  return mapStyledText(stext, {
    onSimple: (st) => {
      st.mods.push('{bold}');
      return st;
    }
  });
});


export function renderStyledText(styledText: StyledText): string {
  return foldStyledText(styledText, {
    onSimple: (st) => {
      const t = st.text;
      const mods = st.mods.join('');
      const fg = _.map(st.fg, c => c.toString(16).padStart(2, '0')).join('');
      const bg = _.map(st.bg, c => c.toString(16).padStart(2, '0')).join('');
      const color = `{#${fg}-fg}{#${bg}-bg}`;
      const end = '{/}';
      return `${mods}${color}${t}${end}`;
    },
    onCompound: (_st, stas) => stas.join(''),
  });
}

export function textLength(styledText: StyledText): number {
  return foldStyledText<number>(styledText, {
    onSimple: (st) => st.text.length,
    onCompound: (_st, stas) => stas.length === 0? 0 : _.sum(stas),
  });
}

export function appendStyledTexts(stext1: StyledText, ...stexts: StyledText[]): StyledText {
  return concatStyledText([stext1, ...stexts]);
}
export function concatStyledText(stexts: StyledText[]): StyledText {
  return {
    kind: 'compound',
    stexts,
    render: function() { return renderStyledText(this); }
  };
}

export function wrapStyledText(width: number, styledText: StyledText): StyledText[] {

  const flatTexts = foldStyledText<string[]>(styledText, {
    onSimple: (st) => [ st.text ],
    onCompound: (_st, stas) => _.flatten(stas),
  });
  const combined = flatTexts.join('');
  const wrappedLines = wrapAnsi(combined, width).split('\n');
  return _.map(wrappedLines, l => text(l));
}

// export const dimGray: ModStyle  = e =>
// export const gray: ModStyle     = e =>
// export const bold: ModStyle     = e =>
// export const wrap: ModStyle     = e =>
// export const red: ModStyle      = e =>
// export const blue: ModStyle     = e =>
// export const boldBlue: ModStyle = e =>
