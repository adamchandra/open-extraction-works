/**
 * d3-driven drag/click handling
 *
 *  Credit to : http://bl.ocks.org/paradite/71869a0f30592ade5246
 **/

import * as d3 from 'd3';
import 'd3-dispatch';
import 'd3-selection';
import 'd3-drag';
import * as $ from 'jquery';
import * as coords from './coord-sys.js';
import * as util from  './commons.js';
import { globals } from './globals';


export default function awaitUserSelection(d3$svg, initSvgPt, initClientPt) {

    return new Promise((resolve, reject) => {

        let svgSelector = d3$svg.attr('id');
        let originPt = initSvgPt;
        let currentPt = originPt;

        let emptyRect  = { left: originPt.x, top: originPt.y, width: 0, height: 0 };
        let selectionRect = d3$svg.append("rect")
            .call(util.initRect, () => emptyRect)
            .classed("selection", true)
            .attr("rx", 4)
            .attr("ry", 4)
        ;

        update(initSvgPt, initClientPt);

        function update(svgPt, clientPt) {
            globals.currMouseClientPt.x = clientPt.x;
            globals.currMouseClientPt.y = clientPt.y;
            $("li > span#mousepos").text(
                `x: ${clientPt.x}, y: ${clientPt.y} / ${svgSelector} @  ${svgPt.x},${svgPt.y} `
            );

            currentPt = svgPt;
            adjustSelectionRect();
        }

        function getSelectionMinBoundingRect() {
            let ny = Math.min(currentPt.y, originPt.y);
            let nx = Math.min(currentPt.x, originPt.x);
            let nwidth = Math.abs(currentPt.x - originPt.x);
            let nheight = Math.abs(currentPt.y - originPt.y);

            return {left: nx, top: ny, width: nwidth, height: nheight};
        }


        function adjustSelectionRect() {

            let adjusted = getSelectionMinBoundingRect();
            selectionRect
                .call(util.initRect, () => adjusted);
        }


        d3$svg.on("mouseup", function() {
            // return either point or rect
            if (selectionRect != null) {
                selectionRect.remove();
                if (currentPt !== originPt) {
                    d3.event.preventDefault();
                    let mbr = getSelectionMinBoundingRect();
                    mbr.svgSelector = svgSelector;

                    resolve({
                        rect: mbr
                    });

                } else {
                    originPt.svgSelector = svgSelector;
                    resolve({
                        point: {
                            svgSelector: svgSelector,
                            x: originPt.x,
                            y: originPt.y
                        }
                    });

                }

            } else {
                reject("Error");
            }
        });
        d3$svg.on("mousemove", function() {
            if (selectionRect != null) {
                let p = d3.mouse(this);
                let mouseEvent = d3.event;
                let clientPt = coords.mkPoint.fromXy(mouseEvent.clientX, mouseEvent.clientY);
                let clickPt = coords.mkPoint.fromD3Mouse(p);
                update(clickPt, clientPt);
            }
        });

        d3$svg.on("mousedown", function() {});
        d3$svg.on("mouseover", function() {});
        d3$svg.on("mouseout", function() {});
    });
}
