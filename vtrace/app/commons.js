/* global define  location */

define(['/js/d3.js', '/js/underscore-min.js'], function (d3) {

    let colorMap = {
        "Caption"                : "blue",
        "Image"                  : "brown",
        "CharRun"                : "chocolate",
        "CharRunBegin"           : "purple",
        "CharRunBaseline"        : "purple",
        "FontBaseline"           : "blue",
        "LeftAlignedCharCol"     : "crimson",
        "RightAlignedCharCol"    : "darkorchid",
        "LeftAlignedColEnd"      : "darkred",
        "HPageDivider"           : "darksalmon",
        "ColLeftEvidence"        : "darkturquoise",
        "ColRightEvidence"       : "firebrick",
        "PageLines"              : "green",
        "HLinePath"              : "indianred",
        "VLinePath"              : "khaki",
        "LinePath"               : "lavender",
        "OutlineBox"             : "magenta"
    } ;

    // Define the div for the tooltip
    let tooltipDiv = d3.select("body").append("div")
        .attr("class", "tooltip")
        .style("opacity", 0);

    function addTooltip(r) {
        return r.on("mouseover", function(d) {
            if (d.class != undefined) {
                tooltipDiv.transition()
                    .duration(100)
                    .style("opacity", .9);
                tooltipDiv.html( d.class + "::" + getId(d) )
                    .style("left", (d3.event.pageX) + "px")
                    .style("top", (d3.event.pageY - 28) + "px");
            }
        })
            .on("mouseout", function(d) {
                if (d.class != undefined) {
                    tooltipDiv.transition()
                        .transition()
                        .delay(3000)
                        .duration(1000)
                        .style("opacity", 0);
                }
            });

    }



    function getSelectionText() {
        let text = "";
        if (window.getSelection) {
            text = window.getSelection().toString();
        } else if (document.selection && document.selection.type != "Control") {
            text = document.selection.createRange().text;
        }
        return text;
    }

    function dataToColor(d) {
        if (d.stroke !== undefined) {
            return d.stroke;
        } else if (d.class === undefined) {
            return "black";
        } else {
            return colorMap[d.class];
        }
    }

    function setDefaultStrokeColor(d) {
        return dataToColor(d);
    }
    function setDefaultFillColor(d) {
        return dataToColor(d);
    }

    function getId(data) {
        let shape = data.type;

        if (data.id != undefined) {
            return data.id;
        } else {
            switch (shape) {
            case "rect":
                return "r_" + data.x + "_" + data.y + "_" + data.width + "_" + data.height;
            case "circle":
                return "c_" + data.cx + "_" + data.cy + "_" + data.r ;
            case "line":
                return "l_" + data.x1 + "_" + data.y1 + "_" + data.x2 + "_" + data.y2 ;
            }
        }
        return "";
    }


    function getCls(data) {
        let cls = "shape";
        if (data.class != undefined) {
            cls = cls + " " + data.class;
        }
        if (data.hover) {
            cls = cls + " hover";
        }

        return cls;

    }


    function initShapeAttrs(r) {
        let shape = r.node().nodeName.toLowerCase();

        switch (shape) {
        case "rect":
            return r.attr("x", function(d){ return d.x; })
                .attr("y", function(d){ return d.y; })
                .attr("width", function(d){ return d.width; })
                .attr("height", function(d){ return d.height; })
                .attr("id", getId)
                .attr("class", getCls)
                .attr("opacity", 0.1)
                .attr("fill-opacity", 0.1)
                .attr("stroke-opacity", 0.9)
                .attr("stroke-width", 1)
                .attr("fill",  setDefaultFillColor)
                .attr("stroke", "green")
                .call(addTooltip)
            ;

        case "circle":
            return r.attr("cx", function(d){ return d.cx; })
                .attr("cy", function(d){ return d.cy; })
                .attr("r", function(d){ return d.r; })
                .attr("id", getId)
                .attr("class", getCls)
                .attr("fill-opacity", 0.2)
                .attr("stroke-width", 1)
                .attr("fill",  setDefaultFillColor)
                .attr("stroke", setDefaultStrokeColor)
                .call(addTooltip)
            ;

        case "line":
            return r.attr("x1", function(d){ return d.x1; })
                .attr("y1", function(d){ return d.y1; })
                .attr("x2", function(d){ return d.x2; })
                .attr("y2", function(d){ return d.y2; })
                .attr("id", getId)
                .attr("class", getCls)
                .attr("fill-opacity", 0.2)
                .attr("stroke-width", 1)
                .attr("fill",  setDefaultFillColor)
                .attr("stroke", setDefaultStrokeColor)
                .call(addTooltip)
            ;
        case "image":
            return r.attr("x", function(d){ return d.x; })
                .attr("y", function(d){ return d.y; })
                .attr("width", function(d){ return d.width; })
                .attr("height", function(d){ return d.height; })
                .attr("href", function(d){ return '/entry/'+corpusEntry()+'/image/page/'+d.page; })
                .attr("stroke-width", 1)
                .attr("stroke", "black")
                .attr("opacity", 0.3)
            ;
        };

        return r;
    }

    function corpusEntry() {
        let entry = location.href.split('/').reverse()[1];
        return entry;
    }

    function corpusLogfile() {
        let entry = location.href.split('/').reverse()[0];
        return entry;
    }

    return {
        getSelectionText: getSelectionText,
        initShapeAttrs: initShapeAttrs,
        corpusEntry: corpusEntry,
        corpusLogfile: corpusLogfile
    };



});
