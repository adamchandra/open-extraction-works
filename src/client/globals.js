/**
 * A spot for the (hopefully few) application-wide variables
 * Also, setup mouse tracking over named dom elements.
 *
 *  note: event page/client/screen/offset explanations:
 *       https://stackoverflow.com/questions/6073505/what-is-the-difference-between-screenx-y-clientx-y-and-pagex-y
 **/

import * as $ from 'jquery';
// import * as _ from 'lodash';
import Rx from 'rxjs/Rx';
import * as coords from './coord-sys.js';

export let globals = {

    currentDocument: undefined,

    currMouseClientPt: {x: -1, y: -1},

    dataPts: [],

    documentAnnotations: {},

    annotationLabels: {},

    currentSelections: [],

    rx: {
        selections: new Rx.Subject()
    }

};

export function setSelections(sels) {
    globals.currentSelections = sels;
    globals.rx.selections.next(sels);
}


export function initGlobalMouseTracking() {
    globals.rx.clientPt = Rx.Observable
        .fromEvent(document, 'mousemove')
        .map(event => {
            let clientPt = coords.mkPoint.fromXy(event.clientX, event.clientY);
            globals.currMouseClientPt = clientPt;
            return clientPt;
        }) ;

}
