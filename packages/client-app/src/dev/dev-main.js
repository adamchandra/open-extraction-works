/**
 * Dispatch to one of the other main modules
 **/

/* global require $ */

import '../style/app-main.less';

import {shared} from '../client/lib/shared-state';
import * as ReflowWidgetDev from  './reflow-widget.dev';
import * as TextgridWidgetDev from  './TextgridWidgetDev';
// import * as SelectionFilterDev from  './SelectionFilterDev';
import * as PageImageWidgetDev from  './PageImageWidgetDev';
import * as SplitPaneDev from  './split-pane.dev';
import * as jst  from '../client/lib/tstags';
const t = jst.t;


shared.DEV_MODE = true;

function runHome() {
    let pages = t.ul([
        t.li([ t.a('Text Reflow Widget', {href: '/reflow'}) ]),
        t.li([ t.a('Split Pane Toolkit', {href: '/splitpane'}) ]),
        t.li([ t.a('Text Viewer', {href: '/pagetext'}) ]),
        t.li([ t.a('Selection/Narrowing Filter', {href: '/traceview'}) ]),
        t.li([ t.a('Page Image Widget', {href: '/pageimage'}) ])
    ]);

    $('#dev-pages').append(
        pages
    );
}



function dispatch() {

    let path = window.location.pathname;
    let root = path.split("/")[1];

    switch (root) {
    case "":
        runHome();
        break;

    case "reflow":
        ReflowWidgetDev.runReflow();
        break;

    case "splitpane":
        SplitPaneDev.runSplitPane();
        break;

    case "pageimage":
        PageImageWidgetDev.run();
        break;

    case "pagetext":
        TextgridWidgetDev.run();
        break;

    // case "traceview":
    //     SelectionFilterDev.run();
    //     break;

    }

}

dispatch();