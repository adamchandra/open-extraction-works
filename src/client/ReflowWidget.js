/**
 *
 **/

/* global require _ d3 watr */

import * as util from  './commons.js';
import * as coords from './coord-sys.js';
import { t } from './jstags.js';
import { $id, resizeCanvas } from './jstags.js';
import * as lbl from './labeling';

// import * as textgrid from './textgrid';
import * as gp from './graphpaper';
import * as rtreeapi from './rtree-api';
import * as colors from './colors';

const GraphPaper = watr.utils.GraphPaper;
const ProxyGraphPaper = watr.utils.ProxyGraphPaper;
const Options = watr.utils.Options;
const Labels = watr.watrmarks.Labels;
const LTBounds = watr.geometry.LTBounds_Companion;
const TGC = new watr.textgrid.TextGridConstructor();
const JsArray = watr.utils.JsArray;
const TGI = watr.textgrid.TextGridInterop;


export class ReflowWidget {

    constructor (containerId, textGrid, labelSchema) {

        let gridNum = 1000;
        this.containerId = containerId;
        this.gridNum = gridNum;
        this.textGrid = textGrid; // .trimRights().padRights();
        this.textHeight = 20;
        this.labelSchema = labelSchema;

        this.frameId  = `textgrid-frame-${gridNum}`;
        this.canvasId = `textgrid-canvas-${gridNum}`;
        this.svgId    = `textgrid-svg-${gridNum}`;
    }



    init () {

        return new Promise((resolve) => {
            let initWidth = 800;
            let gridHeight = 1000; // this.gridBounds.bottom;

            let gridNodes =
                t.div(`.textgrid #${this.frameId}`, {style: `width: ${initWidth}px; height: ${gridHeight}px;`}, [
                    t.canvas(`.textgrid #${this.canvasId}`, {page: this.gridNum, width: initWidth, height: gridHeight})
                ]) ;

            $id(this.containerId).append(gridNodes);

            this.d3$textgridSvg = d3.select('#'+this.frameId)
                .append('svg').classed('textgrid', true)
                .datum(this.textGrid.gridData)
                .attr('id', `${this.svgId}`)
                .attr('page', this.gridNum)
                .attr('width', initWidth)
                .attr('height', gridHeight)
                .call(() => resolve())
            ;

        }).then(() => {
            return this.redrawAll();
        });

    }

    updateDomNodeDimensions() {
        return new Promise((resolve) => {
            let height = (this.rowCount+2) * this.cellHeight;
            let width = (this.colCount+2) * this.cellWidth;
            let frameStyle = {
                style: `width: ${width}px; height: ${height}px;`
            };
            $id(this.frameId).css(frameStyle);

            $id(this.canvasId)
                .attr('width', width)
                .attr('height', height);

            this.d3$textgridSvg
                .attr('width', width)
                .attr('height', height)
                .call(() => resolve())
            ;
        });
    }

    applyCanvasStripes() {
        let canvas = document.getElementById(this.canvasId);
        let ctx = canvas.getContext('2d');

        let rowWidth = this.cellWidth * (this.colCount+8);
        _.each(_.range(this.rowCount+10), row =>{
            let rtop = row * this.cellHeight;
            let h = this.cellHeight;

            let grd=ctx.createLinearGradient(0,rtop,0,rtop+h);
            grd.addColorStop(0, colors.Color.GhostWhite);
            grd.addColorStop(0.9, colors.Color.Linen);
            grd.addColorStop(1, colors.Color.Cornsilk);

            ctx.fillStyle=grd;
            ctx.fillRect(0, rtop, rowWidth, this.cellHeight);
        });
    }

    redrawAll() {

        let rtreeApi = new rtreeapi.RTreeApi();
        let gridProps = TGC.textGridToWidgetGrid(this.textGrid, this.labelSchema, 2, 2);
        let rowCount = gridProps.getGridRowCount();
        let colCount = gridProps.getGridColCount();

        this.rowCount = rowCount;
        this.colCount = colCount;
        let drawingApi = new gp.DrawingApi(this.canvasId, this.textHeight);
        this.canvasGraphPaper = new ProxyGraphPaper(colCount, rowCount, drawingApi);
        let cellDimensions = this.canvasGraphPaper.cellDimensions();
        this.cellWidth = cellDimensions.width;
        this.cellHeight = cellDimensions.height;

        this.updateDomNodeDimensions().then(() => {
            this.applyCanvasStripes();
            TGC.writeTextGrid(gridProps, this.canvasGraphPaper, rtreeApi);
            this.reflowRTree = rtreeApi.rtree;

            let allClasses = TGI.labelSchemas.allLabels(this.labelSchema);
            let colorMap = _.zipObject(allClasses, colors.HighContrast);

            console.log('allClasses', allClasses);
            this.d3$textgridSvg
                .selectAll(`rect`)
                .remove();

            _.each(this.reflowRTree.all(), data => {
                let region = data.region;
                let bounds = region.bounds;
                let scaled = this.scaleLTBounds(bounds);
                let classes = TGI.gridRegions.labels(region);

                let regionType;
                if (region.isLabelKey()) {
                    regionType = 'LabelKey';
                } else if (region.isCell()) {
                    regionType = 'Cell';
                } else if (region.isLabelCover()) {
                    regionType = 'LabelCover';
                } else if (region.isHeading()) {
                    regionType = 'Heading';
                }
                let cls = classes[classes.length-1];

                if (! region.isCell()) {
                    this.d3$textgridSvg
                        .append('rect')
                        .classed(`${regionType}`, true)
                        .classed(`${cls}`, true)
                        .call(util.initRect, () => scaled)
                        .call(util.initFill, colorMap[cls], 0.4)
                    ;
                }
            });

            this.initMouseHandlers();

        });

    }


