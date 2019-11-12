
import _ from 'lodash';
import * as rbush from "rbush";

import {
  coords,
  utils,
  mk,
  GridTypes,
  Point,
  BBox
} from "sharedLib";

export type Width = number;
export type MeasureTextWidth = (ch: string) => Width;


export interface GridCellData {
  row: number;
  col: number;
  page: number;
}

export interface GlyphCellData {
  glyphBounds: BBox;
  page: number;
}


export interface TextDataPoint extends rbush.BBox {
  id: number;
  char: string;
  glyphData?: GlyphCellData;
  gridCell: GridCellData;

  gridBBox: BBox;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;

}

export interface GridData {

  textDataPoints: TextDataPoint[];
  maxLineWidth: number;
  totalLineHeight: number;

}

export function gridDataToGlyphData(
  textDataPoints: TextDataPoint[]
): TextDataPoint[] {
  const dataPoints = _.map(textDataPoints, (t: TextDataPoint) => {
    const bbox = t.glyphData ?
      t.glyphData.glyphBounds
      : new coords.BBox(0, 0, 0, 0, coords.CoordSys.Unknown);

    const updated: TextDataPoint = {
      ...t,
      minX: bbox.minX,
      minY: bbox.minY,
      maxX: bbox.maxX,
      maxY: bbox.maxY
    };
    return updated;
  });

  return dataPoints;
}


export function initGridData(
  textgrid: GridTypes.Textgrid,
  gridNum: number,
  measureTextWidth: MeasureTextWidth,
  gridTextOrigin: Point,
  gridTextHeight: number
): GridData {

  const idGen = utils.newIdGenerator();

  let maxLineWidth = 0;
  let totalLineHeight = 0;

  const gridRowsDataPts = _.map(textgrid.rows, (gridRow, rowNum) => {

    const y = gridTextOrigin.y + ((rowNum+1) * gridTextHeight);
    const x = gridTextOrigin.x;
    const text = gridRow.text;
    let currLeft = x;

    const gridDataPts = _.map(text.split(''), (ch, chi) => {
      const chWidth = measureTextWidth(ch);
      const charLocus = gridRow.loci[chi];

      const gridDataPt = mk.fromLtwh(
        currLeft, y-gridTextHeight, chWidth, gridTextHeight
      );

      const textCellData = {
        row: rowNum,
        col: chi,
        page: gridNum
      };

      const textDataPoint: TextDataPoint = {
        id: idGen(),
        char: ch,
        gridCell: textCellData,
        gridBBox: gridDataPt,
        minX: gridDataPt.minX,
        minY: gridDataPt.minY,
        maxX: gridDataPt.maxX,
        maxY: gridDataPt.maxY
      };

      const isGlyphData = GridTypes.locusIsGlyph(charLocus); // .g !== undefined;

      if (isGlyphData) {
        const charBBox = charLocus.g![0][2];
        textDataPoint.glyphData = {
          glyphBounds: mk.fromArray(charBBox),
          page: charLocus.g![0][1]
        };
      }

      currLeft += chWidth;

      maxLineWidth = Math.max(maxLineWidth, currLeft);
      totalLineHeight = y + gridTextHeight;

      return textDataPoint;
    });

    return gridDataPts;
  });

  const textDataPoints = _.flatten(gridRowsDataPts);

  return {
    textDataPoints,
    maxLineWidth,
    totalLineHeight
  };

}