/**
 *
 **/

/* global */

import * as _ from 'lodash';
import * as $ from 'jquery';
import * as d3 from 'd3';

import * as util from  '../lib/commons.js';
import * as frame from '../lib/frame.js';
import {shared} from '../lib/shared-state';
import * as global from '../lib/shared-state';
import * as server from '../lib/serverApi.js';
import * as panes from  '../lib/splitpane-utils.js';
import * as rtrees from  '../lib/rtrees.js';
import {$id} from '../lib/jstags.js';

import * as curate from './curate-main.js';
import * as schema from '../lib/schemas';

import {t} from '../lib/jstags.js';

import * as pageview from '../lib/view-pdf-pages.js';
import * as textview from '../lib/view-pdf-text.js';



function setupFrameLayout() {
    let $contentPane = $('.content-pane');
    $contentPane.append(t.div('#annot-panes'));


    let { leftPaneId, rightPaneId } =
        panes.splitVertical('#annot-panes', {fixedLeft: 200});


    $id(leftPaneId).append(
        t.div('.split-pane-component-inner', [
            t.div('.page-image-viewer')
        ])
    );
    $id(rightPaneId).append(
        t.div('.split-pane-component-inner', [
            t.div('.page-text-viewer', [
                t.div('.reflow-controls #reflow-controls'),
                t.div('.page-textgrids #page-textgrids')
            ])
        ])
    );

}

function curationStatusMenu(status) {
    let codes = [
        'Completed',
        'Assigned',
        'Skipped'
    ];
    let choices = _.map(codes, code => {
        return t.option({selected: status == code, code: code}, code);
    });

    let $menu = t.select("#curation-status", choices) ;

    return $menu;
}

function assignedCurationControlPanel(assignment) {
    let workflowSlug = assignment.zonelock.workflow;
    let btn = curate.assignmentButton(workflowSlug);

    let panel = t.span([
        t.strong(`Curating: `), workflowSlug,
        t.nbsp(5),
        t.strong(`Status: `), curationStatusMenu(assignment.zonelock.status),
        t.nbsp(5),
        t.strong(`Assigned To You`),
        t.nbsp(4),
        btn
    ]);

    return panel;
}


function unassignedCurationControlPanel(assignment) {
    let workflowSlug = assignment.workflowRecord.workflow;
    let btn = curate.assignmentButton(workflowSlug);

    let panel = t.span([
        t.strong(`Curating: `), workflowSlug,
        t.nbsp(5),
        t.strong(`Status: `), assignment.lockRecord.status,
        t.nbsp(4),
        btn
    ]);

    return panel;
}

function curationStatusChange(event, ui) {
    let assignment = shared.activeAssignment;

    let newStatus = ui.item.value;

    // console.log('curationStatusChange', assignment);
    curate.rest.update.status(assignment.zonelock.id, newStatus)
        .then(() => {return {};});
}

function showCurationStatus() {
    let entry = shared.currentDocument;

    curate.rest.read.workflows()
        .then(workflows => { return shared.curations = workflows;})
        .then(() => { return server.apiGet(`/api/v1/workflow/documents/${entry}`); })
        .then(assignments => {
            // _.each(assignments, r => schema.isValid('LockedWorkflow', r));
            schema.allValid('LockedWorkflow')(assignments);
            // console.log('assignments', assignments);
            let assignmentsForCurrentUser  = _.filter(assignments, a => a.holder == shared.loginInfo.id);
            let documentHasCurationStatus = assignments.length > 0;
            let isAssignedToCurrentUser = assignmentsForCurrentUser.length > 0;

            if (documentHasCurationStatus) {
                let assignment = assignments[0];
                if (isAssignedToCurrentUser) {
                    let userAssignment = assignmentsForCurrentUser[0];
                    shared.activeAssignment = userAssignment;
                    let panel = assignedCurationControlPanel(userAssignment);
                    $('.topbar-item-middle').append(panel);
                    $('#curation-status').selectmenu( {
                        change: curationStatusChange
                    });

                } else {
                    let panel = unassignedCurationControlPanel(assignment);
                    $('.topbar-item-middle').append(panel);
                }
            } else {
                // "Uncurated"  + button='label this paper'
                let panel = t.span([
                    t.strong(`Curation Status: Not yet assigned.`),
                ]);
                $('.topbar-item-middle').append((panel));
            }

        }) ;
}

// function setupGrid() {
//     t.div('.fixed-top', [
//         t.div('.topbar', [
//         ]),
//         t.div('.divider'),
//         t.div('.content-pane', [
//             t.div('.frame', [
//                 t.div('.fixed-left', [
//                     t.div('.bottom-left', [
//                     ]),
//                     t.div('.divider'),
//                     t.div('.bottom-right', [
//                         t.div('.reflow-controls'),
//                         t.div('.page-textgrids'),
//                     ])
//                 ])
//             ])
//         ])
//     ]);
// }

export function runMain() {

    frame.setupFrameLayout();

    let entry = util.corpusEntry();

    let bar = entry.foo;

    shared.currentDocument = entry;

    server.getCorpusArtifactTextgrid(entry)
        .then((textGridJson => {
            let pages = textGridJson.pages;
            let textgrids = _.map(pages, p => p.textgrid);
            let pageShapes = _.map(pages, p => p.pageGeometry);

            global.initGlobalMouseTracking();

            setupFrameLayout();

            pageview.setupPageImages('div.page-image-viewer', pageShapes);
            textview.setupPageTextGrids('div.page-textgrids', textgrids);

            rtrees.initPageAndGridRTrees(textgrids);

            d3.selectAll('svg.textgrid')
                .each(function (){
                    let d3$svg = d3.select(this);
                    textview.textgridSvgHandlers(d3$svg);
                });

            showCurationStatus();

        }))
        .catch(error => {
            $('.content-pane').append(`<div><p>ERROR: ${error}: ${error}</p></div>`);
        }) ;

}