    // graphCellToIndexBounds(graphCell) {
    //     return coords.mk.fromLtwh(
    //         graphCell.left*4, graphCell.top*4,
    //         ((graphCell.spanRight-1)*4),
    //         ((graphCell.spanDown-1)*4)
    //     );
    // }

    // graph4x4BoundsToGraphBox(graph4x4Bounds) {
    //     console.log(graph4x4Bounds, 'graph4x4Bounds');
    //     let l = graph4x4Bounds.left / 4;
    //     let t = graph4x4Bounds.top / 4;
    //     let w = graph4x4Bounds.width / 4;
    //     let h = graph4x4Bounds.height / 4;
    //     let bounds = LTBounds.FromInts(l, t, w, h);
    //     return GraphPaper.boundsToBox(bounds);
    // }

    // indexBoundsToGraphBox(indexBounds) {
    //     let originX = Math.floor(indexBounds.x / this.cellWidth);
    //     let originY = Math.floor(indexBounds.y / this.cellHeight);
    //     return coords.mk.fromLtwh(
    //         graphCell.left*4, graphCell.top*4,
    //         ((graphCell.spanRight-1)*4),
    //         ((graphCell.spanDown-1)*4)
    //     );
    // }

    // indexBoundsToQueryBounds(indexBounds) {
    //     return coords.mk.fromLtwh(
    //         indexBounds.left+1, indexBounds.top+1,
    //         indexBounds.spanRight-1,
    //         indexBounds.spanDown-1
    //     );
    // }

    graphCellToClientBounds(graphCell) {
        // Construct a query box that aligns with grid
        let cellLeft = graphCell.x * this.cellWidth;
        let cellTop = graphCell.y * this.cellHeight;
        return coords.mk.fromLtwh(cellLeft, cellTop, this.cellWidth, this.cellHeight);
    }

    // getGraphBoundsFromBox(cellBox) {
    //     // Construct a query box that aligns with grid
    //     let cellLeft = cellCoords.x * this.cellWidth;
    //     let cellTop = cellCoords.y * this.cellHeight;
    //     let bounds = coords.mk.fromLtwh(
    //         cellBox.left*4+1, cellBox.top*4+1,
    //         ((cellBox.spanRight-1)*4)-1,
    //         ((cellBox.spanDown-1)*4)-1
    //     );
    //     return coords.mk.fromLtwh(cellLeft, cellTop, this.cellWidth, this.cellHeight);
    // }


    clientPointToGraphCell(clientPt) {
        let cellCol = Math.floor(clientPt.x / this.cellWidth);
        let cellRow = Math.floor(clientPt.y / this.cellHeight);
        return coords.mkPoint.fromXy(cellCol, cellRow);
    }

    scaleLTBounds(bb) {
        let x = bb.left*this.cellWidth;
        let y = bb.top* this.cellHeight;
        let w = bb.width * this.cellWidth;
        let h = bb.height* this.cellHeight;
        return coords.mk.fromLtwh(x, y, w, h);
    }

    getCellContent(graphCell) {
        let reflowRTree = this.reflowRTree;
        // RTree cells are 4x4 for indexing purposes, this query is centered within the cell (not touching the edges)
        let rtreeQuery = coords.mk.fromLtwh(graphCell.x*4+1, graphCell.y*4+1, 1, 1);
        let cellContent = reflowRTree.search(rtreeQuery);
        if (cellContent.length > 1) {
            console.error("more than one thing found at grid cell ", graphCell);
        }
        return cellContent[0];
    }

    getBoxContent(cellBox) {
        return this.reflowRTree.search(
            coords.mk.fromLtwh(
                cellBox.left*4+1, cellBox.top*4+1,
                ((cellBox.spanRight+1)*4)-2,
                ((cellBox.spanDown+1)*4)-2
            )
        );
    }


    getCellNum(graphCell) {
        return graphCell.y * this.rowCount + graphCell.x;
    }



