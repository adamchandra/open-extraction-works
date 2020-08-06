import _ from "lodash";
import B from 'blessed';
import * as BB from './blessterm-basics';

interface SplitScreen {
  leftSide: B.Widgets.LayoutElement;
  rightSide: B.Widgets.LayoutElement;
  footerBar: B.Widgets.LayoutElement;
  outerLayout: B.Widgets.LayoutElement;
}

export function splitScreenWithMessageBar(): SplitScreen {
  const outerLayout = BB.layout({
    layout: 'inline',
    border: undefined,
    input: true,
    bg: "#343434",
    top: 4,
    left: 4,
    width: "95%",
    height: "95%",
  });

  const mainContent = BB.layout({
    parent: outerLayout,
    layout: 'inline',
    input: true,
    bg: "#949434",
    top: 1,
    left: 4,
    width: "100%-8",
    height: "100%-5",
  });

  const footerBar = BB.layout({
    parent: outerLayout,
    layout: 'inline',
    border: 'line',
    top: 0,
    left: 2,
    width: "100%-4",
    height: 4,
  });

  const leftSide = BB.layout({
    parent: mainContent,
    layout: 'inline',
    input: true,
    // bg: "#343434",
    top: 0,
    left: 0,
    align: "right",
    width: 10,
    height: "100%-4",
  });

  const rightSide = BB.layout({
    parent: mainContent,
    layout: 'inline',
    // bg: "#434343",
    top: 0,
    left: 0,
    width: "100%-10",
    height: "100%-4",
  });
  return {
    leftSide,
    rightSide,
    footerBar,
    outerLayout,
  }
}