    initMouseHandlers() {
        let widget = this;
        widget.hoverCell = null;

        this.d3$textgridSvg.on("mousemove", function() {
            let userPt = coords.mkPoint.fromD3Mouse(d3.mouse(this));

            let graphCell = widget.clientPointToGraphCell(userPt);
            let cellContent = widget.getCellContent(graphCell);

            graphCell.id = widget.getCellNum(graphCell);

            if (widget.hoverCell != null) {
                if (graphCell.id != widget.hoverCell.id) {
                    widget.hoverCell = graphCell;
                    widget.updateCellHoverHighlight(graphCell);
                }
            } else {
                widget.hoverCell = graphCell;
                widget.updateCellHoverHighlight(graphCell);
            }

            if (cellContent) {
                if (cellContent.region.isCell()) {
                    // let pins = c.region['cell$1'];
                    // console.log(pins.showPinsVert().toString());
                }
                widget.showLabelHighlights(cellContent);
            } else {
                widget.clearLabelHighlights();
            }

        });

        this.d3$textgridSvg.on("mousedown",  function() {
            let mouseEvent = d3.event;
            let userPt = coords.mkPoint.fromD3Mouse(d3.mouse(this));

            let graphCell = widget.clientPointToGraphCell(userPt);
            console.log('mousedown:graphCell', graphCell);
            let cellContent = widget.getCellContent(graphCell);

            if (cellContent && cellContent.region.isLabelCover()) {

                let classes = TGI.gridRegions.labels(cellContent.region);
                console.log('cellContent', classes);
                // let focalBox = GraphPaper.boundsToBox(cellContent.region.bounds);
                // let focalBox = widget.graph4x4BoundsToGraphBox(cellContent.region.bounds);
                let focalBox = GraphPaper.boundsToBox(LTBounds.FromInts(
                    cellContent.region.bounds.left,
                    cellContent.region.bounds.top,
                    cellContent.region.bounds.width,
                    cellContent.region.bounds.height
                ));
                let boxRight = focalBox.shiftOrigin(1, 0);
                let contentRight = widget.getBoxContent(boxRight);
                let contentFocus = widget.getBoxContent(focalBox);

                // let regionsRight = _.map(contentRight, c => c.region.classes.join(',')).join(' && ');
                // let regionsFocus = _.map(contentFocus, c => c.region.classes.join(',')).join(' && ');
                let queryRight = boxRight.modifySpan(widget.colCount, 0);
                let rightContents = widget.getBoxContent(queryRight);
                let rightCells0 = _.filter(rightContents, c => c.region.isCell());

                let rightCells = _.map(rightCells0, r => r.region);
                console.log('rightCells', rightCells);

            }

            if (cellContent && cellContent.region.isCell()) {
                let row = cellContent.region.row;
                let col = cellContent.region.col;

                if (mouseEvent.shiftKey) {
                    let maybeGrid = widget.textGrid.slurp(row);
                    let newGrid = Options.getOrElse(maybeGrid, widget.textGrid);
                    widget.textGrid = newGrid;

                    widget.redrawAll();
                } else if (mouseEvent.ctrlKey) {
                    let maybeGrid = widget.textGrid.split(row, col);
                    let newGrid = Options.getOrElse(maybeGrid, widget.textGrid);
                    widget.textGrid = newGrid;

                    widget.redrawAll();
                } else {

                    let focalClasses = TGI.gridRegions.labels(cellContent.region);
                    let focalLabel = _.last(focalClasses);
                    let childLabels = widget.labelSchema.childLabelsFor(focalLabel);
                    lbl.createLabelChoiceWidget(childLabels, widget.containerId)
                        .then(choice => {
                            let labelChoice = choice.selectedLabel;
                            widget.textGrid.labelRow(row, Labels.forString(labelChoice));
                            widget.redrawAll();
                        })
                        .catch(err => {
                            console.log('err', err);
                        }) ;

                }
            }})
        ;

    }

    updateCellHoverHighlight(hoverGraphCell) {
        this.d3$textgridSvg
            .selectAll('.cell-focus')
            .remove() ;

        this.d3$textgridSvg
            .append('rect')
            .classed('cell-focus', true)
            .call(util.initRect, () => this.graphCellToClientBounds(hoverGraphCell))
            .call(util.initStroke, 'blue', 1, 0.4)
            .call(util.initFill, 'yellow', 0.4)
        ;
    }

    clearLabelHighlights() {
        _.each(['LabelCover', 'Heading', 'Cell', 'LabelKey'], cls => {
            this.d3$textgridSvg
                .selectAll(`rect.${cls}`)
                .attr('fill-opacity', 0.4)
            ;
        });
    }

    showLabelHighlights(cell) {
        let classes = TGI.gridRegions.labels(cell.region);
        let cls = classes[classes.length-1];
        // console.log('hovering', classes);

        if (cell.region.isLabelCover() || cell.region.isHeading()) {
            this.clearLabelHighlights();
            this.d3$textgridSvg
                .selectAll(`rect.${cls}`)
                .attr('fill-opacity', 0.6)
            ;
        }
        else if (cell.region.isLabelKey()) {
            this.clearLabelHighlights();
            this.d3$textgridSvg
                .selectAll(`rect.${cls}`)
                .attr('fill-opacity', 0.6)
            ;
        }

    }
}
